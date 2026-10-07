import { describe, expect, test } from 'bun:test';
import { accountsNeeded, assignSlots } from './slots.ts';

const run = (agent: string, epic: string) => ({ runId: `demo:${agent}:${epic}:h`, epic });
const NONE = new Set<string>();

describe('assignSlots', () => {
  test('one run per instrument per account, within the slot count', () => {
    const candidates = [run('a', 'US100'), run('b', 'US100'), run('c', 'US100'), run('a', 'GOLD')];
    const { assignments, unassigned } = assignSlots({}, [{ name: 'A1', slots: 10 }, { name: 'A2', slots: 10 }], candidates, NONE);
    expect(Object.keys(assignments)).toHaveLength(3);
    expect(assignments['demo:a:US100:h']).not.toBe(assignments['demo:b:US100:h']);
    expect(unassigned).toEqual([run('c', 'US100')]);
  });

  test('keeps existing assignments and fills free slots best-first', () => {
    const current = { 'demo:x:GOLD:h': 'Gerti' };
    const candidates = [run('y', 'GOLD'), run('x', 'GOLD')];
    const { assignments, unassigned } = assignSlots(current, [{ name: 'Gerti', slots: 5 }], candidates, NONE);
    expect(assignments).toEqual({ 'demo:x:GOLD:h': 'Gerti' });
    expect(unassigned).toEqual([run('y', 'GOLD')]);
  });

  test('drops runs that stopped, were excluded, or whose account is gone', () => {
    const current = { 'demo:gone:US30:h': 'A1', 'demo:ex:US30:h': 'A1', 'demo:moved:US30:h': 'Old' };
    const candidates = [run('ex', 'US30'), run('moved', 'US30')];
    const { assignments } = assignSlots(current, [{ name: 'A1', slots: 10 }], candidates, new Set(['demo:ex:US30:h']));
    expect(assignments).toEqual({ 'demo:moved:US30:h': 'A1' });
  });

  test('respects slot limits and blocked instruments', () => {
    const candidates = [run('a', 'US100'), run('a', 'GOLD'), run('a', 'EURUSD')];
    const { assignments, unassigned } = assignSlots({}, [{ name: 'A1', slots: 2, blockedEpics: new Set(['US100']) }], candidates, NONE);
    expect(Object.values(assignments)).toEqual(['A1', 'A1']);
    expect(unassigned).toEqual([run('a', 'US100')]);
  });

  test('spreads runs over the account with the most free slots', () => {
    const candidates = [run('a', 'US100'), run('a', 'GOLD')];
    const { assignments } = assignSlots({}, [{ name: 'Small', slots: 5 }, { name: 'Big', slots: 10 }], candidates, NONE);
    expect(Object.values(assignments)).toEqual(['Big', 'Big']);
  });
});

describe('accountsNeeded', () => {
  test('bounded by the busiest instrument and by total slots', () => {
    expect(accountsNeeded([], 10)).toBe(0);
    expect(accountsNeeded([run('a', 'US100'), run('b', 'US100'), run('c', 'GOLD')], 10)).toBe(2);
    const many = Array.from({ length: 25 }, (_, i) => run(`a${i}`, `E${i % 12}`));
    expect(accountsNeeded(many, 10)).toBe(3);
  });
});
