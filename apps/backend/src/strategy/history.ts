import type { Database } from 'bun:sqlite';
import { sql } from '../data/db';
import { IndicatorCache,makeIndicators } from '../sdk/ta';
import { localTime,TZ } from '../sdk/time';
import { TIMEFRAME_MS,type Bar,type Timeframe,type Side } from '../sdk/types';
import type { Subject } from '../inspection/model';
import { explain,supportedVersions,type Inputs,type StrategyContext } from './evidence';
import { classifyNightSession,nightSessionFeatures } from '../../agents/visar-night-trading';

/** Aggregated closed candles only; the live callback's exact inputs are never asserted by a reconstruction. */
export async function historicalBars(epic:string,tf:Timeframe,through:number,arena?:Database):Promise<Bar[]>{
  const ms=TIMEFRAME_MS[tf],span=Math.min(500*86400000,Math.max(3*86400000,ms*1200*1.8));
  const archived=await sql.begin(async tx=>{
    await tx`SET TRANSACTION READ ONLY`;
    await tx`SET LOCAL statement_timeout='6000ms'`;
    await tx`SET LOCAL max_parallel_workers_per_gather=0`;
    const rows=await tx`SELECT floor(timestamp::numeric/${ms})*${ms} t,
      (array_agg(open ORDER BY timestamp))[1] o,MAX(high) h,MIN(low) l,
      (array_agg(close ORDER BY timestamp DESC))[1] c,SUM(volume) v,
      (array_agg(spread ORDER BY timestamp DESC))[1] s
      FROM candles WHERE instrument=${epic} AND timestamp>=${through-span} AND timestamp+60000<=${through}
      AND floor(timestamp::numeric/${ms})*${ms}+${ms}<=${through}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 1200`;
    return rows.reverse().map((r:any)=>({time:Number(r.t),open:Number(r.o),high:Number(r.h),low:Number(r.l),close:Number(r.c),volume:Number(r.v),spread:Number(r.s)}));
  });
  const merged=new Map<number,Bar>(archived.map((b:Bar)=>[b.time,b]));
  if(arena){
    const row=arena.query<any,[]>('SELECT value FROM kv WHERE key=\'feed.ticksSince\'').get(),tickStart=row?JSON.parse(row.value):Number.MAX_SAFE_INTEGER;
    const local=arena.query<any,[string,number,number,number,string,number,number]>(`SELECT t,o,h,l,c,spread,volume FROM candles WHERE epic=? AND t>=? AND t+60000<=? AND t<?
      UNION ALL SELECT t,o,h,l,c,spread,volume FROM stream_candles WHERE epic=? AND t>=? AND t+60000<=? ORDER BY t DESC LIMIT 100000`).all(epic,through-span,through,tickStart,epic,through-span,through).reverse();
    const aggregated=new Map<number,Bar>();
    for(const x of local){const t=Math.floor(x.t/ms)*ms;if(t+ms>through)continue;const old=aggregated.get(t);
      if(old){old.high=Math.max(old.high,x.h);old.low=Math.min(old.low,x.l);old.close=x.c;old.volume+=x.volume;old.spread=x.spread;}
      else aggregated.set(t,{time:t,open:x.o,high:x.h,low:x.l,close:x.c,spread:x.spread,volume:x.volume});}
    if(tf==='1d')for(const x of arena.query<any,[string,number,number]>('SELECT * FROM daily_bars WHERE epic=? AND t>=? AND t+86400000<=?').all(epic,through-span,through))merged.set(x.t,{time:x.t,open:x.o,high:x.h,low:x.l,close:x.c,volume:x.volume,spread:x.spread});
    for(const [t,b]of aggregated)merged.set(t,b);
  }
  return [...merged.values()].sort((a,b)=>a.time-b.time).slice(-1200);
}
const view=(bars:Bar[])=>({bars,ta:makeIndicators(new IndicatorCache(bars))});

