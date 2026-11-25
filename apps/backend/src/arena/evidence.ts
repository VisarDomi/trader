import type { AgentEvidence, BacktestFrequency, BacktestPeriods, BenchmarkComparison, CostSummary, FamilyClock, FamilyView, LeaderboardRow, EvidenceOverview, PortfolioView, RecordClock } from '@trader/shared/types';
import type { Arena } from './arena.ts';
import type { RunRow } from './db.ts';
import { RUN_KIND } from './db.ts';
import { CONTROL_SLUGS, LIFECYCLE, RANDOM_BASELINE_SLUG, floorMet } from '../engine/policy.ts';
import { outrightHold } from './hold.ts';
import { countPeriods, curveOf, listPeriods, periodDays, winChance } from './frequency.ts';
import { Judging, agreementZ, confirmedSet, eValue, judgedT, pool, statsOf, tAt, type DailyStats, type Member } from './judging.ts';
import { familyOf, type Roster } from '../engine/roster.ts';
import { isShadow, backtestGate } from './pipeline.ts';
import { runKey, PRIMARY_BACKTEST_WINDOW_ID } from '../engine/run-id.ts';

const CACHE_MS = 30_000;
const HISTORICAL_COST_CACHE_MS = 30 * 60_000;
const unavailable = (note: string): BenchmarkComparison => ({status:'unavailable',basis:'unavailable',note});
/** The family of an agent file and its display name: a roster family, else the agent's own name without its variant. */
export function familyLabel(roster:Pick<Roster,'families'>|null|undefined,agent:{slug:string;name:string;variant?:string|null}):{id:string;name:string} {
  const family=familyOf(roster,agent.slug), suffix=agent.variant?` (${agent.variant})`:'';
  return {id:family.id,name:family.name??(suffix&&agent.name.endsWith(suffix)?agent.name.slice(0,-suffix.length):agent.name)};
}
const emptyCosts = (): CostSummary => ({reportedTrades:0,historyComplete:true,closedTrades:0,closedNetPnl:0,closedFunding:0,
  beforeFundingPnl:0,measuredTrades:0,capturedTrades:0,reconstructedTrades:0,measuredNetPnl:0,measuredFunding:0,midpointPnl:0,spreadCost:0,
  adjustmentPnl:0,timedTrades:0,timingCost:0,timedSignalPnl:0,timedNetPnl:0,doubledSpreadPnl:null,diagnosis:'unmeasured'});

