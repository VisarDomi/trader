import { describe, expect, test } from 'bun:test';
import { accountsNeeded, assignSlots } from './slots.ts';

const run = (agent: string, epic: string) => ({ runId: `demo:${agent}:${epic}:h`, epic });
const NONE = new Set<string>();
const netting = (name: string, slots: number, blockedEpics?: Set<string>) => ({ name, slots, onePerEpic: true, blockedEpics });
const hedging = (name: string, slots: number) => ({ name, slots, onePerEpic: false });

describe('assignSlots', () => {
  test('netting accounts take one run per instrument', () => {
    const candidates = [run('a', 'US100'), run('b', 'US100'), run('c', 'US100'), run('a', 'GOLD')];
    const { assignments, unassigned } = assignSlots({}, [netting('A1', 10), netting('A2', 10)], candidates, NONE);
    expect(Object.keys(assignments)).toHaveLength(3);
    expect(assignments['demo:a:US100:h']).not.toBe(assignments['demo:b:US100:h']);
    expect(unassigned).toEqual([run('c', 'US100')]);
  });

  test('hedging accounts take many runs per instrument, up to their slots', () => {
    const candidates = [run('a', 'US100'), run('b', 'US100'), run('c', 'US100')];
    const { assignments, unassigned } = assignSlots({}, [hedging('H', 2)], candidates, NONE);
    expect(Object.values(assignments)).toEqual(['H', 'H']);
    expect(unassigned).toEqual([run('c', 'US100')]);
  });

  test('keeps existing assignments and fills free slots best-first', () => {
    const current = { 'demo:x:GOLD:h': 'A' };
    const candidates = [run('y', 'GOLD'), run('x', 'GOLD')];
    const { assignments, unassigned } = assignSlots(current, [netting('A', 5)], candidates, NONE);
    expect(assignments).toEqual({ 'demo:x:GOLD:h': 'A' });
    expect(unassigned).toEqual([run('y', 'GOLD')]);
  });

  test('drops runs that stopped, were excluded, or whose account is gone', () => {
    const current = { 'demo:gone:US30:h': 'A1', 'demo:ex:US30:h': 'A1', 'demo:moved:US30:h': 'Old' };
    const candidates = [run('ex', 'US30'), run('moved', 'US30')];
    const { assignments } = assignSlots(current, [netting('A1', 10)], candidates, new Set(['demo:ex:US30:h']));
    expect(assignments).toEqual({ 'demo:moved:US30:h': 'A1' });
  });

  test('blocked instruments only matter in netting mode', () => {
    const candidates = [run('a', 'US100'), run('a', 'GOLD')];
    const blocked = new Set(['US100']);
    expect(assignSlots({}, [netting('N', 5, blocked)], candidates, NONE).unassigned).toEqual([run('a', 'US100')]);
    expect(assignSlots({}, [{ ...hedging('H', 5), blockedEpics: blocked }], candidates, NONE).unassigned).toEqual([]);
  });

  test('spreads runs over the accounts with the most free slots', () => {
    const candidates = [run('a', 'US100'), run('b', 'US100'), run('c', 'US100'), run('d', 'US100')];
    const { assignments } = assignSlots({}, [hedging('H1', 50), hedging('H2', 50)], candidates, NONE);
    expect(Object.values(assignments).sort()).toEqual(['H1', 'H1', 'H2', 'H2']);
  });
});

describe('accountsNeeded', () => {
  test('netting: bounded by the busiest instrument and by total slots', () => {
    expect(accountsNeeded([], 10, true)).toBe(0);
    expect(accountsNeeded([run('a', 'US100'), run('b', 'US100'), run('c', 'GOLD')], 10, true)).toBe(2);
    const many = Array.from({ length: 25 }, (_, i) => run(`a${i}`, `E${i % 12}`));
    expect(accountsNeeded(many, 10, true)).toBe(3);
  });

  test('hedging: only total slots count', () => {
    expect(accountsNeeded([run('a', 'US100'), run('b', 'US100'), run('c', 'US100')], 50, false)).toBe(1);
    expect(accountsNeeded(Array.from({ length: 101 }, (_, i) => run(`a${i}`, 'US100')), 50, false)).toBe(3);
  });
});

