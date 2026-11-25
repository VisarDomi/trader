import type { AgentEvidence, BacktestFrequency, BacktestPeriods, BenchmarkComparison, CostSummary, LeaderboardRow, EvidenceOverview } from '@trader/shared/types';
import type { Arena } from './arena.ts';
import type { RunRow } from './db.ts';
import { RUN_KIND } from './db.ts';
import { CONTROL_SLUGS } from '../engine/policy.ts';
import { outrightHold } from './hold.ts';
import { countPeriods, curveOf, listPeriods, periodDays, winChance, type Curve } from './frequency.ts';
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
  private comparisons = new Map<string,BenchmarkComparison>();
  private costs = new Map<string,CostSummary>();
  private costsRefreshed = new Map<string,number>();
  private agents = new Map<string,{slug:string;uses_forecast:number;code_hash:string}>();
  private variants = 0;
  private cashflows:EvidenceOverview['accountCashflows']={totals:[],unallocated:[]};
  private backtests = new Map<string,RunRow>();
  /** A virtual run's whole life, like its Return: its latest hourly equity on its starting capital. */
  private lives = new Map<string,{from:number;through:number;ret:number}|null>();
  private frequencies = new Map<string,BacktestFrequency|undefined>();
  /** Each current backtest's daily equity and win rate, read once and again only when the backtest is re-run. */
  private histories = new Map<string,{at:number;curve:Curve;winRate:number;trades:number}>();
  constructor(private readonly arena: Arena) {}
  invalidate():void { this.refreshed = -Infinity; this.costsRefreshed.clear(); }
  private refresh(now: number): void {
    if (now-this.refreshed < CACHE_MS) return;
    this.refreshed=now; this.comparisons.clear(); this.lives.clear(); this.frequencies.clear();
    this.cashflows=this.arena.db.cashflowSummary();
    const rows=[...this.arena.db.listRuns(RUN_KIND.DEMO,true),...this.arena.db.listRuns(RUN_KIND.BACKTEST,true)];
    this.rows=new Map(rows.map(r=>[r.id,r])); this.agents=new Map(this.arena.db.agents().map(a=>[a.id,a]));
    this.backtests=new Map(rows.filter(r=>r.kind===RUN_KIND.BACKTEST&&!r.retired&&r.window_id===PRIMARY_BACKTEST_WINDOW_ID).map(r=>[runKey(r.agent_id,r.epic,r.leverage??0),r]));
    const current=new Set([...this.backtests.values()].map(r=>r.id));
    for(const id of this.histories.keys())if(!current.has(id))this.histories.delete(id);
    this.variants=new Set(rows.filter(r=>r.kind===RUN_KIND.DEMO&&!r.retired&&!isShadow(r.id)&&!CONTROL_SLUGS.has(this.agents.get(r.agent_id)?.slug??r.agent_id)).map(r=>r.agent_id)).size;
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
    let result:BenchmarkComparison;
    if(row.kind===RUN_KIND.BACKTEST) {
      const m=row.metrics?JSON.parse(row.metrics):null;
      result=!m||!(m.endTime>m.startTime)?unavailable('No completed backtest metrics.')
        :this.versusHold(row.epic,m.startTime,m.endTime,m.totalReturn,'same-backtest-window',
          'Same historical window. Sizing differs; excess return is not risk-adjusted alpha.');
    } else {
      const life=this.life(row);
      result=!life?unavailable('Waiting for the first hourly equity observation.')
        :this.versusHold(row.epic,life.from,life.through,life.ret,'shared-hourly-equity',
          'From the run\'s start to its latest hourly equity, on its starting capital. Sizing differs; excess return is not risk-adjusted alpha.');
    }
    this.comparisons.set(row.id,result);return result;
  }
  private life(row:RunRow):{from:number;through:number;ret:number}|null {
    let life=this.lives.get(row.id);
    if(life===undefined) {
      const last=this.arena.db.lastEquity(row.id);
      life=!last||last.t<=row.started_at||!(row.capital>0)?null:{from:row.started_at,through:last.t,ret:last.equity/row.capital-1};
      this.lives.set(row.id,life);
    }
    return life;
  }
  private history(backtest:RunRow) {
    const kept=this.histories.get(backtest.id);
    if(kept&&kept.at===backtest.updated_at)return kept;
    const m=backtest.metrics?JSON.parse(backtest.metrics):null;
    const read={at:backtest.updated_at,curve:curveOf(this.arena.db.equity(backtest.id)),winRate:Number(m?.winRate)||0,trades:Number(m?.trades)||0};
    this.histories.set(backtest.id,read);return read;
  }
  /**
   * How often the backtest of the same agent version, instrument and leverage returned what the record did over
   * as many days (frequency.ts). Absent before the record's first closed trade and without such a backtest.
   */
  private frequency(row:Pick<RunRow,'agent_id'|'epic'|'leverage'|'code_hash'>,observed:number,from:number,through:number,
    m:{trades?:number;winRate?:number}|null):BacktestFrequency|undefined {
    if(!m||!(m.trades!>0))return;
    const backtest=this.backtests.get(runKey(row.agent_id,row.epic,row.leverage??0));
    if(!backtest||backtest.code_hash!==row.code_hash)return;
    const history=this.history(backtest),counted=countPeriods(history.curve,periodDays(from,through),observed);
    if(!counted)return;
    const won=Math.round((m.winRate??0)*m.trades!);
    return {runId:backtest.id,...counted,...(history.trades>0?{wins:{won,trades:m.trades!,rate:history.winRate,backtestTrades:history.trades,
      chance:winChance(won,m.trades!,history.winRate)}}:{})};
  }
  /** Every period of `days` in a backtest by its end date: the chart behind a frequency. */
  periods(backtest:RunRow,days:number,now=Date.now()):BacktestPeriods {
    this.refresh(now);
    const current=this.backtests.get(runKey(backtest.agent_id,backtest.epic,backtest.leverage??0))?.id===backtest.id;
    return listPeriods(backtest.id,current?this.history(backtest).curve:curveOf(this.arena.db.equity(backtest.id)),days);
  }
  /** Holding the instrument outright over the same dates (hold.ts), then T-bills and inflation (rates.ts). */
  private versusHold(epic:string,from:number,through:number,strategyReturn:number,basis:BenchmarkComparison['basis'],note:string):BenchmarkComparison {
    const hold=outrightHold(this.arena.db,this.arena.rates,epic,from,through);
    if(typeof hold==='string')return unavailable(hold);
    const {ret,...parts}=hold;
    return this.withHurdles({status:'matched',basis,from,through,strategyReturn,benchmarkReturn:ret,excessReturn:strategyReturn-ret,hold:parts,
      note:note+' The hold buys the instrument outright at 1:1, pays no CFD fees and collects what owning it pays.'});
  }
  /** Adds what Treasury bills earned and what CPI inflation took over the comparison's own dates (rates.ts). */
  private withHurdles(b:BenchmarkComparison):BenchmarkComparison {
    if(b.status!=='matched'||b.from===undefined||b.through===undefined)return b;
    const hurdles=this.arena.rates?.over(b.from,b.through);
    return hurdles?{...b,hurdles}:b;
  }
  forRun(row:RunRow,now=Date.now()):AgentEvidence {
    this.refresh(now);
    this.loadCosts(row.kind,now,isShadow(row.id)?row.id:undefined);
    const a=this.agents.get(row.agent_id), extra=row.extra?JSON.parse(row.extra):{};
    const tracked=this.arena.tracked.get(row.id)?.run;
    // The engine skips quotes that change nothing for a run; show the latest one.
    tracked?.adoptQuote(this.arena.engines.get(row.epic)?.lastAcceptedTick??null);
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
    let frequency=this.frequencies.get(row.id);
    if(frequency===undefined&&row.kind===RUN_KIND.DEMO&&!this.frequencies.has(row.id)) {
      const life=this.life(row);
      frequency=life?this.frequency(row,life.ret,life.from,life.through,row.metrics?JSON.parse(row.metrics):null):undefined;
      this.frequencies.set(row.id,frequency);
    }
    return {asOf:now,basis:row.kind===RUN_KIND.BACKTEST?'historical-equity':'virtual-equity',
      admission:control?'control':extra.demoAdmission?'user-experiment':row.kind===RUN_KIND.BACKTEST&&!passes?'backtest-rejected':extra.grandfathered||!passes?'calibration':'backtest-qualified',
      benchmark:this.comparison(row,now),...(frequency?{frequency}:{}),costs:this.costs.get(row.id)??emptyCosts(),
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
  /** Capital demo: realized cash return on the run's allocation since its first deal, against holding the instrument
   *  outright over the same dates. */
  private cashComparison(row:LeaderboardRow,now=Date.now()):BenchmarkComparison {
    this.refresh(now);
    const m=row.metrics;
    if(!m||!m.startTime)return unavailable('No priced Capital deals yet.');
    return this.versusHold(row.epic,m.startTime,now,m.totalReturn,'cash-vs-hold',
      'Realized cash on the run\'s Capital allocation since its first deal. Open positions count only once closed; sizing differs; not risk-adjusted.');
  }
  forCapital(row:LeaderboardRow,unrealizedPnl:number|null,openPosition:boolean):AgentEvidence|undefined {
    this.refresh(Date.now());
    const meta=this.rows.get(row.runId);if(!meta)return;
    // The virtual run's frequency describes its own return and days; Capital's counts its cash since the first deal.
    const {frequency:_virtual,...base}=this.forRun(meta),m=row.metrics;
    const frequency=m&&m.startTime?this.frequency(meta,m.totalReturn,m.startTime,m.endTime,m):undefined;
    return {...base,basis:'broker-realized-cash',costs:null,benchmark:this.cashComparison(row),...(frequency?{frequency}:{}),
      exposure:null,stopRisk:null,openFunding:null,unrealizedPnl,openPosition,
      note:'Actual realized cash plus linked adjustments. Unlinked funding/corporate actions remain at account level; open P&L is separate. Cash drawdown does not measure intratrade risk.'};
  }
}
