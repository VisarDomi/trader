import type { ExecutionCostEvidence } from '@trader/shared';
export interface Point {t:number;value:number}
export interface Quote {id:number;session:number;time:number;receivedAt:number;bid:number;ask:number;journalId:string}
export interface Interval {from:number;through:number}
export interface Candle {t:number;open:number;high:number;low:number;close:number}
export interface Subject {
  runId:string;key:string;stage:'virtual'|'capital'|'backtest';name:string;epic:string;side:'long'|'short';size:number;
  entryTime:number;exitTime:number|null;entryPrice:number;exitPrice:number|null;pnl:number|null;funding:number|null;
  entryEquity:number|null;leverage?:number|null;entryReason:string|null;exitReason:string|null;exitCode:string|null;
  agentId?:string;codeHash?:string;timeframe?:string;params?:Record<string,unknown>;intentEntryTime?:number;decisionTime?:number;
  execution?:ExecutionCostEvidence;stopLoss?:number|null;takeProfit?:number|null;
  timeline:{label:string;t:number}[];
}
export const INSPECTION_LIMITS={windowMs:7*86400000,points:600,scanTicks:250_000,chunks:1600,cacheBytes:16*1024*1024,cacheEntries:12};
export function mergedIntervals(intervals:Interval[]):Interval[]{
  const out:Interval[]=[];
  for(const i of intervals.filter(i=>i.through>i.from).sort((a,b)=>a.from-b.from)){
    const last=out.at(-1);if(last&&i.from<=last.through)last.through=Math.max(last.through,i.through);else out.push({...i});
  }return out;
}
export function missingIntervals(intervals:Interval[],from:number,through:number):Interval[]{
  const gaps:Interval[]=[];let cursor=from;
  for(const i of mergedIntervals(intervals)){if(i.through<=cursor||i.from>=through)continue;if(i.from>cursor)gaps.push({from:cursor,through:Math.min(through,i.from)});cursor=Math.max(cursor,i.through);}
  if(cursor<through)gaps.push({from:cursor,through});return gaps;
}
/** Preserve extrema before rendering; calculations always consume the full valid quote stream. */
export function thin(points:Point[],limit=INSPECTION_LIMITS.points):Point[]{
  if(points.length<=limit)return points;
  const out=[points[0]!],buckets=Math.max(1,Math.floor((limit-2)/2)),stride=(points.length-2)/buckets;
  for(let b=0;b<buckets;b++){
    const lo=1+Math.floor(b*stride),hi=Math.min(points.length-1,1+Math.floor((b+1)*stride));let min=lo,max=lo;
    for(let i=lo+1;i<hi;i++){if(points[i]!.value<points[min]!.value)min=i;if(points[i]!.value>points[max]!.value)max=i;}
    if(min===max)out.push(points[min]!);else for(const i of [min,max].sort((a,b)=>a-b))out.push(points[i]!);
  }out.push(points.at(-1)!);return out;
}
function sampledQuotes(q:Quote[]):Quote[]{
  if(q.length<=INSPECTION_LIMITS.points)return q;
  const ids=new Set<number>([0,q.length-1]),buckets=Math.floor((INSPECTION_LIMITS.points-2)/4),width=(q.length-2)/buckets;
  for(let b=0;b<buckets;b++){
    const from=1+Math.floor(b*width),through=Math.min(q.length-1,1+Math.floor((b+1)*width));let minBid=from,maxBid=from,minAsk=from,maxAsk=from;
    for(let i=from+1;i<through;i++){if(q[i]!.bid<q[minBid]!.bid)minBid=i;if(q[i]!.bid>q[maxBid]!.bid)maxBid=i;if(q[i]!.ask<q[minAsk]!.ask)minAsk=i;if(q[i]!.ask>q[maxAsk]!.ask)maxAsk=i;}
    for(const i of [minBid,maxBid,minAsk,maxAsk])ids.add(i);
  }return [...ids].sort((a,b)=>a-b).map(i=>q[i]!);
}
function sampledCandles(c:Candle[]):Candle[]{
  if(c.length<=INSPECTION_LIMITS.points)return c;const out:Candle[]=[],step=Math.ceil(c.length/INSPECTION_LIMITS.points);
  for(let i=0;i<c.length;i+=step){const b=c.slice(i,i+step);out.push({t:b[0]!.t,open:b[0]!.open,high:Math.max(...b.map(p=>p.high)),low:Math.min(...b.map(p=>p.low)),close:b.at(-1)!.close});}return out;
}
export function inspect(subject:Subject,raw:Quote[],sessions:Interval[],candles:Candle[],now=Date.now(),limited=false){
  const end=subject.exitTime??now,from=Math.max(subject.entryTime,end-INSPECTION_LIMITS.windowMs),through=end;
  const scannedThrough=raw.reduce((n,q)=>Math.max(n,q.receivedAt),from);
  const covered=limited?sessions.map(s=>({...s,through:Math.min(s.through,scannedThrough)})):sessions;
  const gaps=missingIntervals(covered,from,through),clipped=from>subject.entryTime;
  const fallback=candles.filter(c=>gaps.some(g=>c.t+60000>g.from&&c.t<g.through));
  const valid:Quote[]=[];let previous:Quote|undefined,rejected=0;
  for(const q of [...raw].sort((a,b)=>a.journalId===b.journalId?a.id-b.id:a.receivedAt-b.receivedAt)){
    if(![q.time,q.receivedAt,q.bid,q.ask].every(Number.isFinite)||q.bid<=0||q.ask<q.bid||q.time>q.receivedAt+1000||q.receivedAt-q.time>30000||
      (previous&&(q.time<previous.time||q.receivedAt<previous.receivedAt||(q.journalId===previous.journalId&&q.id<=previous.id)))){rejected++;continue;}
    previous=q;valid.push(q);
  }
  const inTrade=valid.filter(q=>q.receivedAt>=from&&q.receivedAt<=through);
  const before=valid.findLast(q=>q.receivedAt<=from&&from-q.receivedAt<=30000);
  const path=before?[{...before,receivedAt:from},...inTrade.filter(q=>q.id!==before.id||q.journalId!==before.journalId)]:inTrade;
  const complete=!clipped&&!limited&&!gaps.length&&path.length>0&&!!before&&through-path.at(-1)!.receivedAt<=30000;
  const sampled=sampledQuotes(path);
  const sign=subject.side==='long'?1:-1,entry=subject.entryPrice;
  let peak=0,maxDD=0,maxDDPct:number|null=subject.entryEquity&&subject.stage!=='capital'?0:null,worst=0,best=0;
  const pnl:Point[]=[],drawdown:Point[]=[],spread:Point[]=[];
  for(const q of path){
    const value=sign*((subject.side==='long'?q.bid:q.ask)-entry)*subject.size;
    peak=Math.max(peak,value);worst=Math.min(worst,value);best=Math.max(best,value);maxDD=Math.max(maxDD,peak-value);
    if(maxDDPct!==null&&subject.entryEquity!+peak>0)maxDDPct=Math.max(maxDDPct,(peak-value)/(subject.entryEquity!+peak));
    pnl.push({t:q.receivedAt,value});drawdown.push({t:q.receivedAt,value:-(peak-value)});spread.push({t:q.receivedAt,value:q.ask-q.bid});
  }
  const observed=(at:number)=>{const q=valid.findLast(q=>q.receivedAt<=at&&at-q.receivedAt<=1000);return q?{bid:q.bid,ask:q.ask,ageMs:at-q.receivedAt}:null;};
  const e=subject.execution;
  const gross=subject.exitPrice===null?null:sign*(subject.exitPrice-entry)*subject.size;
  const identity=subject.pnl===null||subject.funding===null||gross===null?null:subject.pnl-(gross+subject.funding);
  return {subject,window:{from,through,clipped},coverage:{complete,limited,rejected,ticks:path.length,candles:fallback.length,gaps,
    firstTick:path[0]?.receivedAt??null,lastTick:path.at(-1)?.receivedAt??null,source:path.length?(fallback.length?'mixed':'recorded'):'candles'},
    price:{bid:sampled.map(q=>({t:q.receivedAt,value:q.bid})),ask:sampled.map(q=>({t:q.receivedAt,value:q.ask})),candles:sampledCandles(fallback)},
    pnl:thin(pnl),drawdown:thin(drawdown),spread:thin(spread),
    risk:{maxDrawdown:path.length?maxDD:null,drawdownFraction:path.length?maxDDPct:null,mae:path.length?worst:null,mfe:path.length?best:null,fullTrade:complete,basis:'Executable-price P&L before funding and protection adjustments'},
    costs:{net:subject.pnl,funding:subject.funding,midpoint:e?.midpointPnl??null,spread:e?.spreadCost??null,timing:e?.timingCost??null,
      adjustment:e?.adjustmentPnl??identity,method:e?.method??null,entryQuote:observed(subject.entryTime),exitQuote:subject.exitTime?observed(subject.exitTime):null},
    checks:[{label:'Entry reason',state:subject.entryReason?'recorded':'unknown'},{label:'Exit reason',state:subject.exitTime?(subject.exitReason?'recorded':'unknown'):'open'},
      {label:'Price coverage',state:complete?'complete':'partial'},{label:'Spread attribution',state:e?'recorded':'unknown'},
      {label:'P&L reconciliation',state:identity===null?'unknown':Math.abs(identity)<.011?'matched':'adjustment'}],asOf:now,
    strategy:null as import('../strategy/evidence').StrategyContext|null};
}
export type Inspection=ReturnType<typeof inspect>;
