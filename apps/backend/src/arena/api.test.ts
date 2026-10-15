import { ENGINE_VERSION } from '../engine/version.ts';
import { expect, test } from 'bun:test';
import { startApi } from './api.ts';
import { ArenaDB, DEAL_STATUS } from './db.ts';
import type { Arena } from './arena.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import { defineAgent } from '../sdk/index.ts';
import { computeMetrics } from '../engine/metrics.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';
import type { LeaderboardRow, RunDetail } from '@trader/shared';
const EPIC = 'EURUSD';
const ID = 'agent';
const RUN = 'demo:agent:EURUSD:x1:hash';
const TOKEN = 'test-only';
test('stage leaderboards keep virtual equity separate from actual broker results and retain full run detail', async () => {
  const db = new ArenaDB(':memory:');
  const def = defineAgent({ name: ID, description: ID, params: {}, instruments: [EPIC], timeframe: '1m', onBar() {} });
  const agent: LoadedAgent = { id: ID, slug: ID, variant: null, file: '', def, params: {}, codeHash: 'hash', source: '' };
  db.upsertAgent(agent, 1);
  const metrics = computeMetrics({ trades: [], equity: [{t: 1, equity: 10_000}], initialCapital: 10_000, finalEquity: 12_345, startTime: 1, endTime: 2, maxDrawdown: 0, exposure: 0 });
  db.saveBacktest({ engineVersion: ENGINE_VERSION, agentId: ID, codeHash: 'hash', epic: EPIC, leverage: 1, windowId: 'fixture', windowStart: 1, windowEnd: 2, params: {}, capital: 10_000,
    status: 'completed', errors: 0, metrics, trades: [], equity: [], logs: [], ranAt: 2, agentUsPerBar: 0, bars: 0, candles: 0, durationMs: 0 } as BacktestResult);
  db.createDemoRun({ id: RUN, agentId: ID, codeHash: 'hash', epic: EPIC, leverage: 1, capital: 10_000, params: {}, now: 1 });
  db.db.query('UPDATE runs SET equity = ?, metrics = ? WHERE id = ?').run(12_345, JSON.stringify(metrics), RUN);
  db.setRunExtra(RUN, { scenario: 'standard' });
  db.insertDeal({ account: 'Arena 01', account_id: 'arena', run_id: RUN, epic: EPIC, side: 'long', size: 100, paper_size: 500, deal_id: 'ours',
    status: DEAL_STATUS.CLOSED, open_time: 1, open_price: 1, paper_open_price: 1, close_time: 2, close_price: 1.1, paper_close_price: 1.1, pnl: 10, note: null });
  const fake = { db, broker: { mirroredRuns: [RUN], status: () => ({ scale: .2 }) }, tracked: new Map() } as unknown as Arena;
  const api = startApi(fake, 0, TOKEN);
  const get = async <T>(path: string) => (await (await fetch(`http://127.0.0.1:${api.port}${path}`)).json()) as T;
  try {
    const virtual = await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&scenario=standard');
    const actual = await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&stage=demo');
    const bt = await get<LeaderboardRow[]>('/api/leaderboard?kind=backtest');
    expect(virtual[0]!.equity).toBe(12_345);
    expect(actual[0]!.equity).toBe(2010);
    expect(actual[0]!.metrics!.totalReturn).toBe(.005);
    expect(bt[0]!.stage).toBe('demo');
    expect(virtual[0]!.metrics!.monthly).toHaveLength(0);
    const detail = await get<RunDetail>(`/api/runs/${encodeURIComponent(RUN)}`);
    expect(detail.metrics!.monthly).toHaveLength(1);
    const response = await fetch(`http://127.0.0.1:${api.port}/api/backtests`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  } finally { await api.stop(true); db.db.close(); }
});
