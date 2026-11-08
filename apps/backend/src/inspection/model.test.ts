import{expect,test}from'bun:test';
import{inspect,missingIntervals,thin,type Subject,type Quote}from'./model';
import{subject}from'./subjects';
import{ArenaDB}from'../arena/db';
import{defineAgent}from'../sdk';
import type{LoadedAgent}from'../engine/loader';
const T=1793672829000;
const trade:Subject={runId:'demo:test:US500:x200:hash',key:'0',stage:'virtual',name:'test',epic:'US500',side:'short',size:10,entryTime:T,exitTime:T+3000,entryPrice:100,exitPrice:95,pnl:48,funding:-2,entryEquity:1000,entryReason:'bearish day; bounce',exitReason:'scheduled exit',exitCode:'session_end',timeline:[]};
function quote(i:number,bid:number,ask=bid+1):Quote{return{id:i+1,session:1,time:T+i*1000,receivedAt:T+i*1000,bid,ask,journalId:'fixture'}}
test('executable-side intratrade risk retains adverse spread and separates terminal funding',()=>{
 const r=inspect(trade,[quote(0,100),quote(1,102),quote(2,93),quote(3,94)],[{from:T-1,through:T+4000}],[],T+4000);
 expect(r.coverage.complete).toBe(true);expect(r.pnl.map(p=>p.value)).toEqual([-10,-30,60,50]);
 expect(r.risk.mae).toBe(-30);expect(r.risk.mfe).toBe(60);expect(r.risk.maxDrawdown).toBe(30);expect(r.risk.drawdownFraction).toBeCloseTo(.03);
 expect(r.costs.net).toBe(48);expect(r.costs.funding).toBe(-2);expect(r.costs.spread).toBeNull();expect(r.costs.adjustment).toBe(0);
});
test('capture gaps, clipped history and minute fallback cannot claim complete tick risk',()=>{
 const sessions=[{from:T+1000,through:T+4000}],candles=[{t:T,open:100,high:104,low:93,close:99}];
 const r=inspect(trade,[quote(1,102),quote(2,93),quote(3,94)],sessions,candles,T+4000);
 expect(r.coverage.complete).toBe(false);expect(r.coverage.gaps).toEqual([{from:T,through:T+1000}]);expect(r.price.candles).toHaveLength(1);expect(r.risk.fullTrade).toBe(false);
 const none=inspect(trade,[],[],candles,T+4000);expect(none.risk.maxDrawdown).toBeNull();expect(none.risk.mae).toBeNull();
 expect(inspect({...trade,entryTime:T-8*86400000},[],[],[],T+4000).window.clipped).toBe(true);
 expect(missingIntervals([{from:T,through:T+2000},{from:T+1000,through:T+4000}],T,T+3000)).toEqual([]);
});
test('late arrival and crossed quotes are rejected in journal order, not repaired by sorting timestamps',()=>{
 const late={...quote(2,1),receivedAt:T+500,time:T+500};
 const r=inspect(trade,[quote(0,100),quote(1,101),late,{...quote(3,94),ask:90}],[],[],T+4000);
 expect(r.coverage.rejected).toBe(2);expect(r.pnl).toHaveLength(2);
 const pts=Array.from({length:10000},(_,i)=>({t:i,value:i===5001?-1000:0}));const short=thin(pts,100);expect(short.length).toBeLessThanOrEqual(100);expect(short.some(p=>p.value===-1000)).toBe(true);
});
test('entry equity reconstruction and stable trade selection never attribute unrecorded reasons',()=>{
 const d=new ArenaDB(':memory:');const agent={id:'test',slug:'test',variant:null,file:'',codeHash:'hash',source:'',params:{},def:defineAgent({name:'test',description:'test',instruments:['US500'],timeframe:'1m',params:{},onBar(){}})}as LoadedAgent;
 d.upsertAgent(agent,T);d.createDemoRun({id:trade.runId,agentId:'test',codeHash:'hash',epic:'US500',leverage:200,capital:1000,params:{},now:T});
 for(const i of [0,1])d.appendTrade(trade.runId,i,{side:'long',size:1,entryTime:T+i*5000,entryPrice:100,exitTime:T+i*5000+3000,exitPrice:110,pnl:10,funding:0,exitReason:'signal',barsHeld:1});
 expect(subject(d.db,trade.runId,'1','virtual').entryEquity).toBe(1010);expect(subject(d.db,trade.runId,'1','virtual').entryReason).toBeNull();
 expect(d.viewTrades(trade.runId,1)[0]?.index).toBe(1);expect(()=>subject(d.db,trade.runId,'0','bogus')).toThrow();d.db.close();
});

test('Capital inspection scopes deal identity to its run and Arena accounts and leaves shared costs unknown',()=>{
 const d=new ArenaDB(':memory:');
 d.createDemoRun({id:trade.runId,agentId:'test',codeHash:'hash',epic:'US500',leverage:200,capital:1000,params:{},now:T});
 const insert=d.db.query("INSERT INTO broker_deals(account,run_id,epic,side,size,paper_size,status,open_time,open_price,paper_open_price,close_time,close_price,pnl) VALUES (?,?,'US500','short',1,5,'closed',?,100,100,?,95,5)");
 insert.run('Arena 09',trade.runId,T,T+3000);insert.run('Visi',trade.runId,T,T+3000);
 const s=subject(d.db,trade.runId,'1','capital');expect(s.funding).toBeNull();expect(s.entryEquity).toBeNull();expect(s.execution).toBeUndefined();
 expect(()=>subject(d.db,trade.runId,'2','capital')).toThrow('Broker deal not found');
 expect(()=>subject(d.db,trade.runId,'1','backtest')).toThrow();d.db.close();
});

test('price decimation keeps bid/ask paired and noncrossed while preserving quote extremes',()=>{
 const qs=Array.from({length:10000},(_,i)=>({...quote(i,100+Math.sin(i/9)),ask:101+Math.sin(i/9)+(i===5555?5:0)}));
 const r=inspect({...trade,exitTime:T+9999000},qs,[{from:T-1,through:T+10000000}],[],T+10000000);
 expect(r.price.bid.length).toBeLessThanOrEqual(600);expect(r.price.bid.map(p=>p.t)).toEqual(r.price.ask.map(p=>p.t));
 expect(r.price.ask.every((p,i)=>p.value>=r.price.bid[i]!.value)).toBe(true);expect(Math.max(...r.price.ask.map(p=>p.value))).toBe(Math.max(...qs.map(q=>q.ask)));
});
