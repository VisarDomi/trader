import { expect, test } from 'bun:test';
import { createRequire } from 'node:module';
import { defineAgent, type AgentDefinition } from '../sdk/index.ts';
import { getInstrument } from './instruments.ts';
import { MarketEngine } from './market.ts';
import { RISK_BACKEND, riskBackend } from './risk-native.ts';
import { TICK_SOURCE } from './ticks.ts';
import type { LoadedAgent } from './loader.ts';
import { VirtualGateway, VirtualVenue } from './venue.ts';
import fixtures from './fixtures/capital-markets.json';

const EPIC = 'US500', COUNT = 24;
const nativeTest = test.skipIf(riskBackend !== RISK_BACKEND.NATIVE);
nativeTest('native risk preserves the reference engine through stops, callbacks, pending orders, funding, DST and restore', () => {
  for (const start of [Date.UTC(2026, 9, 30, 20, 59), Date.UTC(2026, 10, 1, 5, 59)]) {
    for (const delayed of [false, true]) {
      let now = start;
      const setup = (useNative: boolean) => {
        const events: unknown[] = [];
        const instrument = { ...getInstrument(EPIC) };
        const engine = new MarketEngine(instrument, null, useNative);
        const venue = new VirtualVenue(instrument), gateway = new VirtualGateway();
        venue.update({ ...fixtures.markets.US500, snapshot: { ...fixtures.markets.US500.snapshot, marketStatus: 'TRADEABLE' } }, now);
        for (let i = 0; i < COUNT; i++) {
          const def: AgentDefinition = {
            name: 'risk-parity', description: 'native/reference parity', instruments: [EPIC], timeframe: '1m', warmup: 0, params: {},
            intradayOnly: i % 5 === 0,
            init: () => ({ n: 0 }),
            onTick(ctx) {
              const n = Number(ctx.state.n) + 1; ctx.state.n = n;
              const long = i % 2 === 0;
              if (!ctx.position && n % 11 === 1) {
                const price = long ? ctx.tick.bid : ctx.tick.ask;
                const sign = long ? 1 : -1;
                const stops = i % 4 === 0 ? { stopLoss: price - sign * 3, takeProfit: price + sign * 5 }
                  : i % 4 === 1 ? { trailingStop: 2 } : {};
                const options = { size: i % 4 === 2 ? 1000 : 10, ...stops,
                  ...(i % 7 === 0 ? { closeAt: ctx.time + 40_000 } : {}) };
                if (long) ctx.buy(options); else ctx.sell(options);
              } else if (ctx.position && n % 13 === 0) ctx.setStops({ trailingStop: null, stopLoss: null, takeProfit: long ? ctx.tick.bid + 1 : ctx.tick.ask - 1 });
              else if (ctx.position && n % 17 === 0) ctx.close('parity close');
            },
            onFill(ctx, fill) { ctx.state.fills = Number(ctx.state.fills ?? 0) + 1; ctx.log(fill.kind); },
          };
          const agent: LoadedAgent = { id: `parity-${i}`, slug: 'parity', variant: null, file: '', source: '', codeHash: 'fixture', params: {}, def: defineAgent(def) };
          engine.addRun({ runId: agent.id, agent, leverage: 200, capital: 10000, checkStopsOnCandles: false,
            execution: delayed ? { venue, gateway, latencyMs: 500, now: () => now } : undefined,
            onEvent: e => events.push(e) });
        }
        return { engine, events, venue };
      };
      const reference = setup(false), native = setup(true);
      for (let i = 0; i < 160; i++) {
        now = start + i * 2000;
        const bid = 100 + Math.sin(i * 1.3) * (i % 9 === 0 ? 19 : 4);
        const q = { time: now, receivedAt: now, bid, ask: bid + 0.6, source: TICK_SOURCE.RECORDED, sequence: i, journalId: 'parity' };
        for (const state of [reference, native]) {
          state.venue.updatedAt = now;
          state.engine.processClock(now);
          state.engine.processTick(q);
          if (i === 70) for (const r of state.engine.runs) {
            const snapshot = r.snapshot(), trades = [...r.trades], equity = [...r.equity];
            r.trades.length = 0; r.equity.length = 0; r.restore(snapshot, trades, equity);
          }
          if (i === 90) {
            const r = state.engine.runs[3]!;
            state.engine.removeRun(r);
            // Removal must resize/rebind native slots and remove tick callbacks too.
          }
        }
        expect(native.engine.runs.map(r => [r.snapshot(), r.trades, r.equity, r.logs])).toEqual(reference.engine.runs.map(r => [r.snapshot(), r.trades, r.equity, r.logs]));
        expect(native.events).toEqual(reference.events);
      }
      expect(native.events.some((e: any) => e.type === 'close')).toBe(true);
    }
  }
});

nativeTest('native boundary refuses overlapping, misaligned and undersized buffers', () => {
  const module = createRequire(import.meta.url)('../../native/trader-risk.node');
  const buffer = Buffer.alloc(1024), other = Buffer.alloc(1024);
  expect(() => module.evaluate(buffer, buffer, 1, 100, 101)).toThrow('overlap');
  expect(() => module.evaluate(buffer.subarray(1), other, 1, 100, 101)).toThrow('aligned');
  expect(() => module.evaluate(Buffer.alloc(0), other, 1, 100, 101)).toThrow('invalid risk batch');
  expect(() => module.evaluate(buffer, other, 0, 100, 101)).toThrow('invalid risk batch');
});
