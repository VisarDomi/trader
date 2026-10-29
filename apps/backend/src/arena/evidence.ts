import type { AgentEvidence, BenchmarkComparison, CostSummary, LeaderboardRow, EvidenceOverview } from '@trader/shared/types';
import type { Arena } from './arena.ts';
import type { RunRow } from './db.ts';
import { RUN_KIND } from './db.ts';
import { CONTROL_SLUGS } from '../engine/policy.ts';
import { ENGINE_VERSION } from '../engine/version.ts';
import { HOUR_MS } from '../engine/clock.ts';
import { isShadow, backtestGate } from './pipeline.ts';
import { runKey, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';

const CACHE_MS = 30_000;
const HISTORICAL_COST_CACHE_MS = 30 * 60_000;
const unavailable = (note: string): BenchmarkComparison => ({status:'unavailable',basis:'unavailable',note});
const emptyCosts = (): CostSummary => ({reportedTrades:0,historyComplete:true,closedTrades:0,closedNetPnl:0,closedFunding:0,
  beforeFundingPnl:0,measuredTrades:0,capturedTrades:0,reconstructedTrades:0,measuredNetPnl:0,measuredFunding:0,midpointPnl:0,spreadCost:0,
  adjustmentPnl:0,timedTrades:0,timingCost:0,timedSignalPnl:0,timedNetPnl:0,doubledSpreadPnl:null,diagnosis:'unmeasured'});

/** Cached read models: no per-quote scans, PostgreSQL, forecasts or broker requests. */
export class AgentEvidenceService {
  private refreshed = -Infinity;
  private rows = new Map<string,RunRow>();
  private benchmarks = new Map<string,RunRow>();
  private comparisons = new Map<string,BenchmarkComparison>();
  private costs = new Map<string,CostSummary>();
  private costsRefreshed = new Map<string,number>();
  private agents = new Map<string,{slug:string;uses_forecast:number;code_hash:string}>();
  private variants = 0;
  private cashflows:EvidenceOverview['accountCashflows']={totals:[],unallocated:[]};
  private backtests = new Map<string,RunRow>();
  constructor(private readonly arena: Arena) {}
  invalidate():void { this.refreshed = -Infinity; this.costsRefreshed.clear(); }
  private refresh(now: number): void {
    if (now-this.refreshed < CACHE_MS) return;
    this.refreshed=now; this.comparisons.clear(); this.benchmarks.clear();
    this.cashflows=this.arena.db.cashflowSummary();
    const rows=[...this.arena.db.listRuns(RUN_KIND.DEMO,true),...this.arena.db.listRuns(RUN_KIND.BACKTEST,true)];
    this.rows=new Map(rows.map(r=>[r.id,r])); this.agents=new Map(this.arena.db.agents().map(a=>[a.id,a]));
    this.backtests=new Map(rows.filter(r=>r.kind===RUN_KIND.BACKTEST&&!r.retired&&r.window_id===PRIMARY_BACKTEST_WINDOW_ID).map(r=>[runKey(r.agent_id,r.epic,r.leverage??0),r]));
    this.variants=new Set(rows.filter(r=>r.kind===RUN_KIND.DEMO&&!r.retired&&!isShadow(r.id)&&!CONTROL_SLUGS.has(this.agents.get(r.agent_id)?.slug??r.agent_id)).map(r=>r.agent_id)).size;
    for(const r of rows) if(r.agent_id==='buy-hold'&&r.leverage===1&&!r.retired&&!isShadow(r.id))
      this.benchmarks.set(`${r.kind}:${r.epic}:${r.window_id??''}`,r);
  }
  private loadCosts(kind:RunRow['kind'],now:number,runId?:string):void {
    const ttl=kind===RUN_KIND.BACKTEST?HISTORICAL_COST_CACHE_MS:CACHE_MS;
    const key=kind+':'+(runId??'standard');
    if(now-(this.costsRefreshed.get(key)??-Infinity)<ttl)return;
    this.costsRefreshed.set(key,now);
    for(const [id]of this.costs)if(runId?id===runId:this.rows.get(id)?.kind===kind&&!isShadow(id))this.costs.delete(id);
    for(const total of this.arena.db.costTotals(kind,true,runId,!runId)) {
      const {runId,...values}=total;
      const summary:CostSummary={...emptyCosts(),...values};
      const row=this.rows.get(runId), metrics=row?.metrics?JSON.parse(row.metrics):null;
      summary.reportedTrades=Math.max(total.closedTrades,metrics?.trades??0);
      summary.historyComplete=total.closedTrades>=summary.reportedTrades;
      summary.doubledSpreadPnl=summary.measuredTrades ? summary.measuredNetPnl-summary.spreadCost : null;
      summary.diagnosis=!summary.measuredTrades?'unmeasured':summary.midpointPnl<=0?'negative-before-spread'
        :summary.measuredNetPnl<=0?'costs-exceed-gain':'positive-after-costs';
      this.costs.set(runId,summary);
    }
  }
  comparison(row:RunRow,now=Date.now()):BenchmarkComparison {
    this.refresh(now);
    const cached=this.comparisons.get(row.id);if(cached)return cached;
    const baseline=this.benchmarks.get(`${row.kind}:${row.epic}:${row.window_id??''}`);
    let result:BenchmarkComparison;
    if(!baseline) result=unavailable('No current 1:1 buy-and-hold control for this instrument/window.');
    else if(row.kind===RUN_KIND.BACKTEST) {
      const m=row.metrics?JSON.parse(row.metrics):null,b=baseline.metrics?JSON.parse(baseline.metrics):null;
      const engine=row.extra?JSON.parse(row.extra).engineVersion:null,baseEngine=baseline.extra?JSON.parse(baseline.extra).engineVersion:null;
      if(!m||!b||engine!==ENGINE_VERSION||baseEngine!==engine||m.startTime!==b.startTime||m.endTime!==b.endTime)
        result=unavailable('Benchmark requires the same historical dates and current engine.');
      else result={status:'matched',basis:'same-backtest-window',benchmarkRunId:baseline.id,from:m.startTime,through:m.endTime,
        strategyReturn:m.totalReturn,benchmarkReturn:b.totalReturn,excessReturn:m.totalReturn-b.totalReturn,
        note:'Same historical window; 1:1 buy-and-hold sizing differs from the strategy. This is excess return, not risk-adjusted alpha.'};
    } else {
      const ticksSince=this.arena.db.getSetting<number>('feed.ticksSince',0);
      const since=Math.ceil(Math.max(row.started_at,baseline.started_at,ticksSince)/HOUR_MS)*HOUR_MS;
      const {first,last}=this.arena.db.matchedEquity(row.id,baseline.id,since);
      if(!first||!last||last.t<=first.t||first.strategy<=0||first.benchmark<=0)
        result=unavailable('Waiting for two common hourly equity observations.');
      else {
        const strategyReturn=last.strategy/first.strategy-1,benchmarkReturn=last.benchmark/first.benchmark-1;
        result={status:'matched',basis:'shared-hourly-equity',benchmarkRunId:baseline.id,from:first.t,through:last.t,
          strategyReturn,benchmarkReturn,excessReturn:strategyReturn-benchmarkReturn,
          note:'Same stored hourly observations, from the current tick-feed epoch onward. Sizing differs; excess return is not risk-adjusted alpha and may cover less time than lifetime Return.'};
      }
    }
    this.comparisons.set(row.id,result);return result;
  }
  forRun(row:RunRow,now=Date.now()):AgentEvidence {
    this.refresh(now);
    this.loadCosts(row.kind,now,isShadow(row.id)?row.id:undefined);
    const a=this.agents.get(row.agent_id), extra=row.extra?JSON.parse(row.extra):{};
    const tracked=this.arena.tracked.get(row.id)?.run;
    const saved=!tracked&&row.snapshot?JSON.parse(row.snapshot):null;
    const p=tracked?.position??saved?.position, q=tracked?.lastQuote??saved?.lastTick;
    const equity=tracked?.markToMarket()??row.equity;
    const exit=p&&q?(p.side==='long'?q.bid:q.ask):null;
    const trailing=p?.trailingStop!=null?(p.side==='long'?p.trailAnchor-p.trailingStop:p.trailAnchor+p.trailingStop):null;
    const stop=p?.stopLoss==null?trailing:trailing===null?p.stopLoss:p.side==='long'?Math.max(p.stopLoss,trailing):Math.min(p.stopLoss,trailing);
    const dependency=row.kind===RUN_KIND.DEMO&&!row.retired&&a?.uses_forecast?this.arena.forecastAvailability?.evidence(row.started_at,now):undefined;
    const control=CONTROL_SLUGS.has(a?.slug??row.agent_id);
    // A passed backtest is admission evidence, not a claim of a proven forward edge.
    const currentBacktest=this.backtests.get(runKey(row.agent_id,row.epic,row.leverage??0));
    const passes=backtestGate(currentBacktest,a?.code_hash??row.code_hash,a?.slug??row.agent_id).passed;
    return {asOf:now,basis:row.kind===RUN_KIND.BACKTEST?'historical-equity':'virtual-equity',
      admission:control?'control':extra.demoAdmission?'user-experiment':row.kind===RUN_KIND.BACKTEST&&!passes?'backtest-rejected':extra.grandfathered||!passes?'calibration':'backtest-qualified',
      benchmark:this.comparison(row,now),costs:this.costs.get(row.id)??emptyCosts(),
      exposure:p&&q&&equity>0?p.size*(q.bid+q.ask)/2/equity:p?null:0,
      openPosition:!!p,
      stopRisk:p&&exit!==null&&stop!==null&&equity>0?Math.max(0,(p.side==='long'?exit-stop:stop-exit)*p.size)/equity:null,
      openFunding:p?.funding??0,unrealizedPnl:p&&exit!==null?(p.side==='long'?exit-p.entryPrice:p.entryPrice-exit)*p.size:0,
      ...(dependency?{dependency}:{}),strategyVariants:this.variants,
      note:'Costs describe stored closed trades. Captured fill quotes and reconstructed archived-quote matches are counted separately; old decision timing is unknown. Double-spread results hold observed trades fixed, without re-sizing or re-running stops. A high rank among many trials is not proof of skill.'};
  }
  overview(now=Date.now()) {
    this.refresh(now);
    this.loadCosts(RUN_KIND.DEMO,now);
    const standard=[...this.rows.values()].filter(r=>r.kind===RUN_KIND.DEMO&&!r.retired&&!isShadow(r.id));
    const strategies=standard.filter(r=>!CONTROL_SLUGS.has(this.agents.get(r.agent_id)?.slug??r.agent_id));
    return {asOf:now,strategyVariants:this.variants,standardRuns:standard.length,strategyRuns:strategies.length,
      comparisonRuns:[...this.rows.values()].filter(r=>r.kind===RUN_KIND.DEMO&&!r.retired&&isShadow(r.id)).length,
      measuredTrades:strategies.reduce((n,r)=>n+(this.costs.get(r.id)?.measuredTrades??0),0),
      storedTrades:strategies.reduce((n,r)=>n+(this.costs.get(r.id)?.closedTrades??0),0),
      accountCashflows:this.cashflows,
      dependency:this.arena.forecastAvailability?.evidence(0,now)??null,
      note:'Existing records include calibration and user experiments. Cost coverage, common-date benchmarks and paused dependencies qualify every comparison; they do not change the promotion thresholds.'};
  }
  forCapital(row:LeaderboardRow,unrealizedPnl:number|null,openPosition:boolean):AgentEvidence|undefined {
    this.refresh(Date.now());
    const meta=this.rows.get(row.runId);if(!meta)return;
    const base=this.forRun(meta);
    return {...base,basis:'broker-realized-cash',costs:null,
      benchmark:unavailable('Closed cash P&L and held equity are different bases; use the virtual common-date comparison.'),
      exposure:null,stopRisk:null,openFunding:null,unrealizedPnl,openPosition,
      note:'Actual realized cash plus linked adjustments. Unlinked funding/corporate actions remain at account level; open P&L is separate. Cash drawdown does not measure intratrade risk.'};
  }
}
