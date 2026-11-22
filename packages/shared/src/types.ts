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
  /** E.g. "SPY dividends ×3" (US500's tracker), "€STR on EUR". */
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
	stage?: 'backtest' | 'virtual' | 'demo';
	scenario?: string;
	comparisonOnly?: boolean;
	/** User-requested, source-version-specific demo admission, independent of earned rank. */
	demoAdmission?: { date: string; reason: string };
	stageReason?: string;
	observation?: { since: number; trades: number; tStat: number; pausedMs?: number };
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
