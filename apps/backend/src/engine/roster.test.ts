import { describe, expect, test } from 'bun:test';
import { defineAgent } from '../sdk/index.ts';
import { LEVERAGE_TIERS } from './leverage.ts';
import type { LoadedAgent } from './loader.ts';
import { loadAgents } from './loader.ts';
import type { Roster } from './roster.ts';
import { leveragesFor, loadRoster, planRuns, retiredBy, rosterProblems } from './roster.ts';

function agent(id: string, instruments: string[], leverage?: number[]): LoadedAgent {
  const def = defineAgent({ name: id, description: 'test', instruments, timeframe: '1h', params: {}, leverage, onBar() {} });
  const [slug, variant = null] = id.split('/');
  return { id, slug: slug!, variant, file: 'x', def, params: {}, codeHash: 'h', source: '' };
}

const roster = (patch: Partial<Roster> = {}): Roster => ({ accounts: {}, leverage: { default: 20, agents: {} }, retired: {}, ...patch });

describe('roster', () => {
  test('tiers come from the roster by id, then by slug, then the agent file, then the default', () => {
    const r = roster({ leverage: { default: 20, agents: { 'x/a': [1], x: [200] } } });
    expect(leveragesFor(r, agent('x/a', ['US100']))).toEqual([1]);
    expect(leveragesFor(r, agent('x/b', ['US100']))).toEqual([200]);
    expect(leveragesFor(r, agent('y', ['US100'], [5, 1]))).toEqual([1, 5]);
    expect(leveragesFor(r, agent('z', ['US100']))).toEqual([20]);
  });

  test('tiers that give an instrument the same leverage run once', () => {
    const ladder = agent('ladder', ['US100', 'BTCUSD'], [...LEVERAGE_TIERS]);
    const { runs } = planRuns([ladder], roster());
    expect(runs.filter(r => r.epic === 'US100')).toHaveLength(9);
    expect(runs.filter(r => r.epic === 'BTCUSD').map(r => r.leverage)).toEqual([1, 2, 3, 5, 10, 20]);
  });

  test('retired keys: agent, agent:EPIC, agent@tier, agent:EPIC@tier', () => {
    const e = { date: '2026-11-02', reason: 'r' };
    expect(retiredBy(roster({ retired: { a: e } }), 'a', 'US100', 5)).toBe(e);
    expect(retiredBy(roster({ retired: { 'a:US100': e } }), 'a', 'US100', 5)).toBe(e);
    expect(retiredBy(roster({ retired: { 'a@5': e } }), 'a', 'GOLD', 5)).toBe(e);
    expect(retiredBy(roster({ retired: { 'a:US100@5': e } }), 'a', 'US100', 1)).toBeNull();
  });

  test('agents/roster.json is valid and every planned tier has a demo account', async () => {
    const { agents } = await loadAgents();
    const r = loadRoster();
    expect(rosterProblems(r, agents)).toEqual([]);
    const tiersWithAccount = new Set(Object.values(r.accounts));
    const orphans = [...new Set(planRuns(agents, r).runs.map(p => p.leverage))].filter(l => !tiersWithAccount.has(l));
    expect(orphans).toEqual([]);
  });
});