describe('promotion', () => {
  const scored = (agent: string, epic: string, score: number) => ({ ...run(agent, epic), score });
  const always = { margin: 200, maxSwaps: 10, canDemote: () => true };

  test('a waiting run that beats the weakest mirrored one by the margin takes its slot', () => {
    const candidates = [scored('good', 'US100', 10_500), scored('ok', 'GOLD', 10_000), scored('bad', 'US30', 9_600)];
    const current = { 'demo:ok:GOLD:h': 'H', 'demo:bad:US30:h': 'H' };
    const plan = assignSlots(current, [hedging('H', 2)], candidates, NONE, always);
    expect(plan.promoted).toEqual(['demo:good:US100:h']);
    expect(plan.demoted).toEqual(['demo:bad:US30:h']);
    expect(Object.keys(plan.assignments).sort()).toEqual(['demo:good:US100:h', 'demo:ok:GOLD:h']);
    expect(plan.unassigned.map(c => c.runId)).toEqual(['demo:bad:US30:h']);
  });

  test('no swap inside the margin, or while the weaker run cannot give up its slot', () => {
    const candidates = [scored('new', 'US100', 10_000), scored('meh', 'GOLD', 9_900)];
    const current = { 'demo:meh:GOLD:h': 'H' };
    expect(assignSlots(current, [hedging('H', 1)], candidates, NONE, always).promoted).toEqual([]);
    const far = [scored('new', 'US100', 10_000), scored('bad', 'GOLD', 9_000)];
    const busy = { ...always, canDemote: () => false };
    expect(assignSlots({ 'demo:bad:GOLD:h': 'H' }, [hedging('H', 1)], far, NONE, busy).promoted).toEqual([]);
  });

  test('swaps are capped per call', () => {
    const candidates = [...Array.from({ length: 5 }, (_, i) => scored(`w${i}`, 'US100', 11_000)), ...Array.from({ length: 5 }, (_, i) => scored(`m${i}`, 'GOLD', 9_000))];
    const current = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`demo:m${i}:GOLD:h`, 'H']));
    expect(assignSlots(current, [hedging('H', 5)], candidates, NONE, { ...always, maxSwaps: 2 }).promoted).toHaveLength(2);
  });
});

describe('leverage tiers', () => {
  const always = { margin: 200, maxSwaps: 10, canDemote: () => true };
  const tiered = (agent: string, epic: string, tier: number, score = 10_000) => ({ ...run(agent, epic), tier, score });
  const account = (name: string, slots: number, tier: number) => ({ name, slots, onePerEpic: false, tier });

  test('runs only go to accounts of their tier', () => {
    const plan = assignSlots({}, [account('L1', 5, 1), account('L200', 5, 200)], [tiered('a', 'US100', 1), tiered('b', 'US100', 200), tiered('c', 'GOLD', 50)], NONE);
    expect(plan.assignments).toEqual({ 'demo:a:US100:h': 'L1', 'demo:b:US100:h': 'L200' });
    expect(plan.unassigned.map(c => c.runId)).toEqual(['demo:c:GOLD:h']);
  });

  test('a run on an account of another tier moves', () => {
    const plan = assignSlots({ 'demo:a:US100:h': 'L200' }, [account('L1', 5, 1), account('L200', 5, 200)], [tiered('a', 'US100', 1)], NONE);
    expect(plan.assignments).toEqual({ 'demo:a:US100:h': 'L1' });
  });

  test('promotion only swaps runs of the same tier', () => {
    const candidates = [tiered('weak', 'GOLD', 1, 9_000), tiered('mid', 'US30', 2, 10_000), tiered('strong', 'US100', 2, 12_000)];
    const plan = assignSlots({ 'demo:weak:GOLD:h': 'L1', 'demo:mid:US30:h': 'L2' }, [account('L1', 1, 1), account('L2', 1, 2)], candidates, NONE, always);
    expect(plan.promoted).toEqual(['demo:strong:US100:h']);
    expect(plan.demoted).toEqual(['demo:mid:US30:h']);
  });

  test('accounts needed are counted per tier', () => {
    expect(accountsNeeded([tiered('a', 'US100', 1), tiered('b', 'US100', 2)], 50, false)).toBe(2);
  });
});
