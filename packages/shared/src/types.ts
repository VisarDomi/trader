// Arena API wire types — shared by the arena (apps/backend/src/arena/api.ts) and the dashboard (apps/ui).

export type RunKind = 'demo' | 'backtest';
export type Side = 'long' | 'short';

/** Derived evidence at a fill, not another stored tick tape. */
export interface FillQuoteEvidence {
  mid: number;
  spread: number;
  source: 'recorded' | 'synthetic' | 'live' | 'candle';
  decisionMid?: number;
  ageMs?: number;
  journalId?: string;
  sequence?: number;
  /** A target filled at this level between two quotes; the evidence is the quote that crossed it. */
  limit?: number;
}
export interface ExecutionCostEvidence {
  method: 'fill-quotes' | 'archived-quote-match';
  source: 'recorded' | 'synthetic' | 'live' | 'candle' | 'mixed';
  entry: FillQuoteEvidence;
  exit: FillQuoteEvidence;
  midpointPnl: number;
  spreadCost: number;
  /** Positive = adverse timing; negative = favorable. Unknown for old decisions. */
  timingCost: number | null;
  /** Fill rounding, targets filled at their level rather than at the crossing quote, and negative-balance protection; never disguised as fees. */
  adjustmentPnl: number;
}

export interface CostSummary {
  reportedTrades: number;
  historyComplete: boolean;
  closedTrades: number;
  closedNetPnl: number;
  closedFunding: number;
  beforeFundingPnl: number;
  measuredTrades: number;
  capturedTrades: number;
  reconstructedTrades: number;
  measuredNetPnl: number;
  measuredFunding: number;
  midpointPnl: number;
  spreadCost: number;
  adjustmentPnl: number;
  timedTrades: number;
  timingCost: number;
  timedSignalPnl: number;
  timedNetPnl: number;
  doubledSpreadPnl: number | null;
  diagnosis: 'unmeasured' | 'negative-before-spread' | 'costs-exceed-gain' | 'positive-after-costs';
}
export interface BenchmarkComparison {
  status: 'matched' | 'unavailable';
  /** The strategy side. Virtual: stored hourly equity from the run's start. Backtest: the historical window. Capital:
   *  realized cash since the first deal. The other side is always the outright 1:1 hold over the same dates. */
  basis: 'shared-hourly-equity' | 'same-backtest-window' | 'cash-vs-hold' | 'unavailable';
  from?: number;
  through?: number;
  strategyReturn?: number;
  benchmarkReturn?: number;
  excessReturn?: number;
  /** What the money could have earned, and what inflation took, over the same dates. Absent while the arena has no
   *  stored rates for those dates. */
  hurdles?: Hurdles;
  /** The hold's parts: benchmarkReturn = (1 + price) × (1 + income) − 1. */
  hold?: HoldBreakdown;
  note: string;
}
/** The 1:1 hold bought outright, without CFD fees (apps/backend/src/arena/hold.ts). */
export interface HoldBreakdown {
  /** Price change alone. */
  price: number;
  /** What owning it paid over the dates: dividends (shares, index trackers) or foreign deposit interest. */
  income: number;
  kind: 'dividends' | 'interest' | 'none';
  /** E.g. "SPY dividends ×3" (US500's tracker), "no SPY dividend in these dates", "€STR on EUR". */
  source?: string;
  /** Oil and gas cannot be owned outright: the price path is an upper bound for a real holder. */
  priceOnly?: boolean;
}
/** The common floors under every play (apps/backend/src/arena/rates.ts). Inflation lowers every alternative alike,
 *  so it never changes which one wins; it moves the line between gaining and losing purchasing power. */
export interface Hurdles {
  /** Rolling 3-month US Treasury bills, accrued daily: the opportunity cost of the money. */
  cash: number;
  /** US CPI-U (all items, not seasonally adjusted): what holding dollars lost in purchasing power. */
  inflation: number;
  /** Latest Treasury bill rate used (epoch ms of its day). */
  billsThrough: number;
  /** Latest published CPI month, e.g. "2026-10". */
  cpiThrough: string;
  /** The dates run past the latest CPI release; those weeks continue the trailing 12-month pace. */
  estimated: boolean;
}
/**
 * How often the record's result happened in its own backtest: the backtest of the same agent version, instrument and
 * leverage, cut into every period as long as the record has lived (apps/backend/src/arena/frequency.ts).
 */
