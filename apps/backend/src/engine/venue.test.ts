import { describe, expect, test } from 'bun:test';
import fixture from './fixtures/capital-markets.json';
import { VirtualVenue, type CapitalMarket } from './venue.ts';
import { getInstrument } from './instruments.ts';
import { MarketEngine } from './market.ts';
import { defineAgent } from '../sdk/index.ts';
import type { AgentContext } from '../sdk/types.ts';
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
});

test('a virtual login paces bursts and accounts for switching plus confirmation requests', async () => {
  const { VirtualGateway } = await import('./venue.ts');
  const g = new VirtualGateway();
  const OPEN = 'open';
  expect(g.reserve('a', 1, OPEN, START)).toBe(START + 340);
  expect(g.reserve('b', 1, OPEN, START)).toBe(START + 850);
  expect(g.reserve('c', 2, OPEN, START)).toBe(START + 1700);
  for (let i = 1; i < 12; i++) g.reserve('a', 1, OPEN, START);
  expect(typeof g.reserve('a', 1, OPEN, START)).toBe('string');
});

test('virtual API budgets restore past attempts without double counting', async () => {
  const { VirtualGateway } = await import('./venue.ts');
  const g = new VirtualGateway();
  for (let i = 0; i < 12; i++) { g.observeOpen('same-run', START - i * 1000, START); g.observeOpen('same-run', START - i * 1000, START); }
  expect(typeof g.reserve('same-run', 1, 'open', START)).toBe('string');
  expect(typeof g.reserve('another-run', 1, 'open', START)).toBe('number');
});
