/**
 * Nightly paper grid for the Visar night rule (user request 2026-11-09).
 *
 * The ten demo agents per index are single probes. This grid replays every meaningful combination of the
 * dimensions that change what the rule trades — NY window × day filter × overnight gap × leverage × side —
 * through the full engine on data after the study window, so the map grows one night at a time.
 * Inert settings are left out: profit targets and the 50% loss limit at 1:20 never or almost never act.
 * Paper only: nothing here touches the arena, the broker or the primary database (it reads candles/ticks).
 *
 *   bun run night-grid [US500|US100] [--out <dir>] [--full] [--end YYYY-MM-DD]
 */
import {createHash} from 'node:crypto';
import {mkdirSync,renameSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {loadAgents,type LoadedAgent} from '../../engine/loader';
import {ENGINE_VERSION} from '../../engine/version';
import {backtestEpic,BACKTEST_CAPITAL,STANDARD_WINDOW,type BacktestWindow} from '../backtest-core';
import {TICK_MODE} from '../tick-tape';

const DAY_MS=86_400_000;
/** First night after the study window; nothing from here on was used to design the rule or the cohort. */
export const GRID_START=STANDARD_WINDOW.end;
/** The v3 cohort was chosen on 2026-11-09; nights after this are forward in the strict sense. */
export const COHORT_DEFINED=Date.UTC(2026,10,10);
export const EPICS=['US500','US100'] as const;
export const WINDOWS=[
  {id:'central',label:'10:30–15:30 NY',params:{sessionStart:630,sessionEnd:930}},
  {id:'full',label:'09:30–16:00 NY',params:{sessionStart:570,sessionEnd:960}},
] as const;
/** The standard day filter plus one stricter test each; names match the demo cohort where they overlap. */
export const DAY_FILTERS=[
  {id:'standard',label:'Standard day filter',params:{}},
  {id:'big-move',label:'Day move ≥0.5%',params:{trendPct:.5}},
  {id:'strong-day',label:'Net move ≥80% of range',params:{minBodyShare:.8}},
  {id:'steady-day',label:'≥62% of 15-min steps agree',params:{minDirectionalShare:16/26}},
  {id:'efficient-day',label:'Path efficiency ≥60%',params:{minEfficiency:.6}},
  {id:'small-pullback',label:'Pullback ≤50% of range',params:{maxRetraceShare:.5}},
  {id:'tiny-pullback',label:'Pullback ≤35% of range',params:{maxRetraceShare:.35}},
] as const;
/** Minimum overnight counter-move at 03:27, basis points. 0 = any counter-move. */
export const GAPS=[0,5,15,30] as const;
/** 1:20 (the 50% loss limit is out of reach) and 1:200 (it binds at about a 0.28% adverse move). */
export const LEVERAGE=[20,200] as const;
/** rule = the agent's own side; long = always buy; random = fair coin. Same eligible nights for all three. */
export const SIDES=['rule','long','random'] as const;
export type Side=typeof SIDES[number];

export interface GridCell {
  id:string;epic:string;window:string;day:string;gapBp:number;leverage:number;side:Side;
  params:Record<string,unknown>;
}

export function gridCells(epic:string):GridCell[] {
  return WINDOWS.flatMap(w=>DAY_FILTERS.flatMap(d=>GAPS.flatMap(gapBp=>LEVERAGE.flatMap(leverage=>SIDES.map(side=>({
    id:`${w.id}/${d.id}/gap-${gapBp}bp/x${leverage}/${side}`,epic,window:w.id,day:d.id,gapBp,leverage,side,
    params:{...w.params,...d.params,minPullbackBp:gapBp,lossPct:50,profitPct:0,marginPct:90,...(side==='rule'?{}:{direction:side})},
  }))))));
}

/** Compounded return of the trades whose entry falls in [from, to), measured on equity at each entry. */
export function periodReturn(trades:readonly {entryTime:number;pnl:number}[],capital:number,from:number,to:number):{trades:number;wins:number;ret:number} {
  let equity=capital,growth=1,n=0,wins=0;
  for(const t of trades){
    if(t.entryTime>=from&&t.entryTime<to){growth*=equity>0?1+t.pnl/equity:1;n++;if(t.pnl>0)wins++}
    equity+=t.pnl;
  }
  return {trades:n,wins,ret:growth-1};
}

function sourceAgents(all:LoadedAgent[],epic:string){
  const index=epic.toLowerCase(),rule=all.find(a=>a.id===`visar-night-v3-${index}/base`),control=all.find(a=>a.id===`visar-night-v3-control-${index}/always-long`);
  if(!rule||!control)throw Error(`v3 cohort agents for ${epic} are missing`);
  return {rule,control};
}

export async function runGrid(epic:string,end:number,full=false){
  const {agents:all}=await loadAgents(),{rule,control}=sourceAgents(all,epic);
  const window:BacktestWindow={id:'night-grid',start:GRID_START,end};
  const cells=gridCells(epic);
  const specs=cells.map(c=>{
    const src=c.side==='rule'?rule:control,params={...src.params,...c.params};
    const agent:LoadedAgent={...src,id:`night-grid/${epic}/${c.id}`,slug:'night-grid',variant:c.id,params,
      codeHash:createHash('sha256').update(src.codeHash+JSON.stringify(params)).digest('hex').slice(0,12)};
    return {agent,leverage:c.leverage};
  });
  const began=Date.now();
  // Recorded quotes wherever the archive has them, minute candles otherwise (the same rule as every backtest).
  // Idle minutes carry only their open/high/low/close quotes: these agents decide on closed bars, and the
  // 2026-11-09 check matched a full replay exactly for all 672 settings. --full replays every quote.
  const results=await backtestEpic(epic,specs,window,null,{mode:TICK_MODE.AUTO,seed:1,ticksPerMinute:16},{idleOhlcOnly:!full});
  const failed=results.filter(r=>r.errors>0||!['completed','busted'].includes(r.status));
  if(failed.length)throw Error(`${failed.length} grid runs failed, first ${failed[0]!.agentId}: ${failed[0]!.logs.at(-1)?.message??failed[0]!.status}`);
  const data=results[0]?.data;
  return {
    schema:1,epic,engineVersion:ENGINE_VERSION,generatedAt:Date.now(),durationMs:Date.now()-began,idleQuotes:full?'all':'ohlc',
    window:{start:window.start,end:window.end,cohortDefined:COHORT_DEFINED},
    sources:{rule:{id:rule.id,codeHash:rule.codeHash},control:{id:control.id,codeHash:control.codeHash}},
    data:data?{mode:data.mode,recordedTicks:data.recordedTicks,syntheticTicks:data.syntheticTicks,recordedMinutes:(data as any).recordedMinutes??null,candleMinutes:(data as any).candleMinutes??null}:null,
    dimensions:{windows:WINDOWS,dayFilters:DAY_FILTERS,gapsBp:GAPS,leverage:LEVERAGE,sides:SIDES},
    cells:cells.map((c,i)=>{
      const r=results[i]!,m=r.metrics;
      return {
        id:c.id,window:c.window,day:c.day,gapBp:c.gapBp,leverage:c.leverage,side:c.side,codeHash:specs[i]!.agent.codeHash,
        status:r.status,trades:m.trades,wins:m.trades?Math.round(m.winRate*m.trades):0,totalReturn:m.totalReturn,maxDrawdown:m.maxDrawdown,finalEquity:m.finalEquity,
        holdout:periodReturn(r.trades,BACKTEST_CAPITAL,GRID_START,COHORT_DEFINED),
        forward:periodReturn(r.trades,BACKTEST_CAPITAL,COHORT_DEFINED,end),
        nights:r.trades.map(t=>({entry:t.entryTime,exit:t.exitTime,side:t.side,entryPrice:t.entryPrice,exitPrice:t.exitPrice,pnl:Math.round(t.pnl*100)/100,reason:t.exitReason})),
      };
    }),
  };
}

async function main(){
  const args=Bun.argv.slice(2),value=(flag:string)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:undefined};
  const out=resolve(value('--out')??join(import.meta.dir,'../../../data/night-grid')),full=args.includes('--full'),endDay=value('--end');
  const epics=args.filter((a,i)=>!a.startsWith('--')&&!['--out','--end'].includes(args[i-1]??''));
  const chosen=epics.length?epics:[...EPICS];
  if(chosen.some(e=>!(EPICS as readonly string[]).includes(e)))throw Error('Use night-grid [US500|US100] [--out <dir>] [--full] [--end YYYY-MM-DD]');
  // Up to the start of today (UTC): every night that has ended by the 03:30 Tirana run is complete.
  const end=endDay?Date.parse(endDay+'T00:00:00Z'):Math.floor(Date.now()/DAY_MS)*DAY_MS;
  if(!Number.isFinite(end))throw Error('Invalid --end date');
  mkdirSync(out,{recursive:true});
  for(const epic of chosen){
    const grid=await runGrid(epic,end,full),path=join(out,`${epic}.json`);
    writeFileSync(path+'.partial',JSON.stringify(grid));renameSync(path+'.partial',path);
    const traded=grid.cells.filter(c=>c.trades>0).length;
    console.log(`${epic}: ${grid.cells.length} cells, ${traded} traded, ${Math.round(grid.durationMs/1000)}s -> ${path}`);
  }
}
if(import.meta.main)await main();
