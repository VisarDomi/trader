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
