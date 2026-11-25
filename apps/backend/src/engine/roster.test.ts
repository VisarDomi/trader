import { describe, expect, test } from 'bun:test';
import { defineAgent } from '../sdk/index.ts';
import { LEVERAGE_TIERS } from './leverage.ts';
import type { LoadedAgent } from './loader.ts';
import { loadAgents } from './loader.ts';
import type { Roster } from './roster.ts';
import { demoAdmissionFor, familyOf, leveragesFor, loadRoster, planRuns, retiredBy, rosterProblems } from './roster.ts';

function agent(id: string, instruments: string[], leverage?: number[]): LoadedAgent {
  const def = defineAgent({ name: id, description: 'test', instruments, timeframe: '1h', params: {}, leverage, onBar() {} });
  const [slug, variant = null] = id.split('/');
  return { id, slug: slug!, variant, file: 'x', def, params: {}, codeHash: 'h', source: '' };
}

const roster = (patch: Partial<Roster> = {}): Roster => ({ accounts: {}, leverage: { default: 20, agents: {} }, retired: {}, ...patch });

describe('roster', () => {
  test('a family is the agent file unless the roster joins several files, retired ones included', () => {
    const r = roster({ families: { night: { name: 'Night', slugs: ['night-a', 'night-old'] } } });
    expect(familyOf(r, 'night-a')).toEqual({ id: 'night', name: 'Night' });
    expect(familyOf(r, 'night-old')).toEqual({ id: 'night', name: 'Night' });   // its file is retired and not loaded
    expect(familyOf(r, 'trend')).toEqual({ id: 'trend' });
    expect(familyOf(null, 'trend')).toEqual({ id: 'trend' });
    const agents = [agent('night-a/x', ['US500']), agent('trend', ['US500'])];
    expect(rosterProblems(r, agents)).toEqual([]);
    expect(rosterProblems(roster({ families: { night: { name: 'Night', slugs: ['night-a'] }, other: { name: 'Other', slugs: ['night-a'] } } }), agents)).toEqual(['families["other"]: night-a is already in night']);
    expect(rosterProblems(roster({ families: { night: { name: ' ', slugs: [] } } }), agents)).toEqual(['families["night"]: a name and at least one file slug are required']);
    // A family id that is a file's slug must contain that file, or the file would be judged under a name it does not have.
    expect(rosterProblems(roster({ families: { trend: { name: 'Trend', slugs: ['night-a'] } } }), agents)).toEqual(['families["trend"]: the id is a file slug that the family does not list']);
  });
  test('a special demo admission applies only to the exact instrument, tier and source version', () => {
    const id = 'night';
    const epic = 'US500';
    const hash = 'h';
    const r = roster({ demoAdmissions: { [`${id}:${epic}@200`]: { codeHash: hash, date: '2026-10-15', reason: 'user experiment' } } });
    expect(demoAdmissionFor(r, id, epic, 200, hash)).not.toBeNull();
    expect(demoAdmissionFor(r, id, epic, 100, hash)).toBeNull();
    expect(demoAdmissionFor(r, id, 'US100', 200, hash)).toBeNull();
    expect(demoAdmissionFor(r, id, epic, 200, 'changed')).toBeNull();
  });
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
