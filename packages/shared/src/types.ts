// Arena API wire types — shared by the arena (apps/backend/src/arena/api.ts) and the dashboard (apps/ui).

export type RunKind = 'demo' | 'backtest';
export type Side = 'long' | 'short';

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
	sharpe: number;
	sortino: number;
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
	avgBarsHeld: number;
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
	/** Demo rows: the backtest of the same agent, instrument and leverage. */
	backtest: { runId: string; metrics: RunMetrics | null; codeHash: string; sameCode: boolean } | null;
	/** Demo rows: mirrored onto a broker demo account. */
	mirrored: boolean;
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

export interface Trade {
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
	memoryMb: number;
}

export interface ArenaEvent {
	time: number;
	level: 'info' | 'warn' | 'error';
	source: string;
	message: string;
}
