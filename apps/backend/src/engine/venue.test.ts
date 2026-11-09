import { describe, expect, test } from 'bun:test';
import fixture from './fixtures/capital-markets.json';
import { VirtualVenue, type CapitalMarket } from './venue.ts';
import { getInstrument } from './instruments.ts';
import { MarketEngine } from './market.ts';
import { defineAgent } from '../sdk/index.ts';
import { EXIT_REASON, type AgentContext } from '../sdk/types.ts';
const EPIC = 'EURUSD';
const LONG = 'long';
const SHORT = 'short';
const START = Date.parse(fixture.at);
const MINUTE = 60_000;
function setup(action: (ctx: AgentContext) => void, delay = 500) {
  let now = START;
  const venue = new VirtualVenue({ ...getInstrument(EPIC) });
  venue.update(structuredClone(fixture.markets.EURUSD) as CapitalMarket, now);
  const def = defineAgent({
    name: 'contract',
    description: 'contract',
    instruments: [EPIC],
    timeframe: '1m',
    warmup: 0,
    params: {},
    onBar: action,
  });
  const engine = new MarketEngine(venue.instrument);
  const run = engine.addRun({
    runId: 'contract',
    agent: {
      id: 'contract',
      slug: 'contract',
      variant: null,
      file: '',
      def,
      params: {},
      codeHash: 'x',
      source: '',
    },
    leverage: 1,
    capital: 10_000,
    checkStopsOnCandles: false,
    execution: { venue, latencyMs: delay, now: () => now },
  });
  const tick = (dt: number, bid = 1.12, ask = 1.1201) => {
    now = START + dt;
    run.onTick({ time: now, bid, ask });
  };
  tick(0);
  engine.processCandle({
    time: Math.floor(START / MINUTE) * MINUTE - MINUTE,
    open: 1.12,
    high: 1.12,
    low: 1.12,
    close: 1.12,
    spread: 0.0001,
    volume: 1,
  });
  return { run, engine, venue, tick, setNow: (time: number) => (now = time) };
}
describe('Capital demo observed contract', () => {
  test('minimum size and stop boundaries use the captured Capital dealing rules', () => {
    const { run, venue } = setup(c => c.buy({ size: 50 }));
    expect(run.position).toBeNull();
    expect(run.pendingOrders).toBe(0);
    expect(venue.stopsProblem(LONG, 1.12, 1.1201, { stopLoss: 1.11999 })).not.toBeNull();
    expect(venue.stopsProblem(LONG, 1.12, 1.1201, { stopLoss: 1.119 })).toBeNull();
    expect(venue.stopsProblem(SHORT, 1.12, 1.1201, { stopLoss: 1.12011 })).not.toBeNull();
    expect(venue.stopsProblem(SHORT, 1.12, 1.1201, { stopLoss: 1.121 })).toBeNull();
  });
  test('market buy waits and fills at the next executable ask, never the decision price', () => {
    const { run, tick } = setup(c => c.buy({ size: 100 }));
    expect(run.position).toBeNull();
    expect(run.pendingOrders).toBe(1);
    tick(499);
    expect(run.position).toBeNull();
    tick(500, 1.121, 1.1211);
    expect(run.position?.entryPrice).toBe(1.1211);
    expect(run.position?.size).toBe(100);
  });
  test('market sell waits and fills on bid; backwards ticks are discarded', () => {
    const { run, tick } = setup(c => c.sell({ size: 100 }));
    tick(500, 1.121, 1.1211);
    tick(400, 1.1, 1.1001);
    expect(run.position?.entryPrice).toBe(1.121);
    expect(run.lastQuote?.bid).toBe(1.121);
  });
  test('closed markets and stale rules fail closed, including pending fills', () => {
    const { run, tick, venue } = setup(c => c.buy({ size: 100 }));
    venue.market!.snapshot.marketStatus = 'CLOSED';
    tick(600);
    expect(run.position).toBeNull();
    venue.market!.snapshot.marketStatus = 'TRADEABLE';
    tick(4 * MINUTE);
    expect(run.position).toBeNull();
    venue.update(venue.market!, START + 4 * MINUTE);
    tick(4 * MINUTE + 1);
    expect(run.position).toBeNull();
    expect(run.executionStats.rejected).toBe(1);
  });
  test('pending commands survive a snapshot/restart exactly once', () => {
    const { run, tick } = setup(c => c.buy({ size: 100 }));
    const snapshot = JSON.parse(JSON.stringify(run.snapshot()));
    run.restore(snapshot, [], []);
    tick(500);
    tick(600);
    expect(run.pendingOrders).toBe(0);
    expect(run.position?.size).toBe(100);
    expect(run.executionStats.submitted).toBe(1);
  });
  test('a flat signal cancels an open still in flight', () => {
    const { run, engine, tick } = setup(c => {
      if (c.state.close) c.close();
      else c.buy({ size: 100 });
    });
    run.state.close = true;
    run.onBar(engine.getSeries('1m').bars.at(-1)!);
    tick(500);
    expect(run.position).toBeNull();
    expect(run.pendingOrders).toBe(0);
  });
  test('a delayed entry expires instead of trading outside its specified minute', () => {
    const { run, tick } = setup(c => c.buy({ size: 100, validUntil: START + 500 }));
    tick(500);
    expect(run.position).toBeNull();
    expect(run.executionStats.rejected).toBe(1);
    expect(run.logs.at(-1)?.message).toContain('deadline expired');
  });
  test('a scheduled exit survives a restart and uses the clock without another bar', () => {
    const { run, tick, setNow } = setup(c => c.buy({ size: 100, closeAt: START + 2000 }));
    tick(500);
    run.restore(JSON.parse(JSON.stringify(run.snapshot())), [], []);
    expect(run.position?.closeAt).toBe(START + 2000);
    setNow(START + 1999);
    run.onClock(START + 1999);
    expect(run.pendingOrders).toBe(0);
    setNow(START + 2000);
    run.onClock(START + 2000);
    expect(run.pendingOrders).toBe(1);
    tick(2499);
    expect(run.position).not.toBeNull();
    tick(2500);
    expect(run.position).toBeNull();
    expect(run.trades[0]?.exitReason).toBe(EXIT_REASON.SESSION_END);
  });
});
