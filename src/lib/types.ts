// Mirrored from trader-backend types

export type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

export type FillReason = 'ORDER' | 'STOP_LOSS' | 'TAKE_PROFIT' | 'MARKET_CLOSE' | 'LIQUIDATION';

export interface AgentConfig {
	name: string;
	version: string;
	instrument: string;
	primaryFeed: Timeframe;
	secondaryFeeds?: Timeframe[];
	maxDrawdown?: number;
	maxPositionSize?: number;
	leverage?: number;
}

export interface AgentSummary {
	id: string;
	config: AgentConfig;
	path: string;
}

export interface BlueprintDimension {
	id: string;
	[key: string]: unknown;
}

export interface BlueprintMeta {
	name: string;
	version: string;
	instrument: string;
	directory: string;
	agentCount: number;
	dimensionKeys: Record<string, unknown[]>;
	dimensions: BlueprintDimension[];
}

export interface Metrics {
	totalTrades: number;
	wins: number;
	losses: number;
	winRate: number;
	totalPnL: number;
	totalReturn: number;
	maxDrawdown: number;
	sharpe: number;
	profitFactor: number;
	averageWin: number;
	averageLoss: number;
	averageHoldTime: number;
	longestWinStreak: number;
	longestLoseStreak: number;
}

export interface RunRecord {
	id: string;
	agentId: string;
	agentName: string;
	mode: string;
	status: string;
	capital: number;
	instrument: string;
	config: Record<string, unknown>;
	startedAt: number | null;
	completedAt: number | null;
	metrics: Metrics | null;
}

export interface Fill {
	action: 'OPENED' | 'CLOSED';
	reason: FillReason;
	side: 'BUY' | 'SELL';
	size: number;
	price: number;
	timestamp: number;
	pnl?: number;
}

export interface EquityPoint {
	timestamp: number;
	equity: number;
	balance: number;
}

export interface RunConfig {
	agentId: string;
	capital: number;
	mode: 'backtest' | 'paper' | 'live';
	startDate?: string;
	endDate?: string;
	maxDrawdown?: number;
	maxPositionSize?: number;
	tickMode?: boolean;
}

export interface InstrumentInfo {
	epic: string;
	leveraged: boolean;
	leverage: number;
	spread: number;
	lotSize: number;
	minSize: number;
	maxSize: number;
	sizeIncrement: number;
	pricePrecision: number;
	tradingHours: {
		timezone: string;
		gaps: Array<{
			from: string;
			gapStart: string;
			gapEnd: string;
		}>;
	};
	category?: string;
}
