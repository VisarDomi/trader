import { expect, test, spyOn } from 'bun:test';
import { Arena } from './arena.ts';
import { ArenaDB } from './db.ts';
import { MarketEngine } from '../engine/market.ts';
import { getInstrument } from '../engine/instruments.ts';
import { defineAgent } from '../sdk/index.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import type { CapitalClient } from '../capital/client.ts';
import { TICK_SOURCE, type Tick } from '../engine/ticks.ts';
import { mkdtempSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { demoRunId,PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';
import { RUN_STATUS } from '../engine/run.ts';
import { VirtualVenue } from '../engine/venue.ts';
import { loadRoster } from '../engine/roster.ts';
import { ENGINE_VERSION } from '../engine/version.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';
import { backtestGate } from './pipeline.ts';

test('removing an agent preserves its explicit roster replacement reason in the Graveyard record',()=>{
 const db=new ArenaDB(':memory:'),now=Date.UTC(2026,10,9),id='demo:removed';
 const arena=new Arena({db,dataClient:{} as CapitalClient,forecasterUrl:'',broker:null,live:false});
 try{
  db.createDemoRun({id,agentId:'removed',codeHash:'old',epic:'US500',leverage:1,capital:10000,params:{},now});
  const restore=arena as unknown as {roster:ReturnType<typeof loadRoster>;createRuns(at:number):Set<string>};
  restore.roster={accounts:{},leverage:{default:1,agents:{}},retired:{'removed:US500@1':{date:'2026-11-09',reason:'Superseded user experiment; preserve history.'}}};
  restore.createRuns(now+1);
  expect(db.run(id)?.retired).toBe(1);
  expect(JSON.parse(db.run(id)!.extra!).retirement.reason).toBe('Superseded user experiment; preserve history.');
 }finally{arena.stop();db.db.close()}
});

test('instrument dirtiness persists quote-only state once and preserves untouched instruments', () => {
  const now = Date.UTC(2026, 9, 26, 12, 1), clock = spyOn(Date, 'now').mockReturnValue(now);
  const db = new ArenaDB(':memory:');
  const arena = new Arena({ db, dataClient: {} as CapitalClient, forecasterUrl: '', broker: null, live: false });
  try {
    for (const epic of ['US500', 'GOLD']) {
      const def = defineAgent({ name: epic, description: epic, params: {}, instruments: [epic], timeframe: '1m', warmup: 0,
        init: () => ({ ticks: 0 }), onTick(ctx) { ctx.state.ticks = Number(ctx.state.ticks) + 1; } });
      const agent: LoadedAgent = { id: epic, slug: epic, variant: null, file: '', codeHash: 'fixture', source: '', params: {}, def };
      const engine = new MarketEngine({ ...getInstrument(epic) });
      const run = engine.addRun({ runId: epic, agent, leverage: 1, capital: 10000, checkStopsOnCandles: false });
      db.createDemoRun({ id: epic, agentId: epic, codeHash: agent.codeHash, epic, leverage: 1, capital: 10000, params: {}, now });
      arena.engines.set(epic, engine);
      arena.tracked.set(epic, { startedAt: now, run, agent, epic, leverage: 1, persistedTrades: 0, dirty: true });
    }
    arena.persistAll(true);
    const save = spyOn(db, 'saveRunState');
    const quote: Tick = { time: now, receivedAt: now, bid: 100, ask: 101, source: TICK_SOURCE.RECORDED };
    (arena as unknown as { onQuote(epic: string, q: Tick): void }).onQuote('US500', quote);
    arena.persistAll(false);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]![0].id).toBe('US500');
    expect(JSON.parse(db.run('US500')!.snapshot!).state.ticks).toBe(1);
    expect(JSON.parse(db.run('GOLD')!.snapshot!).state.ticks).toBe(0);
    arena.persistAll(false);
    expect(save).toHaveBeenCalledTimes(1);
    arena.persistAll(true);
    expect(save).toHaveBeenCalledTimes(3);
    save.mockRestore();
  } finally { arena.stop(); db.db.close(); clock.mockRestore(); }
});

