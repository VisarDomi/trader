import { expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GRAVEYARD_CATEGORY, type GraveyardEntry } from '@trader/shared';
import { ArenaDB, RUN_KIND } from './db.ts';
import { graveyard } from './graveyard.ts';
import { startApi } from './api.ts';
import type { Arena } from './arena.ts';
import type { LoadedAgent } from '../engine/loader.ts';
import { RUN_STATUS } from '../engine/run.ts';
import { SHADOW_MARKER } from './pipeline.ts';
import { ENGINE_VERSION } from '../engine/version.ts';
import { defineAgent } from '../sdk/index.ts';
import { EXIT_REASON } from '../sdk/types.ts';
import { computeMetrics } from '../engine/metrics.ts';
import type { BacktestResult } from '../lab/backtest-core.ts';

const ID='fixture', OLD='old-source', CURRENT='new-source', EPIC='EURUSD', REASON='Retired after a full observation window';
function agent(hash=OLD): LoadedAgent {
  return {id:ID,slug:ID,variant:null,file:'',params:{},codeHash:hash,source:`// ${hash}`,
    def:defineAgent({name:ID,description:ID,params:{},instruments:[EPIC],timeframe:'1m',onBar(){}})};
}
function backtest(hash=OLD,engineVersion=ENGINE_VERSION): BacktestResult {
  const trade={side:'long' as const,size:1,entryTime:10,entryPrice:1,exitTime:20,exitPrice:1.1,pnl:100,funding:0,exitReason:EXIT_REASON.TAKE_PROFIT,barsHeld:1};
  const equity=[{t:1,equity:10_000},{t:30,equity:10_100}];
  return {engineVersion,agentId:ID,codeHash:hash,epic:EPIC,leverage:1,windowId:'fixture',windowStart:1,windowEnd:30,
    params:{},capital:10_000,status:RUN_STATUS.COMPLETED,errors:0,
    metrics:computeMetrics({trades:[trade],equity,initialCapital:10_000,finalEquity:10_100,startTime:1,endTime:30,maxDrawdown:0,exposure:0}),
    trades:[trade],equity,logs:[{time:20,message:'preserved log'}],ranAt:40,agentUsPerBar:0,bars:1,candles:1,durationMs:1} as BacktestResult;
}
test('the graveyard API keeps replaced versions and reasons, excluding active runs and comparison evidence',async () => {
  const db=new ArenaDB(':memory:');
  db.upsertAgent(agent(),1);
  const oldId=`demo:${ID}:${EPIC}:x1:${OLD}`;
  for (const id of [oldId,`${oldId}${SHADOW_MARKER}500`]) {
    db.createDemoRun({id,agentId:ID,codeHash:OLD,epic:EPIC,leverage:1,capital:10_000,params:{},now:2});
    db.retireRun(id,3,RUN_STATUS.STOPPED,REASON);
  }
  db.upsertAgent(agent(CURRENT),4);
  db.createDemoRun({id:`demo:${ID}:${EPIC}:x1:${CURRENT}`,agentId:ID,codeHash:CURRENT,epic:EPIC,leverage:1,capital:10_000,params:{},now:4});
  db.db.exec('DELETE FROM events; DELETE FROM logs');
  const api=startApi({db} as unknown as Arena,0,'fixture-token');
  try {
    const rows=await fetch(`http://127.0.0.1:${api.port}/api/graveyard`).then(r=>r.json()) as GraveyardEntry[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.category).toBe(GRAVEYARD_CATEGORY.VERSION);
    expect(rows[0]!.runs.map(r=>r.id)).toEqual([oldId]);
    expect(rows[0]!.runs[0]!.reason).toBe(REASON);
    expect(rows[0]!.comparisonRuns).toBe(1);
    expect(rows[0]!.hasSource).toBeTrue();
  } finally {await api.stop(true);db.db.close();}
});
test('source and engine replacements preserve backtest trades, equity and logs while repeat uploads remain idempotent',() => {
  const db=new ArenaDB(':memory:');
  try {
    db.upsertAgent(agent(),1);
    db.saveBacktest(backtest(OLD,'prior-engine'));
    db.saveBacktest(backtest());
    const engineArchive=db.runs(RUN_KIND.BACKTEST,true).find(r=>r.retired)!;
    expect(db.trades(engineArchive.id)).toHaveLength(1);
    expect(db.equity(engineArchive.id)).toHaveLength(2);
    expect(db.logs(engineArchive.id)[0]?.message).toBe('preserved log');
    expect(graveyard(db)[0]?.category).toBe(GRAVEYARD_CATEGORY.PLATFORM);
    db.upsertAgent(agent(CURRENT),2);
    db.saveBacktest(backtest(CURRENT));
    db.saveBacktest(backtest(CURRENT));
    expect(db.runs(RUN_KIND.BACKTEST)).toHaveLength(1);
    expect(db.runs(RUN_KIND.BACKTEST,true)).toHaveLength(3);
    expect(db.runs(RUN_KIND.BACKTEST)[0]?.code_hash).toBe(CURRENT);
    expect(db.db.query('PRAGMA foreign_key_check').all()).toEqual([]);
  } finally {db.db.close();}
});
test('migration preserves pre-tier backtests and rescues exact retirement reasons before event pruning',() => {
  const dir=mkdtempSync(join(tmpdir(),'trader-graveyard-')),path=join(dir,'arena.db');
  let db=new ArenaDB(path);
  try {
    db.upsertAgent(agent(),1);
    db.saveBacktest(backtest());
    db.db.exec("UPDATE runs SET leverage = NULL WHERE kind = 'backtest'");
    const id=`demo:${ID}:${EPIC}:${OLD}`;
    db.createDemoRun({id,agentId:ID,codeHash:OLD,epic:EPIC,leverage:1,capital:10_000,params:{},now:2});
    db.retireRun(id,3,RUN_STATUS.STOPPED);
    db.event('info','arena',`retired ${id}: ${REASON}`);
    db.db.close();
    db=new ArenaDB(path);
    db.db.exec('DELETE FROM events');
    expect(db.runs(RUN_KIND.BACKTEST)).toHaveLength(0);
    expect(db.runs(RUN_KIND.BACKTEST,true)).toHaveLength(1);
    expect(graveyard(db).flatMap(e=>e.runs)[0]?.reason).toBe(REASON);
  } finally {db.db.close();rmSync(dir,{recursive:true,force:true});}
});
