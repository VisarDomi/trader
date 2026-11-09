/**
 * Nightly paper grid for the Visar night rule (apps/backend/src/lab/night-study/forward-grid.ts).
 * The lab writes one JSON file per index after each nightly run; this serves a compact summary
 * without the per-night ledgers. Files live in NIGHT_GRID_DIR, else ./night-grid next to the
 * running build (PC deploys copy that folder forward), else the backend's data folder in dev.
 */
import {existsSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';

export const GRID_EPICS=['US500','US100'] as const;
export const GRID_CELLS=336;
const SIDES=new Set(['rule','long','random']);

export function nightGridDir(configured?:string):string{
  if(configured)return resolve(configured);
  const server=resolve('night-grid');
  return existsSync(server)?server:resolve('../backend/data/night-grid');
}

interface Period{trades:number;wins:number;ret:number}
interface Cell{id:string;window:string;day:string;gapBp:number;leverage:number;side:string;status:string;trades:number;wins:number;totalReturn:number;maxDrawdown:number;holdout:Period;forward:Period;nights?:unknown[]}
interface GridFile{schema:number;epic:string;generatedAt:number;window:{start:number;end:number;cohortDefined:number};data:unknown;dimensions:unknown;sources:unknown;cells:Cell[]}

/** Validates one index file; anything unexpected is rejected rather than shown half-right. */
export function summarizeGrid(file:GridFile,epic:string){
  if(file?.schema!==1||file.epic!==epic||!Array.isArray(file.cells)||file.cells.length!==GRID_CELLS)throw Error(`${epic} grid is missing or from another version`);
  if(new Set(file.cells.map(c=>c.id)).size!==GRID_CELLS||file.cells.some(c=>!SIDES.has(c.side)||!Number.isFinite(c.totalReturn)))throw Error(`${epic} grid has invalid cells`);
  return {epic,generatedAt:file.generatedAt,window:file.window,data:file.data,dimensions:file.dimensions,sources:file.sources,
    cells:file.cells.map(({nights:_,...c})=>c)};
}

export async function nightGrid(dir:string){
  const epics=await Promise.all(GRID_EPICS.map(async epic=>summarizeGrid(JSON.parse(await readFile(join(dir,`${epic}.json`),'utf8')),epic)));
  return {schema:1,at:Math.min(...epics.map(e=>e.generatedAt)),epics};
}
