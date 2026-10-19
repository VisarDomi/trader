import { GRAVEYARD_CATEGORY, type GraveyardEntry, type GraveyardRun, type RunMetrics } from '@trader/shared';
import { ArenaDB, RUN_KIND, type RunRow } from './db.ts';
import { isShadow } from './pipeline.ts';
import { ENGINE_VERSION } from '../engine/version.ts';

const UNKNOWN_REASON = 'Reason not recorded';
function archivedRun(row: RunRow): GraveyardRun {
  const extra = row.extra ? JSON.parse(row.extra) : {};
  const metrics = row.metrics ? JSON.parse(row.metrics) as RunMetrics : null;
  return {
    id:row.id, kind:row.kind, epic:row.epic, leverage:row.leverage, capital:row.capital, equity:row.equity,
    windowId:row.window_id, startedAt:row.started_at, endedAt:row.ended_at,
    reason:extra.retirement?.reason ?? extra.demotionReason ?? UNKNOWN_REASON,
    engineVersion:extra.engineVersion ?? null,
    metrics:metrics ? {trades:metrics.trades,totalReturn:metrics.totalReturn,sharpe:metrics.sharpe,maxDrawdown:metrics.maxDrawdown} : null,
  };
}

/** Read-only index of preserved versions. Comparison copies never inflate strategy statistics. */
export function graveyard(db: ArenaDB): GraveyardEntry[] {
  const agents = new Map(db.agents().map(a => [a.id,a]));
  const groups = new Map<string, GraveyardEntry>();
  const versions = new Map<string, Set<string>>();
  const group = (agentId: string, codeHash: string): GraveyardEntry => {
    const key = `${agentId}:${codeHash}`;
    let entry = groups.get(key);
    if (!entry) {
      const a = agents.get(agentId);
      if (!versions.has(agentId)) versions.set(agentId, new Set(db.agentVersions(agentId).map(v => v.code_hash)));
      entry = {key,agentId,name:a?.name ?? agentId,codeHash,
        category:!a?.active ? GRAVEYARD_CATEGORY.AGENT : codeHash !== a.code_hash ? GRAVEYARD_CATEGORY.VERSION : GRAVEYARD_CATEGORY.RUNS,
        hasSource:versions.get(agentId)!.has(codeHash),startedAt:0,endedAt:null,runs:[],backtests:[],comparisonRuns:0};
      groups.set(key,entry);
    }
    return entry;
  };
  for (const r of db.runs(RUN_KIND.DEMO,true)) {
    if (!r.retired) continue;
    const entry = group(r.agent_id,r.code_hash);
    if (isShadow(r.id)) entry.comparisonRuns++;
    else entry.runs.push(archivedRun(r));
    entry.startedAt = Math.min(entry.startedAt || r.started_at,r.started_at);
    entry.endedAt = Math.max(entry.endedAt ?? 0,r.ended_at ?? 0) || null;
  }
  for (const a of agents.values()) if (!a.active) group(a.id,a.code_hash);
  for (const r of db.runs(RUN_KIND.BACKTEST,true)) {
    const a = agents.get(r.agent_id);
    if (!r.retired && a?.active && r.code_hash === a.code_hash) continue;
    const entry = groups.get(`${r.agent_id}:${r.code_hash}`) ?? (!a?.active || r.retired || r.code_hash !== a.code_hash ? group(r.agent_id,r.code_hash) : undefined);
    if (entry) {
      entry.backtests.push(archivedRun(r));
      const retirement = r.extra ? JSON.parse(r.extra).retirement : null;
      if (retirement?.at) entry.endedAt = Math.max(entry.endedAt ?? 0,retirement.at);
    }
  }
  for (const entry of groups.values()) {
    if (!entry.startedAt) entry.startedAt = agents.get(entry.agentId)?.first_seen ?? 0;
    const history = [...entry.runs,...entry.backtests];
    if (entry.category === GRAVEYARD_CATEGORY.RUNS && history.length && history.every(r => r.leverage === null))
      entry.category = GRAVEYARD_CATEGORY.PLATFORM;
    if (entry.category === GRAVEYARD_CATEGORY.RUNS && !entry.runs.length && entry.backtests.some(r => r.engineVersion !== ENGINE_VERSION))
      entry.category = GRAVEYARD_CATEGORY.PLATFORM;
    entry.runs.sort((a,b) => (b.endedAt ?? 0)-(a.endedAt ?? 0) || a.epic.localeCompare(b.epic));
  }
  return [...groups.values()].sort((a,b) => (b.endedAt ?? 0)-(a.endedAt ?? 0) || a.name.localeCompare(b.name));
}
