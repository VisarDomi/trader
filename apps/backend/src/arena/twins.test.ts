import { expect, test } from 'bun:test';
import { buildTwinReport, CLOSED_BY, twinTrade, twinVerdict, twinStats, TWIN_VERDICT, type TwinRow } from './twins.ts';

const T = Date.UTC(2026, 10, 5, 14);
const RUN = 'demo:ema-cross/9-21:US500:x20:abc';
/** A long US500 trade: paper buys 1 at 6000 and sells at 6010; the demo deal is 0.2 at the same prices. */
function row(over: Partial<TwinRow> = {}): TwinRow {
  return {
    runId: RUN, epic: 'US500', side: 'long', size: 0.2, paperSize: 1,
    openPrice: 6000, brokerPnl: 2, brokerAdjust: 0, brokerCloseTime: T + 60_500, closeTime: T + 61_000, note: 'paper signal',
    paperFillTime: T, decisionTime: T - 500, sentTime: T + 900, paperEntry: 6000, paperExit: 6010, paperExitTime: T + 60_000, paperPnl: 10, paperFunding: 0,
    exitReason: 'signal', ...over,
  };
}

test('identical prices agree with a zero gap, and dollars are scaled to the paper size', () => {
  const t = twinTrade(row())!;
  expect(t).toMatchObject({ entryBps: 0, exitBps: 0, gapBps: 0, agrees: true, paperUsd: 10, demoUsd: 10, gapUsd: 0, entryLagMs: 1400, exitLagMs: 500, closedBy: CLOSED_BY.ARENA });
});

test('the demo close price comes from booked P&L; a worse demo entry shows as a negative gap', () => {
  // Demo bought at 6003 (3 points worse) and booked 0.2 × (6010 − 6003) = 1.4.
  const t = twinTrade(row({ openPrice: 6003, brokerPnl: 1.4 }))!;
  expect(t.entryBps).toBe(-5);
  expect(t.exitBps).toBe(0);
  expect(t.gapBps).toBeCloseTo(-5, 1);
  expect(t.agrees).toBe(false); // US500 typical spread is 0.6 points ≈ 1 bp
  expect(t.gapUsd).toBeCloseTo(-3, 1);
});

test('shorts, funding and broker adjustments are compared at paper size', () => {
  // Paper short 1 @ 6010 → 6000 earns 10 gross, minus 0.5 funding; demo short 0.2 earns 2 and pays 0.06 swap.
  const t = twinTrade(row({ side: 'short', paperEntry: 6010, paperExit: 6000, openPrice: 6010, paperPnl: 9.5, paperFunding: -0.5, brokerPnl: 2, brokerAdjust: -0.06 }))!;
  expect(t.paperUsd).toBe(10);
  expect(t.gapBps).toBe(0);
  expect(t.fundingGapUsd).toBeCloseTo(0.2, 6); // −0.06 × 5 − (−0.5)
});

test('who closed first is decided by timing, not by the mirror note', () => {
  const brokerStop = twinTrade(row({ brokerCloseTime: T + 52_000, note: 'paper stop_loss; already closed at broker', exitReason: 'stop_loss' }))!;
  expect(brokerStop.closedBy).toBe(CLOSED_BY.BROKER);
  expect(brokerStop.exitLagMs).toBe(-8_000);
  const ours = twinTrade(row({ note: 'paper position is flat; already closed at broker' }))!;
  expect(ours.closedBy).toBe(CLOSED_BY.ARENA);
});

test('rows without a paper twin or booked P&L are not paired', () => {
  expect(twinTrade(row({ paperEntry: null, paperExit: null, paperExitTime: null, paperPnl: null }))).toBeNull();
  expect(twinTrade(row({ brokerPnl: null }))).toBeNull();
});

test('verdicts: too few, converged, watch and diverged', () => {
  const agreeing = Array.from({ length: 10 }, () => twinTrade(row())!);
  expect(twinVerdict(twinStats(agreeing.slice(0, 4)), 1)).toBe(TWIN_VERDICT.TOO_FEW);
  expect(twinVerdict(twinStats(agreeing), 1)).toBe(TWIN_VERDICT.CONVERGED);
  const off = twinTrade(row({ openPrice: 6003, brokerPnl: 1.4 }))!;
  expect(twinVerdict(twinStats([...agreeing.slice(0, 8), off, { ...off, gapBps: 5 }]), 1)).toBe(TWIN_VERDICT.WATCH);
  expect(twinVerdict(twinStats([...agreeing.slice(0, 5), off, off, off]), 1)).toBe(TWIN_VERDICT.DIVERGED);
});

test('the report groups pairs by run, instrument, exit and day, and counts unpaired deals', () => {
  const rows = [row(), row({ paperFillTime: T + 1, paperExitTime: T + 86_400_000 }), row({ paperEntry: null, paperExit: null, paperExitTime: null, paperPnl: null })];
  const r = buildTwinReport(rows, T - 86_400_000, T + 2 * 86_400_000, T);
  expect(r.overall.pairs).toBe(2);
  expect(r.runs).toHaveLength(1);
  expect(r.runs[0]).toMatchObject({ runId: RUN, agentId: 'ema-cross/9-21', leverage: 20, verdict: TWIN_VERDICT.TOO_FEW });
  expect(r.byEpic.map(e => e.epic)).toEqual(['US500']);
  expect(r.days).toHaveLength(2);
  expect(r.unpaired).toEqual({ closedDeals: 3, withoutPaperTrade: 1, withoutBrokerPnl: 0 });
});