export interface BacktestFrequency {
  /** The backtest the periods come from. */
  runId: string;
  /** Period length: the record's age in whole days, at least one. */
  days: number;
  /** The record's return over its life, which the periods are counted against. */
  observed: number;
  /** Periods of `days` in the backtest, one per stored day one can start on. They overlap. */
  periods: number;
  /** How many of them fit end to end without overlapping. */
  independent: number;
  /** Periods that returned at least / at most `observed`. */
  atLeast: number;
  atMost: number;
  best: number;
  worst: number;
  /** Wins alone: the chance of at least `won` wins in `trades` trades at the backtest's win rate, sizes ignored. */
  wins?: { won: number; trades: number; rate: number; backtestTrades: number; chance: number };
}
/** Every period of a backtest by its end date, for the chart behind a BacktestFrequency. */
export interface BacktestPeriods {
  runId: string;
  days: number;
  /** The backtest's first and last stored day. */
  from: number;
  through: number;
  median: number | null;
  points: { t: number; ret: number }[];
}
/**
 * A forward record on the daily clock: one return per weekday, flat days included (apps/backend/src/arena/judging.ts).
 * Capital demo rows carry their virtual record's clock: the strategy is judged on that record.
 */
export interface RecordClock {
  /** Where the judged window starts: the record's start, or its last demotion from Capital demo. */
  since: number;
  /** Days observed since then, known forecast outages removed, and trades closed that were entered since then. */
  days: number;
  trades: number;
  /** Weekdays in the window and their t-statistic: mean / volatility × √days, volatility never below the backtest's. */
  observations: number;
  t: number;
  /** The highest whole-life t among the instrument's random monkeys; null when it has none. */
  monkey: number | null;
  /** The whole record: its weekdays, t, and the e-value against "no edge" (valid however often it is looked at). */
  life: { observations: number; t: number; e: number };
  /** The forward mean daily return against the same-code backtest's, in standard errors; null without such a backtest. */
  backtestZ: number | null;
  /** Strategy records ever started: what the confirmed bar is counted over. */
  trials: number;
  /** The whole-life t this record needs to be confirmed today, and the one it would need were it the only record. */
  confirmAt: number | null;
  aloneAt: number | null;
  /** Past the floor, agreeing with its backtest and clearing the bar for every record tried. */
  confirmed: boolean;
}
/**
 * A family on the daily clock: each weekday it is worth the average of its records' returns, each divided by that
 * record's volatility (judging.ts `pool`). A family is an agent file with all its variants, instruments and tiers,
 * or several files joined in agents/roster.json. Records retired since still count on the days they ran.
 */
export interface FamilyClock {
  id: string;
  name: string;
  /** Records running now, all that ever ran, and the instruments the running ones trade. */
  records: number;
  everRecords: number;
  markets: number;
  /** When its first record started, days since, and the closed trades of all its records. */
  since: number;
  days: number;
  trades: number;
  /** Weekdays with at least one record, their t-statistic and the e-value against "no edge". */
  observations: number;
  t: number;
  e: number;
  /** The random monkeys judged as one family; null without them. */
  monkey: number | null;
  /** The family's forward mean against the same average of its records' backtests, in standard errors. */
  backtestZ: number | null;
  /** Strategy families ever started: what a family's confirmed bar is counted over. */
  trials: number;
  confirmAt: number | null;
  aloneAt: number | null;
  confirmed: boolean;
}
/**
 * What a record's family says about it (`evidence.family`). It changes nothing in the record's own clock or verdict.
 */