export function reconstructedState(slug:string,b:readonly Bar[],at:number,p:Record<string,any>):Record<string,any>{
  const state:Record<string,any>={};
  if(slug==='visar-night-trading'||slug==='night-risk-twin'||slug==='visar-night-lab'||slug==='visar-night-us100'){
    let day:any=null;
    for(const bar of b){
      const ny=localTime(bar.time,TZ.NEW_YORK),local=localTime(bar.time+60000,p.timeZone);
      if(ny.minuteOfDay===570&&ny.weekday>=1&&ny.weekday<=5)day={date:ny.date,localDate:local.date,open:bar.open,high:bar.open,low:bar.open,maxDrawdown:0,maxRebound:0,minutes:0,points:[bar.open],direction:0};
      if(day&&ny.date===day.date&&ny.minuteOfDay>=570&&ny.minuteOfDay<960){
        day.minutes++;day.high=Math.max(day.high,bar.high);day.low=Math.min(day.low,bar.low);
        day.maxDrawdown=Math.max(day.maxDrawdown,day.high-bar.low);day.maxRebound=Math.max(day.maxRebound,bar.high-day.low);
        if((ny.minuteOfDay+1-570)%15===0)day.points.push(bar.close);
        if(ny.minuteOfDay+1===960)day.direction=classifyNightSession(nightSessionFeatures(day),p as any);
      }
      if(local.minuteOfDay===1320){state.reference=bar.close;state.referenceDate=local.date;}
    }
    state.session=day;return state;
  }
  if(['volatility-breakout','quote-breakout'].includes(slug)){
    for(const bar of b){const date=localTime(bar.time+21600000,TZ.NEW_YORK).date;
      if(date!==state.day){if(state.day)state.prevRange=state.high-state.low;Object.assign(state,{day:date,open:bar.open,high:bar.high,low:bar.low});}
      else{state.high=Math.max(state.high,bar.high);state.low=Math.min(state.low,bar.low);}}
    return state;
  }
  if(['orb-ny','london-breakout','ibs-dip'].includes(slug)){
    const zone=slug==='london-breakout'?TZ.LONDON:TZ.NEW_YORK,date=localTime(at-1,zone).date;
    const selected=b.filter(bar=>{const l=localTime(bar.time,zone);return l.date===date&&(slug==='london-breakout'?l.hour>=p.rangeStartHour&&l.hour<p.rangeEndHour:l.minuteOfDay>=570&&l.minuteOfDay<(slug==='orb-ny'?570+p.rangeMinutes:960));});
    if(selected.length){state.high=Math.max(...selected.map(x=>x.high));state.low=Math.min(...selected.map(x=>x.low));}
    if(slug==='ibs-dip')state.closes=b.filter(x=>localTime(x.time+1800000,TZ.NEW_YORK).minuteOfDay===960).map(x=>x.close).slice(-(p.exitAvg+3));
    return state;
  }
  if(slug==='noise-area-momentum'){
    Object.assign(state,{day:'',open:0,prevClose:0,lastClose:0,pv:0,vol:0,noise:{},today:{},dailyCloses:[]});
    for(const bar of b){const start=localTime(bar.time,TZ.NEW_YORK),ny=localTime(bar.time+1800000,TZ.NEW_YORK);if(ny.weekday===0||ny.weekday===6)continue;
      if(start.minuteOfDay===570)Object.assign(state,{day:ny.date,open:bar.open,prevClose:state.lastClose,pv:0,vol:0,today:{}});
      if(state.day!==ny.date||ny.minuteOfDay<=570||ny.minuteOfDay>960)continue;
      state.pv+=(bar.high+bar.low+bar.close)/3*bar.volume;state.vol+=bar.volume;state.today[String(ny.minuteOfDay)]=Math.abs(bar.close/state.open-1);
      if(ny.minuteOfDay===960){for(const [key,move]of Object.entries(state.today))state.noise[key]=[...(state.noise[key]??[]),move].slice(-p.lookbackDays);state.dailyCloses=[...state.dailyCloses,bar.close].slice(-(p.lookbackDays+1));state.lastClose=bar.close;}
    }return state;
  }
  if(slug==='inside-bar')for(let i=Math.max(2,b.length-p.maxAgeBars-2);i<b.length;i++){
    const mother=b[i-2]!,inside=b[i-1]!;if(inside.high<mother.high&&inside.low>mother.low)Object.assign(state,{motherHigh:mother.high,motherLow:mother.low,age:b.length-i});
  }
  // Other persistent allocation/swing/noise/forecast state was not stored historically.
  return state;
}

