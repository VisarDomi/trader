import { ENGINE_VERSION } from '../engine/version.ts';
import { expect, test, spyOn } from 'bun:test';
import { startApi } from './api.ts';
import { ArenaDB, DEAL_STATUS } from './db.ts';
import type { Arena } from './arena.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import { defineAgent } from '../sdk/index.ts';
import { computeMetrics } from '../engine/metrics.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';
import type { AgentBundle, AgentListItem, LeaderboardRow, RunDetail } from '@trader/shared';
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
  const snapshot=JSON.stringify({balance:10000,position:null,state:{large:'recovery-only'.repeat(1000)}});
  db.db.query('UPDATE runs SET snapshot=? WHERE id=?').run(snapshot,RUN);
  const recoveryLists=spyOn(db,'runs').mockImplementation(()=>{throw new Error('A read model loaded recovery snapshots');});
  const admission = { date: '2026-10-15', reason: 'user requested this demo experiment' };
  db.setRunExtra(RUN, { scenario: 'standard', demoAdmission: admission });
  db.insertDeal({ account: 'Arena 01', account_id: 'arena', run_id: RUN, epic: EPIC, side: 'long', size: 100, paper_size: 500, deal_id: 'ours',
    status: DEAL_STATUS.CLOSED, open_time: 1, open_price: 1, paper_open_price: 1, close_time: 2, close_price: 1.1, paper_close_price: 1.1, pnl: 10, note: null });
  const mirroredRuns = [RUN];
  const fake = { db, broker: { mirroredRuns, status: () => ({ scale: .2 }) }, tracked: new Map() } as unknown as Arena;
  const api = startApi(fake, 0, TOKEN);
  const get = async <T>(path: string) => (await (await fetch(`http://127.0.0.1:${api.port}${path}`)).json()) as T;
  try {
    const virtual = await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&scenario=standard');
    const actual = await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&stage=demo');
    const bt = await get<LeaderboardRow[]>('/api/leaderboard?kind=backtest');
    expect(virtual[0]!.equity).toBe(12_345);
    expect(actual[0]!.equity).toBe(2010);
    expect(actual[0]!.metrics!.totalReturn).toBe(.005);
    expect(virtual[0]!.demoAdmission).toEqual(admission);
    expect(actual[0]!.demoAdmission).toEqual(admission);
    expect(bt[0]!.stage).toBe('demo');
    expect(virtual[0]!.metrics!.monthly).toHaveLength(0);
    // agents= limits the rows to those agents, for both the virtual and the Capital demo view.
    expect(await get<LeaderboardRow[]>(`/api/leaderboard?kind=demo&scenario=standard&agents=${encodeURIComponent(ID)},other`)).toHaveLength(1);
    expect(await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&scenario=standard&agents=other')).toHaveLength(0);
    expect(await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&stage=demo&agents=other')).toHaveLength(0);
    expect(await get<LeaderboardRow[]>(`/api/leaderboard?kind=demo&stage=demo&agents=${encodeURIComponent(ID)}`)).toHaveLength(1);
    const detail = await get<RunDetail>(`/api/runs/${encodeURIComponent(RUN)}`);
    expect(detail.metrics!.monthly).toHaveLength(1);
    expect(detail.evidence?.costs?.closedTrades).toBe(0);
    expect(db.run(RUN)!.snapshot).toBe(snapshot);
    expect((await get<AgentListItem[]>('/api/agents')).length).toBe(1);
    const noneAgents = await get<AgentListItem[]>('/api/agents?runs=none');
    expect(noneAgents).toHaveLength(1);
    expect(noneAgents[0]!.demo).toHaveLength(0);
    expect(noneAgents[0]!.backtest).toHaveLength(0);
    const bundle = await get<AgentBundle>(`/api/agent-bundle/${encodeURIComponent(ID)}`);
    expect(bundle.agent.id).toBe(ID);
    expect(bundle.agent.versions[0]!.source).toBe('');
    expect(bundle.liveRuns).toHaveLength(1);
    expect(bundle.liveRuns[0]!.equityCurve).toHaveLength(0);
    expect(bundle.capital).toHaveLength(1);
    expect(bundle.backtests).toHaveLength(1);
    expect((await fetch(`http://127.0.0.1:${api.port}/api/evidence/cost-candidates?from=0`)).status).toBe(401);
    expect((await fetch(`http://127.0.0.1:${api.port}/api/evidence/costs`,{method:'POST',body:'[]'})).status).toBe(401);
    const waitingId = RUN.replace(':x1:', ':x2:');
    db.createDemoRun({ id: waitingId, agentId: ID, codeHash: 'hash', epic: EPIC, leverage: 2, capital: 10_000, params: {}, now: 1 });
    db.setRunExtra(waitingId, { scenario: 'standard', demoAdmission: admission });
    mirroredRuns.push(waitingId);
    const waiting = (await get<LeaderboardRow[]>('/api/leaderboard?kind=demo&stage=demo')).find(r => r.runId === waitingId);
    expect(waiting?.demoAdmission).toEqual(admission);
    expect(waiting?.equity).toBe(2000);
    expect(waiting?.metrics).toBeNull();
    expect(waiting?.brokerEvidence?.closed).toBe(0);
    const response = await fetch(`http://127.0.0.1:${api.port}/api/backtests`, { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  } finally {recoveryLists.mockRestore();await api.stop(true); db.db.close(); }
});

test('materialized run_costs stay exact across appendTrade, replacement, attachExecution, and backtest archival', () => {
  const db = new ArenaDB(':memory:');
  try {
    db.createDemoRun({ id: RUN, agentId: ID, codeHash: 'hash', epic: EPIC, leverage: 1, capital: 10_000, params: {}, now: 1 });
    db.appendTrade(RUN, 0, {
      side: 'long', size: 1, entryTime: 10, entryPrice: 100, exitTime: 20, exitPrice: 112,
      pnl: 10, funding: -2, exitReason: 'signal', barsHeld: 1,
    });
    db.appendTrade(RUN, 1, {
      side: 'short', size: 1, entryTime: 30, entryPrice: 110, exitTime: 40, exitPrice: 105,
      pnl: 5, funding: 0, exitReason: 'signal', barsHeld: 1,
      execution: { method: 'fill-quotes', midpointPnl: 6, spreadCost: 1, adjustmentPnl: 0, timingCost: 0.5 } as any,
    });
    expect(db.attachExecution(RUN, 0, { method: 'archived-quote-match', midpointPnl: 12, spreadCost: 2, adjustmentPnl: 0 } as any)).toBe(true);
    let tot = db.costTotals('demo', false, RUN)[0]!;
    expect(tot.closedTrades).toBe(2);
    expect(tot.closedNetPnl).toBeCloseTo(15, 8);
    expect(tot.closedFunding).toBeCloseTo(-2, 8);
    expect(tot.beforeFundingPnl).toBeCloseTo(17, 8);
    expect(tot.measuredTrades).toBe(2);
    expect(tot.capturedTrades).toBe(1);
    expect(tot.reconstructedTrades).toBe(1);
    expect(tot.midpointPnl).toBeCloseTo(18, 8);
    expect(tot.spreadCost).toBeCloseTo(3, 8);
    expect(tot.timedTrades).toBe(1);
    expect(tot.timingCost).toBeCloseTo(0.5, 8);
    expect(tot.timedSignalPnl).toBeCloseTo(6.5, 8);
    expect(tot.timedNetPnl).toBeCloseTo(5, 8);

    // Replacing trade 0 updates run_costs cleanly without double counting.
    db.appendTrade(RUN, 0, {
      side: 'long', size: 1, entryTime: 10, entryPrice: 100, exitTime: 20, exitPrice: 120,
      pnl: 20, funding: -1, exitReason: 'signal', barsHeld: 1,
    });
    tot = db.costTotals('demo', false, RUN)[0]!;
    expect(tot.closedTrades).toBe(2);
    expect(tot.closedNetPnl).toBeCloseTo(25, 8);
    expect(tot.measuredTrades).toBe(1);
    expect(tot.reconstructedTrades).toBe(0);
  } finally {
    db.db.close();
  }
});