export interface FamilyView extends FamilyClock {
  /**
   * The record among the family's members with ten or more weekdays, by whole-life t. `estimate` is the family's
   * reading of the record's own t with the luck taken out: the members' average plus the share of the record's
   * lead that the spread between members supports (none of it while they differ by no more than chance, which is
   * a spread of 1). Absent with fewer than three such members.
   */
  member?: { t: number; rank: number; of: number; average: number; spread: number; kept: number; estimate: number };
}
/**
 * A portfolio judged as one record: a rule fixed in advance that picks records from their backtests alone
 * (EVIDENCE.md "The arena portfolio"). It is one claim, so its bar is counted over the portfolios declared.
 */
export interface PortfolioClock {
  id: string;
  name: string;
  /** The rule: running strategy records whose same-code backtest Sharpe before T-bills is at least this, at equal risk, picked again in each UTC month. */
  minBacktestSharpe: number;
  /** The day the rule was written down (YYYY-MM-DD). */
  declared: string;
  /** Its first pick and its latest; null before the first. The record is the weekdays closed after the first. */
  since: number | null;
  pickedAt: number | null;
  /** The latest pick: its records, the agent files and instruments among them; and the picks made so far. */
  records: number;
  agents: number;
  markets: number;
  picks: number;
  /** Days since the first pick, and the trades its records entered while it held them. */
  days: number;
  trades: number;
  /** Weekdays closed, their compounded return, their t-statistic and the e-value against "no edge". */
  observations: number;
  ret: number;
  t: number;
  e: number;
  /** Sharpe ratio per year so far (volatility never below the backtests'), and of the latest pick's backtests at the same weights. */
  sharpe: number | null;
  backtestSharpe: number | null;
  /** The random monkeys judged as one family; null without them. */
  monkey: number | null;
  /**
   * The forward mean against the latest pick's backtests, in standard errors. Shown, not required: the members were
   * picked on those backtests, so the backtests flatter the pick and the forward record is expected to fall short.
   */
  backtestZ: number | null;
  /** Portfolios declared: what the confirmed bar is counted over. */
  trials: number;
  confirmAt: number | null;
  /** Past the day floor with an e-value at the always-valid bar for the portfolios declared. */
  confirmed: boolean;
  /**
   * Days from the first pick until it is expected at the confirmed bar if it holds its backtests' Sharpe ratio, and
   * if it holds half of it. Null without backtests, without an edge in them, or beyond fifty years.
   */
  confirmDays: { backtest: number | null; half: number | null };
}
/** One record of the latest pick: its share of the capital, its backtest Sharpe before T-bills and its return since the pick. */
export interface PortfolioMember { runId: string; agentId: string; name: string; epic: string; leverage: number | null; share: number; backtestSharpe: number | null; ret: number | null }
export interface PortfolioView extends PortfolioClock {
  /** Compounded return after each closed weekday, as a fraction. */
  curve: { t: number; value: number }[];
  members: PortfolioMember[];
}
export interface DependencyEvidence {
  state: 'available' | 'unavailable' | 'user-paused';
  since: number;
  trackedSince: number;
  pausedMs: number;
  note: string;
}
export interface AgentEvidence {
  asOf:number;
  basis: 'virtual-equity' | 'historical-equity' | 'broker-realized-cash';
  admission: 'control' | 'user-experiment' | 'calibration' | 'backtest-qualified' | 'backtest-rejected';
  benchmark: BenchmarkComparison;
  /** Forward records with closed trades and a backtest of the same code long enough to count; absent otherwise. */
  frequency?: BacktestFrequency;
  /** Forward records only. */
  clock?: RecordClock;
  /** Strategy records only: the family judged as one record, and where this record stands in it. */
  family?: FamilyView;
  costs: CostSummary | null;
  exposure: number | null;
  openPosition: boolean;
  stopRisk: number | null;
  openFunding: number | null;
  unrealizedPnl: number | null;
  dependency?: DependencyEvidence;
  /** Comparison copies do not multiply the independent research count. */
  strategyVariants: number;
  note: string;
}
export interface EvidenceOverview {
  asOf:number;strategyVariants:number;standardRuns:number;strategyRuns:number;comparisonRuns:number;
  measuredTrades:number;storedTrades:number;
  accountCashflows:{totals:{type:string;n:number;amount:number}[];unallocated:{type:string;n:number;amount:number}[]};
  dependency:DependencyEvidence|null;note:string;
}

