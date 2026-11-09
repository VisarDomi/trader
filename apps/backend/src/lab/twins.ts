/**
 * Daily paper–demo twin check for the babysitter visit (see agents/LIFECYCLE.md).
 *
 *   bun run twins [--json]
 *
 * Reads the arena (ARENA_URL, default 127.0.0.1:4120): the last day and the last 14 days of paired demo
 * deals and paper trades, Capital's quote-stream delay and where the arena spends its CPU. Lines starting
 * with "CHECK" need a look: a divergence is an engine or mirror bug until shown otherwise.
 */
const base = process.env.ARENA_URL ?? 'http://127.0.0.1:4120';
const get = async (path: string) => {
  const res = await fetch(base + path, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw Error(`${path}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
};
const [day, fortnight, execution] = await Promise.all([get('/api/twins?days=1'), get('/api/twins?days=14'), get('/api/execution')]);
if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ day, fortnight, cpu: execution.virtual.cpuParts, feed: execution.virtual.feed }, null, 2));
  process.exit(0);
}
const share = (x: number | null) => (x === null ? '—' : `${Math.round(x * 100)}%`);
const bp = (x: number | null) => (x === null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(2)} bp`);
const usd = (x: number) => `${x < 0 ? '-' : '+'}$${Math.abs(x).toFixed(0)}`;
const line = (label: string, o: any) =>
  `${label}: ${o.pairs} pairs, ${share(o.agreeShare)} agree, mean gap ${bp(o.meanGapBps)}, 95th pct ${o.p95AbsGapBps ?? '—'} bp, ` +
  `demo − paper ${usd(o.gapUsd)}, funding ${usd(o.fundingGapUsd)}, demo order accepted ${o.entryLagP50Ms ?? '—'} ms after the decision (p95 ${o.entryLagP95Ms ?? '—'} ms; paper assumes 500)`;
const out: string[] = [];
const check = (why: string) => out.push(`CHECK ${why}`);
out.push(line('last day', day.overall), line('last 14 days', fortnight.overall));
out.push(`agents (14 days): ${Object.entries(fortnight.verdicts).map(([v, n]) => `${n} ${v}`).join(', ')}`);
for (const r of fortnight.runs.filter((r: any) => r.verdict === 'diverged').slice(0, 10))
  out.push(`  diverged ${r.runId}: ${r.pairs} pairs, ${share(r.agreeShare)} agree, mean gap ${bp(r.meanGapBps)} (spread ${r.toleranceBps} bp), ${usd(r.gapUsd)}`);
for (const e of fortnight.byExit.slice(0, 6))
  out.push(`  exit ${e.exitReason}, closed by ${e.closedBy}: ${e.pairs} pairs, ${share(e.agreeShare)} agree, mean ${bp(e.meanGapBps)}, exit lag p50 ${e.exitLagP50Ms ?? '—'} ms`);
const feed = execution.virtual.feed;
out.push(`Capital quote stream: median delay ${feed?.medianDelayMs ?? '—'} ms behind quote timestamps`);
const cpu = execution.virtual.cpuParts;
out.push(
  `arena CPU since start (${Math.round(cpu.sinceMs / 3_600_000)} h): ${execution.virtual.cpuCorePercent}% of a core in total; ` +
    cpu.parts.slice(0, 7).map((p: any) => `${p.part} ${p.corePercent}%`).join(', '),
);
out.push(`runs: ${execution.virtual.standardRuns} standard + ${execution.virtual.comparisonRuns} delay comparisons (cap ${execution.virtual.runCap})`);

if (day.overall.pairs >= 30 && day.overall.agreeShare !== null && fortnight.overall.agreeShare !== null && day.overall.agreeShare < fortnight.overall.agreeShare - 0.1)
  check(`agreement fell to ${share(day.overall.agreeShare)} in the last day (14 days: ${share(fortnight.overall.agreeShare)})`);
if (fortnight.overall.meanGapBps !== null && Math.abs(fortnight.overall.meanGapBps) > 1) check(`14-day mean gap ${bp(fortnight.overall.meanGapBps)}: a systematic bias`);
if (fortnight.verdicts.diverged > 0) check(`${fortnight.verdicts.diverged} agents diverged over 14 days`);
if (feed?.medianDelayMs > 20_000) check(`quote stream ${feed.medianDelayMs} ms late: close to the 30 s cut-off for usable quotes`);
if (execution.virtual.cpuCorePercent > 50) check(`arena uses ${execution.virtual.cpuCorePercent}% of a core`);
// Capital answers an order in ~0.12 s; more than a second from decision to acceptance is our queue.
if (day.overall.entryLagP50Ms !== null && day.overall.entryLagP50Ms > 1000)
  check(`demo orders accepted a median ${day.overall.entryLagP50Ms} ms after the decision (Capital itself takes ~120 ms): look at the broker queue`);
console.log(out.join('\n'));