test('existing comparison state survives a database reopen after its standard run retires, without new admissions',()=>{
  const directory=mkdtempSync(join(tmpdir(),'trader-comparison-restore-')),path=join(directory,'arena.db');
  const now=Date.UTC(2026,10,5,8),epic='US500';
  const def=defineAgent({name:'comparison-restore',description:'restore fixture',params:{},instruments:[epic],timeframe:'1m',leverage:[1],warmup:0,
    init:()=>({seen:0}),onTick(ctx){ctx.state.seen++;if(ctx.state.seen===1)ctx.buy({size:1});}});
  const agent:LoadedAgent={id:'comparison-restore',slug:'comparison-restore',variant:null,file:'',codeHash:'fixture',source:'fixture',params:{},def};
  const base=demoRunId(agent.id,epic,1,agent.codeHash),comparison=base+':delay=1000',retiredComparison=base+':delay=2000';
  let db=new ArenaDB(path),arena:Arena|null=null;
  try{
    db.upsertAgent(agent,now);
    const seed=new MarketEngine({...getInstrument(epic)}).addRun({runId:comparison,agent,leverage:1,capital:10000,checkStopsOnCandles:false});
    const history={time:now-60000,open:100,high:101,low:100,close:100,spread:1,volume:1};
    seed.primary.push(history);
    seed.onTick({time:now,receivedAt:now,bid:100,ask:101,source:TICK_SOURCE.RECORDED});
    const snapshot=JSON.parse(JSON.stringify(seed.snapshot()))as ReturnType<typeof seed.snapshot>;expect(snapshot.position).not.toBeNull();
    db.saveBacktest({engineVersion:ENGINE_VERSION,agentId:agent.id,codeHash:agent.codeHash,epic,leverage:1,
      windowId:PRIMARY_BACKTEST_WINDOW_ID,windowStart:now-1,windowEnd:now,params:{},capital:10000,
      status:RUN_STATUS.COMPLETED,errors:0,metrics:{...seed.metrics(),trades:30,sharpe:1,finalEquity:11000},
      trades:[],equity:[],logs:[],ranAt:now,agentUsPerBar:0,bars:1,candles:1,durationMs:1}as BacktestResult);
    expect(backtestGate(db.runs('backtest')[0],agent.codeHash,agent.slug).passed).toBeTrue();
    for(const id of [base,comparison,retiredComparison])db.createDemoRun({id,agentId:agent.id,codeHash:agent.codeHash,epic,leverage:1,capital:10000,params:{},now});
    db.saveRunState({id:comparison,status:RUN_STATUS.RUNNING,equity:seed.markToMarket(),snapshot,metrics:seed.metrics(),now});
    db.setRunExtra(comparison,{scenario:'delay 1000 ms',comparisonOnly:true,baseRunId:base});
    db.retireRun(base,now+1,RUN_STATUS.STOPPED,'losing virtual trade evidence');
    db.retireRun(retiredComparison,now+1,RUN_STATUS.STOPPED,'explicit comparison retirement');
    db.db.close();db=new ArenaDB(path);
    for(let boot=0;boot<2;boot++){
      arena=new Arena({db,dataClient:{}as CapitalClient,forecasterUrl:'',broker:null,live:false});
      arena.agents=[agent];arena.engines.set(epic,new MarketEngine({...getInstrument(epic)}));
      arena.venues.set(epic,new VirtualVenue({...getInstrument(epic)}));
      const restore=arena as unknown as {roster:ReturnType<typeof loadRoster>;createRuns(at:number):Set<string>};
      restore.roster=loadRoster(directory);restore.createRuns(now+2+boot);
      expect([...arena.tracked.keys()]).toEqual([comparison]);
      // Rebuild the shared series cursor, as startup warm-up does, before comparing durable state.
      arena.tracked.get(comparison)!.run.primary.push(history);
      expect(arena.tracked.get(comparison)!.run.snapshot()).toEqual(snapshot);
      expect(db.run(base)!.retired).toBe(1);expect(db.run(retiredComparison)!.retired).toBe(1);
      expect(db.runs('demo').map(r=>r.id)).toEqual([comparison]);
      arena.stop();arena=null;db.db.close();db=new ArenaDB(path);
    }
  }finally{arena?.stop();db.db.close();rmSync(directory,{recursive:true,force:true});}
});