export interface ReplayDataInfo {
  /** Absent on legacy results. Input endpoints do not establish calendar coverage. */
  window?: {requestedStart:number;requestedEnd:number;inputStart:number|null;inputEnd:number|null;trailingGapMs:number|null;calendarVerified:false};
  mode: 'auto' | 'recorded' | 'synthetic';
  generator: string;
  seed: number;
  ticksPerMinute: number;
  recordedTicks: number;
  syntheticTicks: number;
  recordedMinutes: number;
  syntheticMinutes: number;
  partialRecordedMinutes: number;
  rejectedTicks: number;
  execution: string;
}

export interface TickRecordingStatus {
  journalId: string;
  highWater: number;
  acknowledged: number;
  buffered: number;
  lostTicks: number;
  invalidMessages: number;
  lastError: string | null;
  bytes: number;
  diskWarning: boolean;
  instruments: {epic:string;n:number;firstReceivedAt:number;lastReceivedAt:number;lastQuoteAt:number}[];
}

export interface MonthlyReturn {
	month: string;
	ret: number;
}

/** Fractions: 0.12 = +12%. */
export interface RunMetrics {
	startTime: number;
	endTime: number;
	days: number;
	initialCapital: number;
	finalEquity: number;
	totalReturn: number;
	annualReturn: number;
	maxDrawdown: number;
	/** Above 3-month T-bills when riskFree is 'tbills'; cash-free otherwise. */
	sharpe: number;
	sortino: number;
	riskFree?: 'tbills';
	/** With riskFree: the Sharpe of the returns themselves (the backtest admission gate's input). */
	cashFreeSharpe?: number;
	calmar: number;
	trades: number;
	longTrades: number;
	shortTrades: number;
	winRate: number;
	profitFactor: number;
	avgTradePnl: number;
	avgWin: number;
	avgLoss: number;
	bestTrade: number;
	worstTrade: number;
	tStat: number;
	avgBarsHeld: number | null;
	exposure: number;
	funding: number;
	profitableMonths: number;
	totalMonths: number;
	monthly: MonthlyReturn[];
}

export interface LeaderboardRow {
	runId: string;
	agentId: string;
	name: string;
	slug: string;
	/** The family the record is judged with: its agent file, or a roster family joining several files. */
	family?: { id: string; name: string };
	timeframe: string;
	epic: string;
	/** Account leverage tier (1 = 1:1, unleveraged); null for runs from before leverage tiers. */
	leverage: number | null;
	/** Leverage on this instrument: the tier, capped at 20 for crypto and shares. */
	effectiveLeverage: number | null;
	status: string;
	codeHash: string;
	startedAt: number;
	updatedAt: number;
	equity: number;
	metrics: RunMetrics | null;
	usesForecast: boolean;
	dependency?: DependencyEvidence;
	evidence?: AgentEvidence;
	/** Demo rows: the backtest of the same agent, instrument and leverage. */
	backtest: { runId: string; metrics: RunMetrics | null; codeHash: string; sameCode: boolean; sameEngine?:boolean; data?:ReplayDataInfo|null } | null;
	data?:ReplayDataInfo|null;
	/** Demo rows: mirrored onto a broker demo account. */
	mirrored: boolean;
	/** Demo rows promoted to the tracked Real stage (Capital API remains demo-only). */
	real?: boolean;
	stage?: 'backtest' | 'virtual' | 'demo' | 'real';
	scenario?: string;
	comparisonOnly?: boolean;
	/** User-requested, source-version-specific demo admission, independent of earned rank. */
	demoAdmission?: { date: string; reason: string };
	stageReason?: string;
	brokerEvidence?: { closed: number; priced: number; failed: number; open: number; basis: string };
}