export async function strategyContext(db:Database,s:Subject):Promise<StrategyContext|null>{
  if(!s.agentId||!s.codeHash)return null;
  const has=db.query<any,[]>('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'decision_frames\'').get();
  if(has){
    const frame=db.query<any,[string,number]>('SELECT payload FROM decision_frames WHERE run_id=? AND entry_time=? ORDER BY decision_time DESC LIMIT 1').get(s.runId,s.intentEntryTime??s.entryTime);
    if(frame){const d=JSON.parse(typeof frame.payload==='string'?frame.payload:new TextDecoder().decode(Bun.gunzipSync(frame.payload))) as StrategyContext;if(d.schema===1&&d.codeHash===s.codeHash&&d.agentId===s.agentId)return d;}
  }
  const slug=s.agentId.split('/')[0]!,v=supportedVersions[slug];
  if(!v||v.hash!==s.codeHash)return {schema:1,agentId:s.agentId,codeHash:s.codeHash,at:s.entryTime,barTime:s.entryTime,basis:'unavailable',title:'Historical strategy version',description:s.name,note:'No reviewed explanation adapter for this exact source. The recorded entry/exit reasons remain available.',gates:[],panels:[],exitRule:s.exitReason??'Not recorded',protections:{stopLoss:null,takeProfit:null,closeAt:null}};
  const at=s.decisionTime??Math.floor(s.entryTime/60000)*60000,bars=await historicalBars(s.epic,v.timeframe,at,db);
  if(!bars.length)return null;
  const primary=view(bars),extra=new Map<Timeframe,ReturnType<typeof view>>();
  for(const tf of v.extra)extra.set(tf,view(await historicalBars(s.epic,tf,at,db)));
  const p=s.params??{},state=reconstructedState(slug,bars,at,p);
  if(slug==='swing-reversal'){
    const prior=db.query<any,[string,number]>('SELECT entry_time FROM trades WHERE run_id=? AND entry_time<? ORDER BY entry_time DESC LIMIT 1').get(s.runId,s.intentEntryTime??s.entryTime);
    if(prior){const ms=TIMEFRAME_MS[v.timeframe],anchor=bars.findLast(x=>x.time+ms<=prior.entry_time);if(anchor){const path=bars.filter(x=>x.time>=anchor.time);state.swingHigh=Math.max(...path.map(x=>x.close));state.swingLow=Math.min(...path.map(x=>x.close));}}
  }
  if(slug==='donchian-ensemble'){const count=s.entryReason?.match(/(\d+) of 5 systems long/);if(count)state.systemsLongCount=Number(count[1]);}
  const ctx:Inputs={...primary,bar:bars.at(-1)!,time:at,timeframe:v.timeframe,params:p,state,
    tf:t=>{if(t===v.timeframe)return primary;const x=extra.get(t);if(!x)throw Error('Unavailable timeframe');return x;},
    forecast:null,tick:null,equity:s.entryEquity??NaN,leverage:s.leverage??1,position:null};
  const result=explain(s.agentId,s.codeHash,ctx,s.side as Side,{},'reconstructed');
  if(s.decisionTime===undefined)result.note+=' The fill minute approximates the unavailable decision time.';
  return result;
}
