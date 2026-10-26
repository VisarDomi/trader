import { expect, test, spyOn } from 'bun:test';
import { Arena } from './arena.ts';
import { ArenaDB } from './db.ts';
import { MarketEngine } from '../engine/market.ts';
import { getInstrument } from '../engine/instruments.ts';
import { defineAgent } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { CapitalClient } from '../capital/client.ts';
import { TICK_SOURCE, type Tick } from '../engine/ticks.ts';

test('instrument dirtiness persists quote-only state once and preserves untouched instruments', () => {
  const now = Date.UTC(2026, 9, 26, 12, 1), clock = spyOn(Date, 'now').mockReturnValue(now);
  const db = new ArenaDB(':memory:');
  const arena = new Arena({ db, dataClient: {} as CapitalClient, forecasterUrl: '', broker: null, live: false });
  try {
    for (const epic of ['US500', 'GOLD']) {
      const def = defineAgent({ name: epic, description: epic, params: {}, instruments: [epic], timeframe: '1m', warmup: 0,
        init: () => ({ ticks: 0 }), onTick(ctx) { ctx.state.ticks = Number(ctx.state.ticks) + 1; } });
      const agent: LoadedAgent = { id: epic, slug: epic, variant: null, file: '', codeHash: 'fixture', source: '', params: {}, def };
      const engine = new MarketEngine({ ...getInstrument(epic) });
      const run = engine.addRun({ runId: epic, agent, leverage: 1, capital: 10000, checkStopsOnCandles: false });
      db.createDemoRun({ id: epic, agentId: epic, codeHash: agent.codeHash, epic, leverage: 1, capital: 10000, params: {}, now });
      arena.engines.set(epic, engine);
      arena.tracked.set(epic, { startedAt: now, run, agent, epic, leverage: 1, persistedTrades: 0, dirty: true });
    }
    arena.persistAll(true);
    const save = spyOn(db, 'saveRunState');
    const quote: Tick = { time: now, receivedAt: now, bid: 100, ask: 101, source: TICK_SOURCE.RECORDED };
    (arena as unknown as { onQuote(epic: string, q: Tick): void }).onQuote('US500', quote);
    arena.persistAll(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].id).toBe('US500');
    expect(JSON.parse(db.run('US500')!.snapshot!).state.ticks).toBe(1);
    expect(JSON.parse(db.run('GOLD')!.snapshot!).state.ticks).toBe(0);
    arena.persistAll(false);
    expect(save).toHaveBeenCalledTimes(1);
    arena.persistAll(true);
    expect(save).toHaveBeenCalledTimes(3);
    save.mockRestore();
  } finally { arena.stop(); db.db.close(); clock.mockRestore(); }
});
