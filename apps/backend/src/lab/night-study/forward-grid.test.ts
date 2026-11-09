import {describe,expect,test} from 'bun:test';
import {loadAgents} from '../../engine/loader';
import {gridCells,periodReturn,DAY_FILTERS,GAPS,LEVERAGE,SIDES,WINDOWS} from './forward-grid';

describe('Visar night paper grid', () => {
  test('covers every combination once, with no inert exits', () => {
    for (const epic of ['US500','US100']) {
      const cells = gridCells(epic);
      expect(cells.length).toBe(WINDOWS.length*DAY_FILTERS.length*GAPS.length*LEVERAGE.length*SIDES.length);
      expect(cells.length).toBe(336);
      expect(new Set(cells.map(c=>c.id)).size).toBe(336);
      for (const c of cells) {
        expect(c.params.lossPct).toBe(50);
        expect(c.params.profitPct).toBe(0);
        expect(c.params.minPullbackBp).toBe(c.gapBp);
        expect('direction' in c.params).toBe(c.side!=='rule');
      }
    }
  });

  test('cells that overlap the demo cohort use exactly the demo agents\' settings', async () => {
    const {agents} = await loadAgents();
    const byId = new Map(agents.map(a=>[a.id,a]));
    const expected:Record<string,string> = {
      base:'central/standard/gap-0bp/x20/rule','big-move':'central/big-move/gap-0bp/x20/rule',
      'strong-day':'central/strong-day/gap-0bp/x20/rule','steady-day':'central/steady-day/gap-0bp/x20/rule',
      'gap-5bp':'central/standard/gap-5bp/x20/rule','gap-15bp':'central/standard/gap-15bp/x20/rule',
      'leverage-200':'central/standard/gap-0bp/x200/rule','full-day-200':'full/standard/gap-0bp/x200/rule',
      'always-long':'central/standard/gap-0bp/x20/long','random-direction':'central/standard/gap-0bp/x20/random',
    };
    let checked = 0;
    for (const epic of ['US500','US100']) {
      const index = epic.toLowerCase(), cells = new Map(gridCells(epic).map(c=>[c.id,c]));
      const rule = byId.get(`visar-night-v3-${index}/base`)!, control = byId.get(`visar-night-v3-control-${index}/always-long`)!;
      for (const a of agents.filter(a=>a.slug===`visar-night-v3-${index}`||a.slug===`visar-night-v3-control-${index}`)) {
        const cell = cells.get(expected[a.variant!]!)!;
        expect(cell).toBeDefined();
        const src = cell.side==='rule'?rule:control;
        expect({...src.params,...cell.params}).toEqual({...a.params});
        checked++;
      }
    }
    expect(checked).toBe(19);
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