/** Cached read models: no per-quote scans, PostgreSQL, forecasts or broker requests. */
export class AgentEvidenceService {
  private refreshed = -Infinity;
  private cashflowsRefreshed = -Infinity;
  private rows = new Map<string,RunRow>();
  private comparisonRunCount = 0;
  private comparisons = new Map<string,BenchmarkComparison>();
  /** Backtest hold comparisons are immutable for a given (id, updated_at); keep them across 30s refreshes. */
  private backtestComparisons = new Map<string,BenchmarkComparison>();
  private costs = new Map<string,CostSummary>();
  private costsRefreshed = new Map<string,number>();
  private agents = new Map<string,{slug:string;name:string;variant:string|null;uses_forecast:number;code_hash:string}>();
  /** A family's pooled weekday returns, forward and in its backtests: kept while its days and members stand. */
  private pooled = new Map<string,{key:string;own:DailyStats;backtest:DailyStats|null;retiredTrades:number}>();
  private variants = 0;
  private cashflows:EvidenceOverview['accountCashflows']={totals:[],unallocated:[]};
  private backtests = new Map<string,RunRow>();
  /** A virtual run's whole life, like its Return: its latest hourly equity on its starting capital. */
  private lives = new Map<string,{from:number;through:number;ret:number}|null>();
  private frequencies = new Map<string,BacktestFrequency|undefined>();
  /** Parsed metrics, the daily clocks of every live record and their confirmed set: built once per refresh. */
  private parsed = new Map<string,{trades?:number;winRate?:number}|null>();
  private clocks:Map<string,RecordClock>|null = null;
  /** What each live strategy record's family says about it; kept apart from the record's own clock. */
  private views = new Map<string,FamilyView>();
  private monkeys = new Map<string,number>();
  /** The random monkeys judged as one family, and the declared portfolios measured against them. */
  private monkeyFamily:number|null = null;
  private held:PortfolioView[]|null = null;
  private trials = 0;
  private demotions:Record<string,{at:number}> = {};
  private readonly judging:Judging;
  constructor(private readonly arena: Arena) { this.judging=arena.judging??new Judging(arena.db); }
  invalidate():void { this.refreshed = -Infinity; this.cashflowsRefreshed = -Infinity; this.costsRefreshed.clear(); this.backtestComparisons.clear(); }
  private refresh(now: number): void {
    if (now-this.refreshed < CACHE_MS) return;
    this.refreshed=now; this.comparisons.clear(); this.lives.clear(); this.frequencies.clear(); this.parsed.clear(); this.clocks=null; this.held=null;
    this.demotions=this.arena.db.getSetting<Record<string,{at:number}>>('broker.demotions',{});
    if (now - this.cashflowsRefreshed >= 5 * 60_000) {
      this.cashflowsRefreshed = now;
      this.cashflows=this.arena.db.cashflowSummary();
    }
    // Load only standard demo runs (skips 8,900+ :delay= shadow copies) + backtest runs.
    const rows=[...this.arena.db.listRuns(RUN_KIND.DEMO,true,true),...this.arena.db.listRuns(RUN_KIND.BACKTEST,true)];
    this.comparisonRunCount=this.arena.db.countShadowRuns(RUN_KIND.DEMO);
    this.rows=new Map(rows.map(r=>[r.id,r])); this.agents=new Map(this.arena.db.agents().map(a=>[a.id,a]));
    this.backtests=new Map(rows.filter(r=>r.kind===RUN_KIND.BACKTEST&&!r.retired&&r.window_id===PRIMARY_BACKTEST_WINDOW_ID).map(r=>[runKey(r.agent_id,r.epic,r.leverage??0),r]));
    this.judging.keepBacktests(new Set([...this.backtests.values()].map(r=>r.id)));
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
      const row=this.rows.get(runId)??(runId?this.arena.db.run(runId):null), metrics=row?.metrics?JSON.parse(row.metrics):null;
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
    if(row.kind===RUN_KIND.BACKTEST) {
      const btKey=`${row.id}:${row.updated_at}`;
      const kept=this.backtestComparisons.get(btKey);if(kept)return kept;
      const m=row.metrics?JSON.parse(row.metrics):null;
      const result=!m||!(m.endTime>m.startTime)?unavailable('No completed backtest metrics.')
        :this.versusHold(row.epic,m.startTime,m.endTime,m.totalReturn,'same-backtest-window',
          'Same historical window. Sizing differs; excess return is not risk-adjusted alpha.');
      this.backtestComparisons.set(btKey,result);return result;
    }
    const cached=this.comparisons.get(row.id);if(cached)return cached;
    const life=this.life(row);
    const result=!life?unavailable('Waiting for the first hourly equity observation.')
      :this.versusHold(row.epic,life.from,life.through,life.ret,'shared-hourly-equity',
        'From the run\'s start to its latest hourly equity, on its starting capital. Sizing differs; excess return is not risk-adjusted alpha.');
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
  private metricsOf(row:RunRow):{trades?:number;winRate?:number}|null {
    let m=this.parsed.get(row.id);
    if(m===undefined){m=row.metrics?JSON.parse(row.metrics):null;this.parsed.set(row.id,m!);}
    return m??null;
  }
  private control(row:RunRow):boolean { return CONTROL_SLUGS.has(this.agents.get(row.agent_id)?.slug??row.agent_id); }
  /** The current backtest of the same agent version, instrument and leverage. */
  private sameCodeBacktest(row:Pick<RunRow,'agent_id'|'epic'|'leverage'|'code_hash'>):RunRow|undefined {
    const backtest=this.backtests.get(runKey(row.agent_id,row.epic,row.leverage??0));
    return backtest&&backtest.code_hash===row.code_hash?backtest:undefined;
  }
  /**
   * A forward record on the daily clock (judging.ts): its window since the start or the last demotion from Capital
   * demo, and its whole life. `confirmed`, the monkey and the bars are filled in by `field`.
   */
  private measure(row:RunRow,now:number):RecordClock {
    const demoted=this.demotions[row.id]?.at, since=demoted??row.started_at, end=row.retired?row.ended_at??row.updated_at:now;
    const forecast=!row.retired&&this.agents.get(row.agent_id)?.uses_forecast?this.arena.forecastAvailability?.evidence(since,now):undefined;
    const tracked=this.arena.tracked.get(row.id)?.run, all=tracked?.trades.length??this.metricsOf(row)?.trades??0;
    const backtest=this.sameCodeBacktest(row), history=backtest?this.judging.backtest(backtest).daily:null;
    const window=this.judging.forward(row,since,end), life=demoted?this.judging.forward(row,row.started_at,end):window;
    const lifeT=judgedT(life,history);
    return {since,days:Math.max(0,end-since-(forecast?.pausedMs??0))/86_400_000,
      trades:demoted&&tracked?tracked.trades.filter(t=>t.entryTime>=demoted).length:all,
      observations:window.n,t:judgedT(window,history),monkey:null,life:{observations:life.n,t:lifeT,e:eValue(lifeT,life.n)},
      backtestZ:agreementZ(life,history),trials:this.trials,confirmAt:null,aloneAt:life.n>=2?tAt(1/LIFECYCLE.ALONE_ALPHA,life.n):null,confirmed:false};
  }
  /**
   * Every live record's clock, with the instrument's luckiest monkey and the confirmed set: the strategy records past
   * the floor that agree with their backtest and whose e-values clear the bar for every strategy record ever started.
   */
  private field(now:number):Map<string,RecordClock> {
    if(this.clocks)return this.clocks;
    const demo=[...this.rows.values()].filter(r=>r.kind===RUN_KIND.DEMO&&!isShadow(r.id));
    this.trials=demo.filter(r=>!this.control(r)).length;
    const live=demo.filter(r=>!r.retired), clocks=new Map(live.map(r=>[r.id,this.measure(r,now)]));
    this.monkeys.clear();
    for(const r of live)if(this.agents.get(r.agent_id)?.slug===RANDOM_BASELINE_SLUG)
      this.monkeys.set(r.epic,Math.max(this.monkeys.get(r.epic)??-Infinity,clocks.get(r.id)!.life.t));
    const offered=live.filter(r=>!this.control(r)).map(r=>({id:r.id,c:clocks.get(r.id)!}))
      .filter(({c})=>floorMet(c.trades,c.days)&&c.backtestZ!==null&&c.backtestZ<=LIFECYCLE.AGREE_Z);
    const confirmed=confirmedSet(offered.map(({id,c})=>({id,e:c.life.e})),this.trials,LIFECYCLE.CONFIRM_FDR);
    for(const [id,c] of clocks) {
      c.monkey=this.monkeys.get(this.rows.get(id)!.epic)??null;
      c.confirmed=confirmed.ids.has(id);
      if(c.life.observations>=2)c.confirmAt=tAt(c.confirmed?this.trials/(LIFECYCLE.CONFIRM_FDR*confirmed.ids.size):confirmed.needs,c.life.observations);
    }
    this.standings(this.families(demo,now),live.filter(r=>!this.control(r)),clocks);
    return this.clocks=clocks;
  }
  /**
   * Where each record stands in its family, and the family's reading of its t with the luck taken out. Members'
   * t-statistics each carry a sampling spread of about 1, so a spread between members of 1 is what chance alone
   * gives: then nothing separates them and each is read at the members' average. Only the excess of the spread
   * over chance keeps a member's lead (the positive-part shrinkage of Efron and Morris). Members that move
   * together spread less than chance and are read as one.
   */
  private standings(families:Map<string,FamilyClock>,strategies:RunRow[],clocks:Map<string,RecordClock>):void {
    this.views.clear();
    for(const [id,rows] of Map.groupBy(strategies,r=>this.familyOf(r).id)) {
      const family=families.get(id);
      if(!family)continue;
      const judged=rows.filter(r=>clocks.get(r.id)!.life.observations>=10).sort((a,b)=>clocks.get(b.id)!.life.t-clocks.get(a.id)!.life.t);
      const stats=statsOf(judged.map(r=>clocks.get(r.id)!.life.t)), kept=stats.sd>1?1-1/stats.sd**2:0;
      for(const r of rows) {
        const rank=judged.indexOf(r)+1, t=clocks.get(r.id)!.life.t;
        this.views.set(r.id,{...family,...(rank>0&&judged.length>=3?{member:{t,rank,of:judged.length,average:stats.mean,spread:stats.sd,kept,estimate:stats.mean+kept*(t-stats.mean)}}:{})});
      }
    }
  }
  familyOf(row:Pick<RunRow,'agent_id'>):{id:string;name:string} {
    const slug=row.agent_id.split('/')[0]!;
    return familyLabel(this.arena.roster,this.agents.get(row.agent_id)??{slug,name:slug});
  }
  /**
   * Every strategy family judged as one record (judging.ts `pool`): its members' weekday returns, each divided by
   * the member's volatility (its same-code backtest's; a record of an older code version, its own), averaged over
   * the members running that day. The family's backtest is the same average of its running members' backtests: its
   * volatility is the floor under the family's, and its mean is what the forward mean must agree with. Families
   * are confirmed among themselves, counted over every strategy family ever started.
   */
  private families(demo:RunRow[],now:number):Map<string,FamilyClock> {
    const groups=new Map<string,{name:string;rows:RunRow[];monkeys:boolean}>();
    for(const r of demo) {
      const monkeys=this.agents.get(r.agent_id)?.slug===RANDOM_BASELINE_SLUG;
      if(this.control(r)&&!monkeys)continue;
      const {id,name}=this.familyOf(r), group=groups.get(id);
      if(group)group.rows.push(r);else groups.set(id,{name,rows:[r],monkeys});
    }
    const day=Math.floor((now-3_600_000)/86_400_000), measured:{monkeys:boolean;clock:FamilyClock}[]=[];
    for(const [id,group] of groups) {
      const live=group.rows.filter(r=>!r.retired);
      if(!live.length)continue;
      const histories=live.map(r=>{const b=this.sameCodeBacktest(r);return b?this.judging.backtest(b):null;});
      const key=`${day}|${group.rows.length}|${live.length}|${histories.reduce((n,h)=>n+(h?.at??0),0)}`;
      let p=this.pooled.get(id);
      if(!p||p.key!==key) {
        const members:Member[]=[];
        for(const r of group.rows) {
          const series=this.judging.forwardSeries(r,r.started_at,r.retired?r.ended_at??r.updated_at:now);
          const backtest=this.sameCodeBacktest(r), sd=backtest?this.judging.backtest(backtest).daily.sd:series.stats.n>=5?series.stats.sd:0;
          if(sd>0&&series.closes.length)members.push({closes:series.closes,returns:series.returns,scale:1/sd});
        }
        const past=histories.filter(h=>h&&h.daily.sd>0).map(h=>({closes:h!.closes,returns:h!.returns,scale:1/h!.daily.sd}));
        p={key,own:statsOf(pool(members).values),backtest:past.length?statsOf(pool(past).values):null,
          retiredTrades:group.rows.filter(r=>r.retired).reduce((n,r)=>n+(this.metricsOf(r)?.trades??0),0)};
        this.pooled.set(id,p);
      }
      const since=Math.min(...group.rows.map(r=>r.started_at)), t=judgedT(p.own,p.backtest);
      const trades=p.retiredTrades+live.reduce((n,r)=>n+(this.arena.tracked.get(r.id)?.run.trades.length??this.metricsOf(r)?.trades??0),0);
      measured.push({monkeys:group.monkeys,clock:{id,name:group.name,records:live.length,everRecords:group.rows.length,markets:new Set(live.map(r=>r.epic)).size,
        since,days:Math.max(0,now-since)/86_400_000,trades,observations:p.own.n,t,e:eValue(t,p.own.n),monkey:null,backtestZ:agreementZ(p.own,p.backtest),
        trials:0,confirmAt:null,aloneAt:p.own.n>=2?tAt(1/LIFECYCLE.ALONE_ALPHA,p.own.n):null,confirmed:false}});
    }
    const trials=[...groups.values()].filter(g=>!g.monkeys).length, monkey=measured.find(m=>m.monkeys)?.clock.t??null;
    this.monkeyFamily=monkey;
    const strategies=measured.filter(m=>!m.monkeys).map(m=>m.clock);
    const confirmed=confirmedSet(strategies.filter(c=>floorMet(c.trades,c.days)&&c.backtestZ!==null&&c.backtestZ<=LIFECYCLE.AGREE_Z).map(c=>({id:c.id,e:c.e})),trials,LIFECYCLE.CONFIRM_FDR);
    for(const c of strategies) {
      c.trials=trials; c.monkey=monkey; c.confirmed=confirmed.ids.has(c.id);
      if(c.observations>=2)c.confirmAt=tAt(c.confirmed?trials/(LIFECYCLE.CONFIRM_FDR*confirmed.ids.size):confirmed.needs,c.observations);
    }
    return new Map(strategies.map(c=>[c.id,c]));
  }
  /** The declared portfolios, each judged as one record (portfolio.ts). */
  portfolios(now=Date.now()):PortfolioView[] {
    this.refresh(now); this.field(now);
    return this.held??=this.arena.portfolios.views(now,this.monkeyFamily);
  }
  private clockOf(row:RunRow,now:number):RecordClock|undefined {
    if(row.kind!==RUN_KIND.DEMO)return;
    const field=this.field(now), kept=field.get(row.id);
    if(kept)return kept;
    // Retired records and execution comparisons are measured alone: they are not offered for confirmation.
    return {...this.measure(row,now),monkey:this.monkeys.get(row.epic)??null};
  }
  /**
   * How often the backtest of the same agent version, instrument and leverage returned what the record did over
   * as many days (frequency.ts). Absent before the record's first closed trade and without such a backtest.
   */
  private frequency(row:Pick<RunRow,'agent_id'|'epic'|'leverage'|'code_hash'>,observed:number,from:number,through:number,
    m:{trades?:number;winRate?:number}|null):BacktestFrequency|undefined {
    if(!m||!(m.trades!>0))return;
    const backtest=this.sameCodeBacktest(row);
    if(!backtest)return;
    const history=this.judging.backtest(backtest),counted=countPeriods(history.curve,periodDays(from,through),observed);
    if(!counted)return;
    const won=Math.round((m.winRate??0)*m.trades!);
    return {runId:backtest.id,...counted,...(history.trades>0?{wins:{won,trades:m.trades!,rate:history.winRate,backtestTrades:history.trades,
      chance:winChance(won,m.trades!,history.winRate)}}:{})};
  }
  /** Every period of `days` in a backtest by its end date: the chart behind a frequency. */
  periods(backtest:RunRow,days:number,now=Date.now()):BacktestPeriods {
    this.refresh(now);
    const current=this.backtests.get(runKey(backtest.agent_id,backtest.epic,backtest.leverage??0))?.id===backtest.id;
    return listPeriods(backtest.id,current?this.judging.backtest(backtest).curve:curveOf(this.arena.db.equity(backtest.id)),days);
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
      frequency=life?this.frequency(row,life.ret,life.from,life.through,this.metricsOf(row)):undefined;
      this.frequencies.set(row.id,frequency);
    }
    const clock=this.clockOf(row,now), family=this.views.get(row.id);
    return {asOf:now,basis:row.kind===RUN_KIND.BACKTEST?'historical-equity':'virtual-equity',
      admission:control?'control':extra.demoAdmission?'user-experiment':row.kind===RUN_KIND.BACKTEST&&!passes?'backtest-rejected':extra.grandfathered||!passes?'calibration':'backtest-qualified',
      benchmark:this.comparison(row,now),...(frequency?{frequency}:{}),...(clock?{clock}:{}),...(family?{family}:{}),costs:this.costs.get(row.id)??emptyCosts(),
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
      comparisonRuns:this.comparisonRunCount,
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
    // The clock and the family's view stay the virtual record's: the strategy is judged on it, at full size and from its first day.
    const {frequency:_virtual,...base}=this.forRun(meta),m=row.metrics;
    const frequency=m&&m.startTime?this.frequency(meta,m.totalReturn,m.startTime,m.endTime,m):undefined;
    return {...base,basis:'broker-realized-cash',costs:null,benchmark:this.cashComparison(row),...(frequency?{frequency}:{}),
      exposure:null,stopRisk:null,openFunding:null,unrealizedPnl,openPosition,
      note:'Actual realized cash plus linked adjustments. Unlinked funding/corporate actions remain at account level; open P&L is separate. Cash drawdown does not measure intratrade risk.'};
  }
}