export interface RunSummary {
	id: string;
	kind: RunKind;
	agentId: string;
	epic: string;
	/** Account leverage tier; null for runs from before leverage tiers. */
	leverage: number | null;
	codeHash: string;
	windowId: string | null;
	status: string;
	capital: number;
	equity: number;
	startedAt: number;
	updatedAt: number;
	endedAt: number | null;
	metrics: RunMetrics | null;
}

export interface AgentInfo {
	id: string;
	slug: string;
	variant: string | null;
	name: string;
	description: string;
	author: string | null;
	timeframe: string;
	instruments: string[];
	params: Record<string, unknown>;
	usesForecast: boolean;
	codeHash: string;
	firstSeen: number;
	updatedAt: number;
	active: boolean;
}

export interface AgentListItem extends AgentInfo {
	demo: RunSummary[];
	backtest: RunSummary[];
}

export interface AgentVersion {
	code_hash: string;
	source: string;
	first_seen: number;
}

export interface AgentDetail extends AgentInfo {
	versions: AgentVersion[];
	runs: RunSummary[];
}

/** Single-round-trip payload for the Agent Detail screen (avoids N+1 run calls and full leaderboards). */
export interface AgentBundle {
	agent: AgentDetail;
	liveRuns: RunDetail[];
	capital: LeaderboardRow[];
	backtests: LeaderboardRow[];
	realService: BrokerStatus['realService'] | null;
}

export const GRAVEYARD_CATEGORY = { AGENT: 'agent', VERSION: 'version', PLATFORM: 'platform', RUNS: 'runs' } as const;
export type GraveyardCategory = typeof GRAVEYARD_CATEGORY[keyof typeof GRAVEYARD_CATEGORY];
export interface GraveyardRun extends Pick<RunSummary, 'id' | 'kind' | 'epic' | 'leverage' | 'capital' | 'equity' | 'windowId' | 'startedAt' | 'endedAt'> {
	reason: string;
	engineVersion: string | null;
	metrics: Pick<RunMetrics, 'trades' | 'totalReturn' | 'sharpe' | 'maxDrawdown'> | null;
}
export interface GraveyardEntry {
	key: string;
	agentId: string;
	name: string;
	codeHash: string;
	category: GraveyardCategory;
	hasSource: boolean;
	startedAt: number;
	endedAt: number | null;
	runs: GraveyardRun[];
	backtests: GraveyardRun[];
	comparisonRuns: number;
}

export interface Trade {
	/** Stable SQLite trade sequence for inspection links; absent in older cached responses. */
	index?: number;
	side: Side;
	size: number;
	entryTime: number;
	entryPrice: number;
	exitTime: number;
	exitPrice: number;
	pnl: number;
	funding: number;
	exitReason: string;
	entryReason?: string;
	exitNote?: string;
	barsHeld: number;
	barsHeldPartial?: boolean;
	execution?: ExecutionCostEvidence;
}

export interface EquityPoint {
	t: number;
	equity: number;
}

export interface LogLine {
	time: number;
	message: string;
}

export interface Deal {
	id: number;
	/** Capital.com demo account name when the deal was opened. */
	account: string;
	account_id: string | null;
	run_id: string;
	epic: string;
	side: string;
	size: number;
	paper_size: number;
	deal_id: string | null;
	status: 'open' | 'closed' | 'failed';
	open_time: number;
	open_price: number | null;
	paper_open_price: number;
	close_time: number | null;
	close_price: number | null;
	paper_close_price: number | null;
	pnl: number | null;
	note: string | null;
}

export interface OpenPositionView {
	side: Side;
	size: number;
	entryPrice: number;
	entryTime: number;
	stopLoss: number | null;
	takeProfit: number | null;
	trailingStop: number | null;
}

export interface RunDetail extends RunSummary {
	evidence?: AgentEvidence;
	params: Record<string, unknown>;
	extra: Record<string, unknown> | null;
	position: OpenPositionView | null;
	state: unknown;
	trades: Trade[];
	equityCurve: EquityPoint[];
	logs: LogLine[];
	deals: Deal[];
}

