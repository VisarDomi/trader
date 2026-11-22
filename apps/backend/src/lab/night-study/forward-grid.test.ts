import {describe,expect,test} from 'bun:test';
import {loadAgents} from '../../engine/loader';
import {gridCells,periodReturn,DAY_FILTERS,GAPS,LEVERAGE,SIDES,WINDOWS} from './forward-grid';

describe('Visar night paper grid', () => {
  test('covers every combination once, with no inert exits', () => {
    for (const epic of ['US500','US100']) {
      const cells = gridCells(epic);
      expect(cells.length).toBe(WINDOWS.length*DAY_FILTERS.length*GAPS.length*LEVERAGE.length*SIDES.length);
      expect(cells.length).toBe(540);
      expect(new Set(cells.map(c=>c.id)).size).toBe(540);
      for (const c of cells) {
        expect(c.params.lossPct).toBe(50);
        expect(c.params.profitPct).toBe(0);
        expect(c.params.minPullbackBp).toBe(c.gapBp??0);
        expect(c.params.pullback).toBe(c.gapBp===null?0:1);
        expect(c.params.direction).toBe(c.side);
      }
    }
  });

  test('cells that overlap the demo cohort use exactly the demo agents\' settings, on the v4 source', async () => {
    const {agents} = await loadAgents();
    const byId = new Map(agents.map(a=>[a.id,a]));
    const expected:Record<string,string> = {
      base:'central/standard/gap-0bp/x20/rule','big-move':'central/big-move/gap-0bp/x20/rule',
      'strong-day':'central/strong-day/gap-0bp/x20/rule','steady-day':'central/steady-day/gap-0bp/x20/rule',
      'gap-5bp':'central/standard/gap-5bp/x20/rule','gap-15bp':'central/standard/gap-15bp/x20/rule',
      'leverage-200':'central/standard/gap-0bp/x200/rule','full-day-200':'full/standard/gap-0bp/x200/rule',
      'always-long':'central/standard/gap-0bp/x20/long','random-direction':'central/standard/gap-0bp/x20/random',
      'loose-body':'central/loose-body/gap-0bp/x20/rule','no-pullback':'central/standard/no-pullback/x20/rule',
      'any-day':'central/any-day/gap-0bp/x20/rule','every-night':'central/any-day/no-pullback/x20/rule','full-day':'full/standard/gap-0bp/x20/rule',
    };
    let checked = 0;
    for (const epic of ['US500','US100']) {
      const index = epic.toLowerCase(), cells = new Map(gridCells(epic).map(c=>[c.id,c]));
      // v3 agents lack the v4 switches; their defaults (direction 'rule', pullback 1) are v3's behaviour.
      const base = {...byId.get(`visar-night-v3-${index}/base`)!.params,direction:'rule',pullback:1};
      for (const a of agents.filter(a=>[`visar-night-v3-${index}`,`visar-night-v3-control-${index}`,`visar-night-v4-${index}`].includes(a.slug))) {
        const cell = cells.get(expected[a.variant!]!)!;
        expect(cell).toBeDefined();
        expect({...base,...cell.params}).toEqual({direction:'rule',pullback:1,...a.params});
        checked++;
      }
    }
    expect(checked).toBe(29);
  });

  test('period returns compound on equity at each entry', () => {
    const trades = [{entryTime:1,pnl:1000},{entryTime:5,pnl:-1100},{entryTime:9,pnl:500}];
    expect(periodReturn(trades,10000,0,10).ret).toBeCloseTo(1.1*0.9*(1+500/9900)-1,12);
    const later = periodReturn(trades,10000,5,10);
    expect(later.trades).toBe(2);
    expect(later.wins).toBe(1);
    expect(later.ret).toBeCloseTo((1-1100/11000)*(1+500/9900)-1,12);
    expect(periodReturn(trades,10000,10,20)).toEqual({trades:0,wins:0,ret:0});
  });
});
