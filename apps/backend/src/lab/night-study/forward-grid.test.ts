import { describe, expect, test } from 'bun:test';
import { loadAgents } from '../../engine/loader';
import { gridCells, periodReturn, DAY_FILTERS, GAPS, LEVERAGE, SIDES, WINDOWS } from './forward-grid';

describe('Visar night paper grid', () => {
  test('covers every combination once, with no inert exits', () => {
    for (const epic of ['US500', 'US100']) {
      const cells = gridCells(epic);
      expect(cells.length).toBe(WINDOWS.length * DAY_FILTERS.length * GAPS.length * LEVERAGE.length * SIDES.length);
      expect(cells.length).toBe(540);
      expect(new Set(cells.map(c => c.id)).size).toBe(540);
      for (const c of cells) {
        expect(c.params.lossPct).toBe(50);
        expect(c.params.profitPct).toBe(0);
        expect(c.params.minPullbackBp).toBe(c.gapBp ?? 0);
        expect(c.params.pullback).toBe(c.gapBp === null ? 0 : 1);
        expect(c.params.direction).toBe(c.side);
      }
    }
  });

  test('cells that overlap the unified Visar Night family use the exact same settings', async () => {
    const { agents } = await loadAgents();
    const byId = new Map(agents.map(a => [a.id, a]));
    const expected: Record<string, string> = {
      'full-day-200': 'full/standard/gap-0bp/x200/rule',
      'midday-200': 'central/standard/gap-0bp/x200/rule',
      'midday-20': 'central/standard/gap-0bp/x20/rule',
      'full-day-20': 'full/standard/gap-0bp/x20/rule',
      'no-pullback-20': 'central/standard/no-pullback/x20/rule',
      'loose-body-20': 'central/loose-body/gap-0bp/x20/rule',
      'any-day-20': 'central/any-day/gap-0bp/x20/rule',
      'every-night-20': 'central/any-day/no-pullback/x20/rule',
      'always-long': 'central/standard/gap-0bp/x20/long',
      'random-direction': 'central/standard/gap-0bp/x20/random',
    };
    let checked = 0;
    const base = { ...byId.get('visar-night/midday-20')!.params, direction: 'rule', pullback: 1 };
    for (const epic of ['US500', 'US100']) {
      const cells = new Map(gridCells(epic).map(c => [c.id, c]));
      for (const a of agents.filter(x => x.slug === 'visar-night' || x.slug === 'visar-night-control')) {
        const cell = cells.get(expected[a.variant!]!)!;
        expect(cell).toBeDefined();
        expect({ ...base, ...cell.params }).toEqual({ direction: 'rule', pullback: 1, ...a.params });
        checked++;
      }
    }
    expect(checked).toBe(20);
  });

  test('period returns compound on equity at each entry', () => {
    const trades = [{ entryTime: 1, pnl: 1000 }, { entryTime: 5, pnl: -1100 }, { entryTime: 9, pnl: 500 }];
    expect(periodReturn(trades, 10000, 0, 10).ret).toBeCloseTo(1.1 * 0.9 * (1 + 500 / 9900) - 1, 12);
    const later = periodReturn(trades, 10000, 5, 10);
    expect(later.trades).toBe(2);
    expect(later.wins).toBe(1);
    expect(later.ret).toBeCloseTo((1 - 1100 / 11000) * (1 + 500 / 9900) - 1, 12);
    expect(periodReturn(trades, 10000, 10, 20)).toEqual({ trades: 0, wins: 0, ret: 0 });
  });
});
