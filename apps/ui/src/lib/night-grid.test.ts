import {expect,test} from 'bun:test';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {nightGrid,summarizeGrid,GRID_CELLS} from './server/night-grid';

const period={trades:0,wins:0,ret:0};
function file(epic:string,over:Record<string,unknown>={}){
  const sides=['rule','long','random'];
  return {schema:1,epic,generatedAt:1000,window:{start:0,end:10,cohortDefined:5},data:null,dimensions:{},sources:{},
    cells:Array.from({length:GRID_CELLS},(_,i)=>({id:`c${Math.floor(i/3)}/${sides[i%3]}`,window:'central',day:'standard',gapBp:0,leverage:20,side:sides[i%3],status:'completed',trades:1,wins:1,totalReturn:.01,maxDrawdown:0,holdout:period,forward:period,nights:[{entry:1}]})),...over};
}

test('grid summary drops per-night ledgers and keeps every cell', () => {
  const s = summarizeGrid(file('US500') as any,'US500');
  expect(s.cells.length).toBe(GRID_CELLS);
  expect(s.cells.every(c=>!('nights' in c))).toBe(true);
});

test('grid summary rejects other versions, other indexes and partial grids', () => {
  expect(()=>summarizeGrid(file('US500',{schema:2}) as any,'US500')).toThrow();
  expect(()=>summarizeGrid(file('US100') as any,'US500')).toThrow();
  const partial = file('US500'); partial.cells.pop();
  expect(()=>summarizeGrid(partial as any,'US500')).toThrow();
  const bad = file('US500'); (bad.cells[0] as any).totalReturn = null;
  expect(()=>summarizeGrid(bad as any,'US500')).toThrow();
});

test('the feed needs both indexes and reports the older build time', async () => {
  const dir = mkdtempSync(join(tmpdir(),'night-grid-'));
  writeFileSync(join(dir,'US500.json'),JSON.stringify(file('US500',{generatedAt:2000})));
  await expect(nightGrid(dir)).rejects.toThrow();
  writeFileSync(join(dir,'US100.json'),JSON.stringify(file('US100')));
  const feed = await nightGrid(dir);
  expect(feed.epics.map(e=>e.epic)).toEqual(['US500','US100']);
  expect(feed.at).toBe(1000);
});
