/**
 * Lifecycle review of the live demo arena — the babysitter's starting point
 * (see agents/LIFECYCLE.md).
 *
 *   bun run review          markdown report
 *   bun run review --json   the same data as JSON
 *
 * Reads the arena API (ARENA_URL, through the SSH tunnel) and applies the
 * shared lifecycle policy (packages/shared/src/lifecycle.ts): health, capacity,
 * verdict counts, leaders, runs and agents to retire.
 */
import type { ArenaEvent, ArenaStatus, BrokerStatus, LeaderboardRow } from '@trader/shared';
import { assess, LIFECYCLE, luckBands, RANDOM_BASELINE_SLUG, VERDICT, type Assessment } from '@trader/shared';

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
  tStat: number;
  mirrored: boolean;
  verdict: Assessment['verdict'];
  reason: string;
}

interface AgentReview {
  agentId: string;
  runs: number;
  judged: number;
  retire: number;
  leaders: number;
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
const bands = luckBands(demo);
const runs: RunReview[] = demo.map(r => {
  const a = assess(r, bands, now);
  return {
    runId: r.runId,
    agentId: r.agentId,
    epic: r.epic,
    leverage: r.leverage,
    timeframe: r.timeframe,
    days: Math.round(((now - r.startedAt) / DAY_MS) * 10) / 10,
    trades: r.metrics?.trades ?? 0,
    totalReturn: r.metrics?.totalReturn ?? 0,
    tStat: r.metrics?.tStat ?? 0,
    mirrored: r.mirrored,
    verdict: a.verdict,
    reason: a.reason,
  };
});

const judgedVerdicts: ReadonlySet<string> = new Set([VERDICT.KEEP, VERDICT.LEADER, VERDICT.RETIRE]);
const agents: AgentReview[] = [...Map.groupBy(runs.filter(r => r.verdict !== VERDICT.CONTROL), r => r.agentId)].map(([agentId, rs]) => {
  const judged = rs.filter(r => judgedVerdicts.has(r.verdict)).length;
  const retire = rs.filter(r => r.verdict === VERDICT.RETIRE).length;
  const leaders = rs.filter(r => r.verdict === VERDICT.LEADER).length;
  return {
    agentId,
    runs: rs.length,
    judged,
    retire,
    leaders,
    retireAgent:
      retire === rs.length ||
      (judged >= LIFECYCLE.AGENT_RETIRE_MIN_JUDGED && leaders === 0 && retire / judged >= LIFECYCLE.AGENT_RETIRE_SHARE),
  };
});

// Sanity check on the leader bar: random monkeys that would pass it are luck by definition.
const monkeyLeaders = demo.filter(
  r => r.slug === RANDOM_BASELINE_SLUG && (r.metrics?.trades ?? 0) >= LIFECYCLE.MIN_TRADES && (r.metrics?.tStat ?? 0) >= LIFECYCLE.LEADER_TSTAT,
).length;
const monkeys = demo.filter(r => r.slug === RANDOM_BASELINE_SLUG).length;

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
    memoryMb: status.memoryMb,
    loadErrors: status.loadErrors,
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
  capacity: { liveRuns: runs.length, paperSoftCap: LIFECYCLE.PAPER_RUN_SOFT_CAP, roomForRuns: LIFECYCLE.PAPER_RUN_SOFT_CAP - runs.length },
  verdicts: Object.fromEntries(Object.values(VERDICT).map(v => [v, count(v)])),
  monkeySanity: { monkeys, wouldLead: monkeyLeaders },
  leaders: runs.filter(r => r.verdict === VERDICT.LEADER).sort((a, b) => b.tStat - a.tStat),
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
  lines.push(`# Arena review ${report.generatedAt.slice(0, 16)}Z — demo day ${report.demoDays}`);
  lines.push('', '## Health');
  lines.push(`- stream ${report.health.stream ? 'connected' : 'DOWN'}, forecaster ${report.health.forecaster ? 'reachable' : 'UNREACHABLE'}, arena ${report.health.memoryMb} MB`);
  if (report.health.loadErrors.length) lines.push(`- LOAD ERRORS: ${report.health.loadErrors.map(e => `${e.file}: ${e.error}`).join('; ')}`);
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
  lines.push(`- ${report.capacity.liveRuns} live demo runs (soft cap ${report.capacity.paperSoftCap}: room for ${report.capacity.roomForRuns})`);
  const perTier = [...Map.groupBy(runs, r => r.leverage)].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0));
  lines.push(`- per leverage: ${perTier.map(([l, rs]) => `1:${l} ${rs.length}`).join(', ')}`);
  lines.push('', '## Verdicts');
  lines.push(`- ${Object.entries(report.verdicts).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  lines.push(`- monkey sanity: ${report.monkeySanity.wouldLead} of ${report.monkeySanity.monkeys} random monkeys pass the leader bar (should be ~0)`);
  lines.push('', '## Leaders');
  if (report.leaders.length === 0) lines.push('- none yet');
  for (const r of report.leaders) lines.push(`- ${r.agentId} ${r.epic} 1:${r.leverage} (${r.timeframe}): ${pct(r.totalReturn)}, ${r.reason}${r.mirrored ? '' : ' — not mirrored'}`);
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