export interface BrokerAccountStatus {
	/** Capital.com accountId (stable; names can change). */
	id: string;
	name: string;
	balance: number;
	equity: number;
	/** Balance reserved for mirrored runs when the account was enrolled (≤ 100,000). Null until enrolled. */
	allocation: number | null;
	/** Runs this account can hold. */
	slots: number;
	/** Hedging mode: many runs per instrument. Netting (false): one per instrument. Null until read. */
	hedging: boolean | null;
	/** Leverage tier from agents/roster.json (1 = 1:1); null = the account gets no runs. */
	leverage: number | null;
	/** The account's leverage settings match its tier; null until read. */
	leverageOk: boolean | null;
	runs: string[];
	openDeals: number;
	killed: boolean;
	/** Renamed away from the prefix: the arena is closing its deals there. */
	retiring: boolean;
	/** Instruments with positions the arena did not open. */
	foreignEpics: string[];
	lastReconcileAt: number;
}

export interface RealDealSummary {
	id: number;
	run_id: string;
	epic: string;
	side: 'long' | 'short';
	size: number;
	deal_id: string | null;
	status: 'open' | 'closed' | 'failed';
	open_time: number;
	open_price: number | null;
	close_time: number | null;
	close_price: number | null;
	pnl: number | null;
	note: string | null;
}

export interface RealStatus {
	host: string;
	reachable: boolean;
	accountId: string;
	accountName: string | null;
	currency: string | null;
	balance: number | null;
	available: number | null;
	equity: number | null;
	leverage: number | null;
	leverageOk: boolean | null;
	assignment: {
		runId: string;
		agentId: string;
		epic: string;
		leverage: number;
		codeHash: string;
		assignedAt: number;
	} | null;
	streamConnected: boolean;
	ready: boolean;
	openDeals: number;
	deals: RealDealSummary[];
	lastCycleAt: number;
	lastError: string | null;
}

export interface BrokerStatus {
	enabled: boolean;
	/** Accounts whose name starts with this are used. */
	prefix: string;
	/** Broker size ÷ paper size. */
	scale: number;
	/** Runs a full ($100,000, hedging) account holds. */
	slotsPerAccount: number;
	/** Capital.com allows this many demo accounts per login. */
	maxAccountsPerLogin: number;
	accounts: BrokerAccountStatus[];
	/** Per leverage tier: its accounts and how many of its live runs are mirrored. */
	tiers: { leverage: number; accounts: string[]; slots: number; liveRuns: number; mirrored: number }[];
	coverage: {
		liveRuns: number;
		mirrored: number;
		excluded: number;
		unassigned: number;
		/** More full accounts needed to mirror every live run. */
		accountsNeeded: number;
	};
	excluded: string[];
	promoted: string[];
	real: string[];
	realService?: RealStatus | null;
	queued: number;
	opensLastHour: number;
	maxOpensPerHour: number;
	lastCycleAt: number;
	lastError: string | null;
}

export interface QuoteStatus {
	bid: number | null;
	ask: number | null;
	quoteTime: number | null;
	lastCandle: number | null;
}

export interface ArenaStatus {
	startedAt: number;
	now: number;
	agents: number;
	demoRuns: number;
	loadErrors: { file: string; error: string }[];
	stream: { connected: boolean; connectedSince: number; reconnects: number };
	quotes: Record<string, QuoteStatus>;
	forecaster: { reachable: boolean; lastProbeAt: number; lastSuccessAt: number; lastError: string | null; requests: number; failures: number };
	broker: BrokerStatus | null;
	execution?: Record<string, any>;
	network?: Record<string, any>;
	ticks?:TickRecordingStatus|null;
	tickStorage?: {at:number;totalBytes:number;budgetBytes:number;pointTwoYearBytes:number;stressTwoYearBytes:number;ticksPerSecond:number;bytesPerTick:number;warning:boolean;notes:string}|null;
	memoryMb: number;
}

export interface ArenaEvent {
	time: number;
	level: 'info' | 'warn' | 'error';
	source: string;
	message: string;
}
