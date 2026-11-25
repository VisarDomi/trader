/**
 * Lifecycle review of the live demo arena — the babysitter's starting point
 * (see agents/LIFECYCLE.md).
 *
 *   bun run review          markdown report
 *   bun run review --json   the same data as JSON
 *
 * Reads the arena API (ARENA_URL, loopback) and applies the
 * shared lifecycle policy (packages/shared/src/lifecycle.ts): health, capacity,
 * verdict counts, confirmed records and candidates, runs and agents to retire.
 */
import type { ArenaEvent, ArenaStatus, BrokerStatus, LeaderboardRow } from '@trader/shared';
import { assess, assessFamily, isCandidate, LIFECYCLE, RANDOM_BASELINE_SLUG, VERDICT, type Assessment } from '@trader/shared';
import { FORECASTER_UNIT,resourcePaused } from './runtime.ts';

const ARENA_URL = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';
const FLAG_JSON = '--json';
const DAY_MS = 86_400_000;
const RECENT_EVENTS_MS = 3 * DAY_MS;

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${ARENA_URL}${path}`, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
}

interface RunReview {
  runId: string;
  agentId: string;
  epic: string;
  leverage: number | null;
  timeframe: string;
  days: number;
  trades: number;
  totalReturn: number;
  /** Daily t of the judged window, and what the whole record needs to be confirmed today. */
  tStat: number;
  lifeT: number;
  confirmAt: number | null;
  backtestZ: number | null;
  mirrored: boolean;
  verdict: Assessment['verdict'];
  reason: string;
}

interface AgentReview {
  agentId: string;
  runs: number;
  judged: number;
  retire: number;
  /** Candidates and confirmed records. */
  ahead: number;
  /** Retire the whole agent (move its file to agents/_retired/). */
  retireAgent: boolean;
}

const [status, broker, demo, events] = await Promise.all([
  get<ArenaStatus>('/api/status'),
  get<{ status: BrokerStatus | null }>('/api/broker'),
  get<LeaderboardRow[]>('/api/leaderboard?kind=demo'),
  get<ArenaEvent[]>('/api/events?limit=2000'),
]);

const now = Date.now();
const standard = demo.filter(r => !r.comparisonOnly);
const runs: RunReview[] = standard.map(r => {
  const a = assess(r, now), c = r.evidence?.clock;
  return {
    runId: r.runId,
    agentId: r.agentId,
    epic: r.epic,
    leverage: r.leverage,
    timeframe: r.timeframe,
    days: Math.round((c?.days ?? Math.max(0, now - r.startedAt) / DAY_MS) * 10) / 10,
    trades: c?.trades ?? r.metrics?.trades ?? 0,
    totalReturn: r.metrics?.totalReturn ?? 0,
    tStat: c?.t ?? 0,
    lifeT: c?.life.t ?? 0,
    confirmAt: c?.confirmAt ?? null,
    backtestZ: c?.backtestZ ?? null,
    mirrored: r.mirrored,
    verdict: a.verdict,
    reason: a.reason,
  };
});

const aheadVerdicts: ReadonlySet<string> = new Set([VERDICT.CANDIDATE, VERDICT.CONFIRMED]);
const judgedVerdicts: ReadonlySet<string> = new Set([VERDICT.KEEP, VERDICT.CANDIDATE, VERDICT.CONFIRMED, VERDICT.RETIRE]);
const agents: AgentReview[] = [...Map.groupBy(runs.filter(r => r.verdict !== VERDICT.CONTROL), r => r.agentId)].map(([agentId, rs]) => {
  const judged = rs.filter(r => judgedVerdicts.has(r.verdict)).length;
  const retire = rs.filter(r => r.verdict === VERDICT.RETIRE).length;
  const ahead = rs.filter(r => aheadVerdicts.has(r.verdict)).length;
  return {
    agentId,
    runs: rs.length,
    judged,
    retire,
    ahead,
    retireAgent:
      retire === rs.length ||
      (judged >= LIFECYCLE.AGENT_RETIRE_MIN_JUDGED && ahead === 0 && retire / judged >= LIFECYCLE.AGENT_RETIRE_SHARE),
  };
});

// Sanity check on the candidate bar: random monkeys that would pass it are luck by definition.
const monkeyCandidates = standard.filter(r => {
  const c = r.evidence?.clock;
  return r.slug === RANDOM_BASELINE_SLUG && !!c && isCandidate(c.trades, c.days, c.t, null);
}).length;
const monkeys = standard.filter(r => r.slug === RANDOM_BASELINE_SLUG).length;

// Families judged as one record: every member row carries its family's clock.
const families = [...new Map(standard.flatMap(r => (r.evidence?.clock?.family ? [[r.evidence.clock.family.id, r.evidence.clock.family] as const] : []))).values()]
  .map(f => ({ ...f, ...assessFamily(f) }))
  .sort((a, b) => b.t - a.t);

const count = (v: string) => runs.filter(r => r.verdict === v).length;
const recentErrors = events.filter(e => e.level === 'error' && now - e.time < RECENT_EVENTS_MS);
const errorKinds = [...Map.groupBy(recentErrors, e => `${e.source}: ${e.message.replace(/[0-9a-f-]{20,}|\d+(\.\d+)?/g, '#').slice(0, 90)}`)]
  .map(([kind, es]) => ({ kind, count: es.length, last: Math.max(...es.map(e => e.time)) }))
  .sort((a, b) => b.count - a.count);
const b = broker.status;
const demoStart = demo.length ? Math.min(...demo.map(r => r.startedAt)) : now;

const report = {
  generatedAt: new Date(now).toISOString(),
  demoDays: Math.round(((now - demoStart) / DAY_MS) * 10) / 10,
  health: {
    stream: status.stream.connected,
    forecaster: status.forecaster.reachable,
    forecasterPaused: !status.forecaster.reachable && resourcePaused(FORECASTER_UNIT),
    memoryMb: status.memoryMb,
    loadErrors: status.loadErrors,
    ticks: status.ticks ?? null,
    tickStorage: status.tickStorage ?? null,
    broker: b
      ? {
          enabled: b.enabled,
          mirrored: b.coverage.mirrored,
          liveRuns: b.coverage.liveRuns,
          capacity: b.accounts.reduce((n, a) => n + (a.killed || a.retiring ? 0 : a.slots), 0),
          accounts: b.accounts.map(a => ({
            name: a.name, leverage: a.leverage, leverageOk: a.leverageOk, hedging: a.hedging, runs: a.runs.length, slots: a.slots,
            killed: a.killed, retiring: a.retiring, equity: a.equity, allocation: a.allocation,
          })),
          tiers: b.tiers,
          queued: b.queued,
          opensLastHour: b.opensLastHour,
          lastError: b.lastError,
        }
      : null,
    recentErrors: errorKinds,
  },
  capacity: { liveRuns: demo.length, standardRuns: standard.length, comparisonRuns: demo.length - standard.length, paperSoftCap: LIFECYCLE.PAPER_RUN_SOFT_CAP, roomForRuns: LIFECYCLE.PAPER_RUN_SOFT_CAP - demo.length },
  verdicts: Object.fromEntries(Object.values(VERDICT).map(v => [v, count(v)])),
  monkeySanity: { monkeys, wouldBeCandidates: monkeyCandidates },
  /** Strategy records ever started: what the confirmed bar is counted over. */
  trials: standard.find(r => r.evidence?.clock)?.evidence?.clock?.trials ?? null,
  confirmed: runs.filter(r => r.verdict === VERDICT.CONFIRMED).sort((a, b) => b.lifeT - a.lifeT),
  candidates: runs.filter(r => r.verdict === VERDICT.CANDIDATE).sort((a, b) => b.tStat - a.tStat),
  closestToConfirmed: runs
    .filter(r => r.verdict !== VERDICT.CONTROL && r.verdict !== VERDICT.CONFIRMED && r.verdict !== VERDICT.EARLY && r.confirmAt !== null)
    .sort((a, b) => b.lifeT - b.confirmAt! - (a.lifeT - a.confirmAt!))
    .slice(0, 5),
  families: {
    /** Strategy families ever started: what a family's confirmed bar is counted over. */
    tried: families[0]?.trials ?? null,
    verdicts: Object.fromEntries([VERDICT.EARLY, VERDICT.KEEP, VERDICT.CANDIDATE, VERDICT.CONFIRMED].map(v => [v, families.filter(f => f.verdict === v).length])),
    confirmed: families.filter(f => f.verdict === VERDICT.CONFIRMED),
    candidates: families.filter(f => f.verdict === VERDICT.CANDIDATE),
    closestToConfirmed: families.filter(f => f.verdict === VERDICT.KEEP && f.confirmAt !== null).slice(0, 5),
  },
  retireRuns: runs.filter(r => r.verdict === VERDICT.RETIRE),
  retireAgents: agents.filter(a => a.retireAgent),
  closestToJudgement: runs
    .filter(r => r.verdict === VERDICT.EARLY)
    .sort((a, b) => b.trades - a.trades)
    .slice(0, 10),
};

if (process.argv.includes(FLAG_JSON)) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const pct = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}%`;
  const lines: string[] = [];
  lines.push(`# Arena review ${report.generatedAt.slice(0, 16)}Z — virtual day ${report.demoDays}`);
  lines.push('', '## Health');
  lines.push(`- stream ${report.health.stream ? 'connected' : 'DOWN'}, forecaster ${report.health.forecaster ? 'reachable' : report.health.forecasterPaused ? 'paused by user' : 'UNREACHABLE'}, arena ${report.health.memoryMb} MB`);
  if (report.health.loadErrors.length) lines.push(`- LOAD ERRORS: ${report.health.loadErrors.map(e => `${e.file}: ${e.error}`).join('; ')}`);
  const ticks = report.health.ticks;
  if (ticks) lines.push(`- tick journal: ${ticks.highWater} received, ${ticks.acknowledged} archived, ${ticks.lostTicks} dropped; ${ticks.lastError ?? 'no recording error'}`);
  const storage = report.health.tickStorage;
  if (storage) lines.push(`- storage ${(storage.totalBytes / 1e9).toFixed(1)} GB; two-year ${(storage.pointTwoYearBytes / 1e9).toFixed(1)} GB, 4× stress ${(storage.stressTwoYearBytes / 1e9).toFixed(1)} GB / 100 GB; report ${((now - storage.at) / 3600_000).toFixed(1)} h old${storage.warning ? ' — WARNING' : ''}`);
  const hb = report.health.broker;
  if (hb) {
    lines.push(`- broker ${hb.enabled ? 'on' : 'OFF'}: ${hb.mirrored}/${hb.liveRuns} runs mirrored, capacity ${hb.capacity}, queue ${hb.queued}, opens last hour ${hb.opensLastHour}`);
    for (const a of hb.accounts) {
      const flags = [
        a.killed && 'KILLED', a.retiring && 'RETIRING', a.hedging === false && 'NETTING', a.allocation === null && 'enrolling',
        a.leverage === null && 'NO TIER (add it to agents/roster.json "accounts")', a.leverageOk === false && 'LEVERAGE NOT SET',
      ].filter(Boolean).join(' ');
      const tier = a.leverage === null ? '' : ` 1:${a.leverage}`;
      lines.push(`  - ${a.name}${tier}: ${a.runs}/${a.slots} runs, equity ${a.equity.toFixed(0)}${a.allocation ? ` of ${a.allocation.toFixed(0)}` : ''}${flags ? ` ${flags}` : ''}`);
    }
    const short = hb.tiers.filter(t => t.mirrored < t.liveRuns);
    if (short.length) lines.push(`- tiers with runs waiting for a slot: ${short.map(t => `1:${t.leverage} ${t.mirrored}/${t.liveRuns}${t.accounts.length === 0 ? ' (NO ACCOUNT)' : ''}`).join(', ')}`);
    if (hb.lastError) lines.push(`- broker last error: ${hb.lastError}`);
  }
  lines.push(`- errors in the last 3 days: ${recentErrors.length}`);
  for (const e of errorKinds.slice(0, 8)) lines.push(`  - ${e.count}× ${e.kind}`);
  lines.push('', '## Capacity');
  lines.push(`- ${report.capacity.liveRuns} live virtual runs (soft cap ${report.capacity.paperSoftCap}: room for ${report.capacity.roomForRuns})`);
  lines.push(`- ${report.capacity.standardRuns} standard runs, ${report.capacity.comparisonRuns} correlated execution comparisons (excluded from verdict/monkey counts)`);
  const perTier = [...Map.groupBy(runs, r => r.leverage)].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  lines.push(`- per leverage: ${perTier.map(([l, rs]) => `1:${l} ${rs.length}`).join(', ')}`);
  lines.push('', '## Verdicts');
  lines.push(`- ${Object.entries(report.verdicts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push(`- monkey sanity: ${report.monkeySanity.wouldBeCandidates} of ${report.monkeySanity.monkeys} random monkeys pass the candidate bar (about ${LIFECYCLE.CANDIDATE_TSTAT === 2 ? '2%' : 'a few %'} of no-edge records do at any one look)`);
  lines.push('', `## Confirmed (false discovery rate ${LIFECYCLE.CONFIRM_FDR * 100}% over ${report.trials ?? '?'} strategy records ever started)`);
  if (report.confirmed.length === 0) lines.push('- none yet');
  for (const r of report.confirmed) lines.push(`- ${r.agentId} ${r.epic} 1:${r.leverage} (${r.timeframe}): ${pct(r.totalReturn)}, ${r.reason}${r.mirrored ? '' : ' — not mirrored'}`);
  for (const r of report.closestToConfirmed) lines.push(`- closest: ${r.agentId} ${r.epic} 1:${r.leverage}: life t ${r.lifeT.toFixed(2)} of ${r.confirmAt!.toFixed(2)} needed${r.backtestZ === null ? ', no same-code backtest' : r.backtestZ > LIFECYCLE.AGREE_Z ? `, ${r.backtestZ.toFixed(1)} standard errors above its backtest` : ''}`);
  lines.push('', '## Candidates (may compete for Capital demo slots; may still be luck)');
  if (report.candidates.length === 0) lines.push('- none yet');
  for (const r of report.candidates) lines.push(`- ${r.agentId} ${r.epic} 1:${r.leverage} (${r.timeframe}): ${pct(r.totalReturn)}, ${r.reason}${r.mirrored ? '' : ' — not mirrored'}`);
  const fam = report.families, about = (f: (typeof families)[number]) => `${f.name}: ${f.reason} (${f.records} running on ${f.markets} markets)`;
  lines.push('', `## Families (each judged as one record; false discovery rate ${LIFECYCLE.CONFIRM_FDR * 100}% over ${fam.tried ?? '?'} families tried)`);
  lines.push(`- ${Object.entries(fam.verdicts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  for (const f of fam.confirmed) lines.push(`- confirmed: ${about(f)}`);
  for (const f of fam.candidates) lines.push(`- candidate: ${about(f)}`);
  for (const f of fam.closestToConfirmed) lines.push(`- closest: ${f.name}: family t ${f.t.toFixed(2)} of ${f.confirmAt!.toFixed(2)} needed (${f.records} running on ${f.markets} markets)`);
  lines.push('', '## Retire: agents (move file to agents/_retired/)');
  if (report.retireAgents.length === 0) lines.push('- none');
  for (const a of report.retireAgents) lines.push(`- ${a.agentId}: ${a.retire} of ${a.runs} runs retire (${a.judged} judged)`);
  lines.push('', '## Retire: runs (add to agents/roster.json)');
  const agentWide = new Set(report.retireAgents.map(a => a.agentId));
  const single = report.retireRuns.filter(r => !agentWide.has(r.agentId));
  if (single.length === 0) lines.push('- none');
  for (const r of single) lines.push(`- ${r.agentId}:${r.epic}@${r.leverage} — ${r.reason} (${pct(r.totalReturn)})`);
  lines.push('', '## Closest to being judged');
  for (const r of report.closestToJudgement) lines.push(`- ${r.agentId} ${r.epic} 1:${r.leverage}: ${r.trades} trades, ${r.days} days, ${pct(r.totalReturn)}`);
  console.log(lines.join('\n'));
}
