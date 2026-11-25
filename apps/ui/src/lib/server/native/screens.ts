/**
 * The native app's screens, built on the server from arena records (see wire.ts for the format).
 * Each builder is a pure function of the records it is given; `loadScreen` fetches them.
 */
import type { AgentDetail, AgentEvidence, AgentListItem, BacktestFrequency, BacktestPeriods, Deal, GraveyardEntry, LeaderboardRow, RunDetail, RunSummary, Trade } from '@trader/shared';
import { CONTROL_SLUGS, LIFECYCLE, assess } from '@trader/shared';
import type { Inspection } from '../inspection';
import { daysText, frequencyLine, frequencySide, shareText, winsLine } from '../../frequency';
import { agreementLine, barsLine, clockLine, verdictWord } from '../../clock';
import { candles as packCandles, clock, compact, date, day, f32, moment, num, pct, pp, series, signedUsd, span, tier, tone, usd, type Graph, type Guide, type Marker, type Row, type Screen, type Section, type Stat } from './wire';

type Json = Record<string, any>;
/** Per-run mini price paths from the inspector: closes evenly spaced from entry to exit. */
export interface Sparks { epic: string; points: number; trades: [string, (number | null)[]][]; deals: [string, (number | null)[]][]; open: (number | null)[] | null }
const FX = new Set(['EURUSD', 'GBPUSD', 'AUDUSD']);
const precisionFor = (epic: string) => (FX.has(epic) ? 5 : 2);
const live = (r: { kind: string; status: string; id: string }) => r.kind === 'demo' && r.status !== 'retired' && !r.id.includes(':delay=');
const runRoute = (id: string, stage?: string) => ({ screen: 'run', id, ...(stage ? { stage } : {}) });

// ---------------------------------------------------------------- rankings

// Index 3 is Sharpe: app builds before 2026-11-23 reset sort 3 when switching to Capital, where it matters least.
export const RANKING_SORT = ['Return', 'vs T-bills', 'vs hold', 'Sharpe', 'Closed trades'];
export type RankingRow = LeaderboardRow & { control?: boolean; forwardVerdict?: string | null };
/** The same dates' alternatives: holding the instrument, Treasury bills, and doing nothing (inflation). */
export function alternatives(b: Json | undefined, holdLabel = 'Hold'): string {
	if (b?.status !== 'matched') return '';
	const h: Json | undefined = b.hurdles;
	return [`${holdLabel} ${pct(b.benchmarkReturn)}`, h ? `T-bills ${pct(h.cash)}` : '', h ? `inflation ${pct(h.inflation)}` : ''].filter(Boolean).join(' · ');
}
/** The return above rolled T-bills over the same dates: is the play worth more than the safe floor? */
export const overCash = (b: Json | undefined): number | null =>
	b?.status === 'matched' && b.hurdles && Number.isFinite(b.strategyReturn) ? b.strategyReturn - b.hurdles.cash : null;
/** Return, then its lead over T-bills (the safe floor) and over holding the instrument outright. */
export function worthStats(label: string, ret: number | null | undefined, b: Json | undefined): Stat[] {
	const cash = overCash(b), hold = b?.status === 'matched' ? (b.excessReturn as number) : null;
	return [{ label, value: pct(ret), tone: tone(ret) }, { label: 'vs T-bills', value: pp(cash), tone: tone(cash) }, { label: 'vs hold', value: pp(hold), tone: tone(hold) }];
}
const count = (n: number | null | undefined, one: string, many: string) => (n == null ? '' : `${num(n, 0)} ${n === 1 ? one : many}`);
/** "price −9.3% · SPY dividends ×1 +0.2%": the outright hold's parts. */
export function holdParts(b: Json | undefined): string {
	const h: Json | undefined = b?.hold;
	if (!h) return '';
	const parts = [`price ${pct(h.price)}`, h.kind !== 'none' ? `${h.source ?? h.kind}${h.income ? ' ' + pct(h.income) : ''}` : ''].filter(Boolean).join(' · ');
	return `Bought outright, no CFD fees: ${parts}${h.priceOnly ? '. Nobody owns oil or gas outright, so this hold is an upper bound' : ''}.`;
}
/** The strategy's return in today's purchasing power: (1 + return) / (1 + inflation) − 1. */
export const afterInflation = (b: Json | undefined): number | null =>
	b?.status === 'matched' && b.hurdles && Number.isFinite(b.strategyReturn) ? (1 + b.strategyReturn) / (1 + b.hurdles.inflation) - 1 : null;

export function rankingRow(row: RankingRow | Json, stage = 'virtual', name?: string): Row {
	const r = row as Json;
	const id: string = r.runId || r.id;
	let badge = '';
	if (r.status === 'retired') badge = 'Archived';
	else if (r.comparisonOnly) badge = r.control ? 'Control · comparison' : 'Execution comparison';
	else if (r.control) badge = stage === 'capital' && !r.mirrored ? 'Control · past assignment' : 'Control';
	else if (r.demoAdmission) badge = 'User experiment';
	else if (stage === 'capital') badge = r.mirrored ? '' : 'Past assignment';
	else if (stage === 'virtual' && r.forwardVerdict) badge = verdictWord(r.forwardVerdict);
	const e: Json = r.evidence ?? {}, b: Json = e.benchmark ?? {}, m: Json = r.metrics ?? {};
	if (!badge && e.admission === 'calibration') badge = 'Calibration';
	if (!badge && e.admission === 'backtest-rejected') badge = 'Fails admission gate';
	const dependency = r.dependency ?? e.dependency;
	if (dependency && dependency.state !== 'available' && stage === 'virtual' && r.status !== 'retired') badge = 'Forecast paused';
	const period = stage === 'backtest' ? r.windowId || id.split(':')[1] || '' : r.timeframe || '';
	// Every stage compares over the same dates with T-bills (the safe floor) and with holding the instrument outright.
	const dd = pct(m.maxDrawdown ? -m.maxDrawdown : m.maxDrawdown);
	const stats = worthStats('Return', m.totalReturn, b);
	// The verdict on the daily clock; how often its own backtest did this; what the same dates paid elsewhere; this record
	// after inflation, then its risk. Capital rows carry their virtual record's clock.
	const real = afterInflation(b);
	const risk = [real != null ? `After inflation ${pct(real)}` : '', stage !== 'capital' || m.sharpe != null ? `Sharpe ${num(m.sharpe)}` : '', stage === 'capital' ? `cash drawdown ${dd}` : `drawdown ${dd}`,
		e.exposure > 0 ? `exposure ${num(e.exposure)}×` : ''].filter(Boolean).join(' · ');
	const judged = stage === 'backtest' || r.comparisonOnly ? '' : clockLine(r as LeaderboardRow, Date.now(), !!r.forwardVerdict && badge === verdictWord(r.forwardVerdict));
	const facts = [judged, frequencyLine(e.frequency), alternatives(b), risk].filter(Boolean).join('\n');
	return compact({
		id, title: name ?? (r.name || r.epic), subtitle: [r.epic, tier(r.leverage), period, count(m.trades, 'trade', 'trades')].filter(Boolean).join(' · '),
		body: facts, badge, stats, route: runRoute(id, stage),
		keys: [m.totalReturn ?? null, overCash(b), b.status === 'matched' ? b.excessReturn : null, m.sharpe ?? null, m.trades ?? null],
	});
}
export function rankingsScreen(rows: RankingRow[], stage: string, scenario?: string | null): Screen {
	const name = stage === 'capital' ? 'Capital demo' : stage === 'virtual' ? 'Virtual engine' : 'Backtests';
	return compact({ v: 2 as const, title: 'Rankings', subtitle: scenario && scenario !== 'standard' ? scenario : '', sort: RANKING_SORT,
		sections: [{ title: `${name} · ${rows.length} records`, rows: rows.map(r => rankingRow(r, stage)) }] });
}

// ---------------------------------------------------------------- agents

export function agentsScreen(items: AgentListItem[]): Screen {
	const active = items.filter(a => a.active).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
	return { v: 2, title: 'Agents', sections: [{ title: `${active.length} active variants`, rows: active.map(a => compact({
		id: a.id, title: a.name, subtitle: `${a.timeframe} · ${a.instruments.join(', ')}`, body: a.description, badge: a.usesForecast ? 'TimesFM' : '', route: { screen: 'agent', id: a.id } })) }] };
}

// ---------------------------------------------------------------- trades (shared by agent and run screens)

/** A paper trade or an open position, with its Capital demo twin when the run was mirrored. */
interface TradeItem {
	runId: string; epic: string; leverage: number | null; key: string; stage: 'virtual' | 'capital' | 'backtest';
	side: string; size: number; entryTime: number; exitTime: number | null; entryPrice: number | null; exitPrice: number | null;
	pnl: number | null; entryEquity: number | null; reason: string; close: string; demo: Deal | null; spark: (number | null)[] | null; stop?: number | null;
}
const exitLabels: Record<string, string> = { session_end: 'Scheduled close', signal: 'Agent close signal', stop_loss: 'Stop loss', take_profit: 'Take profit', trailing_stop: 'Trailing stop', margin_call: 'Margin close-out', busted: 'Account protection', reverse: 'Direction reversed', deadline: 'Scheduled exit' };

/** Pairs each paper trade with the demo deal of the same paper fill; demo deals with no paper trade stand alone. */
export function runTrades(run: RunDetail, sparks: Sparks | null): TradeItem[] {
	const deals = (run.deals as (Deal & Json)[]).filter(d => d.status !== 'failed' && d.account?.startsWith('Arena'));
	const byFill = new Map(deals.filter(d => d.virtual_fill_time).map(d => [`${d.virtual_fill_time}|${d.side}`, d]));
	const tSpark = new Map(sparks?.trades ?? []), dSpark = new Map(sparks?.deals ?? []);
	const stage = run.kind === 'backtest' ? 'backtest' : 'virtual';
	const sorted = [...run.trades].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
	const complete = sorted.length > 0 && sorted[0]!.index === 0 && sorted.length >= (run.metrics?.trades ?? 0);
	let equity = run.capital;
	const used = new Set<number>(), out: TradeItem[] = [];
	for (const t of sorted) {
		const demo = byFill.get(`${t.entryTime}|${t.side}`) ?? null;
		if (demo) used.add(demo.id);
		out.push({ runId: run.id, epic: run.epic, leverage: run.leverage, key: String(t.index ?? ''), stage, side: t.side, size: t.size, entryTime: t.entryTime, exitTime: t.exitTime,
			entryPrice: t.entryPrice, exitPrice: t.exitPrice, pnl: t.pnl, entryEquity: complete ? equity : null, reason: t.entryReason ?? '', close: t.exitNote || exitLabels[t.exitReason] || t.exitReason,
			demo, spark: tSpark.get(String(t.index)) ?? null });
		equity += t.pnl;
	}
	const p = run.position;
	if (p && stage === 'virtual') {
		const demo = byFill.get(`${p.entryTime}|${p.side}`) ?? null;
		if (demo) used.add(demo.id);
		out.push({ runId: run.id, epic: run.epic, leverage: run.leverage, key: 'open', stage, side: p.side, size: p.size, entryTime: p.entryTime, exitTime: null, entryPrice: p.entryPrice, exitPrice: null,
			pnl: (run.evidence as AgentEvidence | undefined)?.unrealizedPnl ?? null, entryEquity: run.equity, reason: (p as Json).entryReason ?? '', close: 'Open', demo, spark: sparks?.open ?? null, stop: p.stopLoss });
	}
	for (const d of deals) if (!used.has(d.id) && d.open_price != null)
		out.push({ runId: run.id, epic: run.epic, leverage: run.leverage, key: String(d.id), stage: 'capital', side: d.side, size: d.size, entryTime: d.confirmed_time ?? d.open_time,
			exitTime: d.status === 'closed' ? d.close_time : null, entryPrice: d.open_price, exitPrice: d.close_price, pnl: null, entryEquity: null, reason: '', close: d.note ?? '', demo: d, spark: dSpark.get(String(d.id)) ?? null });
	return out.sort((a, b) => b.entryTime - a.entryTime);
}

function sparkGraph(t: TradeItem): Graph | undefined {
	const values = t.spark?.map(v => v ?? NaN) ?? [];
	if (values.filter(Number.isFinite).length < 2) return undefined;
	const through = t.exitTime ?? Date.now(), markers: Marker[] = [];
	if (t.entryPrice != null) markers.push({ t: t.entryTime, value: t.entryPrice, label: '' });
	if (t.exitTime && t.exitPrice != null) markers.push({ t: t.exitTime, value: t.exitPrice, label: '', tone: tone((t.side === 'long' ? 1 : -1) * (t.exitPrice - (t.entryPrice ?? t.exitPrice))) });
	return compact({ kind: 'spark' as const, height: 64, precision: precisionFor(t.epic), from: t.entryTime, through, series: [{ name: 'Price', v: f32(values) }], markers,
		guides: t.stop ? [{ label: 'Stop', value: t.stop, tone: -1 as const }] : [] });
}
export function tradeRow(t: TradeItem, withMarket: boolean): Row {
	const demoPnl = t.demo?.pnl ?? null, open = t.exitTime === null;
	const paper = t.stage === 'capital' ? null : t.pnl;
	const ret = paper != null && t.entryEquity ? paper / t.entryEquity : null;
	const head = [withMarket ? `${t.epic} ${tier(t.leverage)}` : '', t.side === 'long' ? 'Long' : 'Short', open ? 'open' : ''].filter(Boolean).join(' · ');
	const stats: Stat[] = t.stage === 'capital'
		? [{ label: 'Demo P&L', value: signedUsd(demoPnl), tone: tone(demoPnl) }, { label: 'Paper', value: 'No paper twin' }]
		: [{ label: open ? 'Paper open P&L' : 'Paper P&L', value: signedUsd(paper), tone: tone(paper) }, { label: 'Demo P&L', value: t.demo ? (t.demo.status === 'open' ? 'Open' : signedUsd(demoPnl)) : '—', tone: tone(demoPnl) }, { label: 'Of equity', value: pct(ret), tone: tone(ret) }];
	const when = `${moment(t.entryTime)} → ${open ? 'open' : t.exitTime && t.exitTime - t.entryTime < 86400000 ? clock(t.exitTime) : moment(t.exitTime)}${t.exitTime ? ' · ' + span(t.exitTime - t.entryTime) : ''}`;
	return compact({ id: `trade-${t.runId}-${t.stage}-${t.key}`, title: head, subtitle: when,
		body: [t.reason ? 'Open: ' + t.reason : '', t.close && !open ? 'Close: ' + t.close : ''].filter(Boolean).join('\n'),
		stats, chart: sparkGraph(t), route: { screen: 'trade', id: t.runId, stage: t.stage, version: t.key } });
}

// ---------------------------------------------------------------- agent

export interface AgentInputs { agent: AgentDetail; runs: RunDetail[]; sparks: Map<string, Sparks>; capital: Map<string, LeaderboardRow>; backtests?: Map<string, LeaderboardRow> }
/** "Virtual +167.72 pp vs T-bills · +177.22 pp vs hold": the lead over the safe floor and over holding outright. */
const versusHold = (b: Json | undefined, what = '') => (b?.status === 'matched' ? `${what}${overCash(b) != null ? pp(overCash(b)) + ' vs T-bills · ' : ''}${pp(b.excessReturn)} vs hold` : '');
export function agentScreen({ agent, runs, sparks, capital, backtests: board }: AgentInputs): Screen {
	const sections: Section[] = [];
	const records = runs.filter(live).sort((a, b) => a.epic.localeCompare(b.epic) || (a.leverage ?? 0) - (b.leverage ?? 0));
	if (records.length) sections.push({ title: 'Live records', rows: records.map(r => {
		const c = capital.get(r.id), cm = c?.metrics, m = r.metrics;
		return compact({ id: r.id, title: `${r.epic} · ${tier(r.leverage)}`, subtitle: `Virtual ${usd(r.equity)}${c ? ` · Demo ${c.mirrored ? 'mirrored' : 'past assignment'}` : ''} · since ${day(r.startedAt)}`,
			badge: (r.extra as Json | null)?.demoAdmission ? 'User experiment' : CONTROL_SLUGS.has(agent.slug) ? 'Control' : '',
			stats: [{ label: 'Virtual return', value: pct(m?.totalReturn), tone: tone(m?.totalReturn) }, { label: 'Demo return', value: cm ? pct(cm.totalReturn) : '—', tone: tone(cm?.totalReturn) }, { label: 'Closed trades', value: num(m?.trades, 0) }],
			body: [versusHold((r.evidence as Json | undefined)?.benchmark, 'Virtual '), versusHold((c?.evidence as Json | undefined)?.benchmark, 'Demo ')].filter(Boolean).join('\n'),
			route: runRoute(r.id) });
	}) });
	if (records.length >= 3) sections.push({ title: '', rows: [{ id: 'markets-chart', title: 'Virtual return by market', chart: { kind: 'bars', unit: '%', height: Math.max(120, records.length * 24 + 20),
		bars: records.map(r => ({ name: `${r.epic} ${tier(r.leverage)}`, value: (r.metrics?.totalReturn ?? 0) * 100, total: true })) } }] });
	const trades = records.flatMap(r => runTrades(r, sparks.get(r.id) ?? null)).sort((a, b) => b.entryTime - a.entryTime);
	const many = new Set(records.map(r => r.id)).size > 1;
	sections.push({ title: trades.length ? `Trades · ${trades.length}` : 'Trades', rows: trades.length ? trades.map(t => tradeRow(t, many)) : [{ id: 'no-trades', title: 'No trades yet' }] });
	const backtests = agent.runs.filter(r => r.kind === 'backtest' && r.status !== 'retired');
	if (backtests.length) sections.push({ title: 'Backtests', rows: backtests.map(r => rankingRow(board?.get(r.id) ? { ...board.get(r.id)!, name: r.epic } : summaryRow(r, agent), 'backtest')) });
	const archived = agent.runs.filter(r => r.status === 'retired' && !r.id.includes(':delay=') && !(r.kind === 'backtest' && r.codeHash === agent.codeHash));
	if (archived.length) sections.push({ title: 'Archived records', rows: archived.map(r => rankingRow(summaryRow(r, agent), r.kind === 'backtest' ? 'backtest' : 'virtual')) });
	sections.push({ title: '', rows: [{ id: 'source', title: 'Source and parameters', subtitle: agent.codeHash, route: { screen: 'source', id: agent.id, version: agent.codeHash } }] });
	return compact({ v: 2 as const, title: agent.name, subtitle: agent.description, sections });
}
const summaryRow = (r: RunSummary, agent: AgentDetail): Json => ({ ...r, name: r.epic, timeframe: agent.timeframe });

// ---------------------------------------------------------------- run

export interface RunInputs { run: RunDetail; agentName: string; capital: LeaderboardRow | null; excluded: boolean; comparison: RunSummary | null; sparks: Sparks | null; account: string | null; periods?: (BacktestPeriods | null)[] }
/** The record on the daily clock: its verdict, the t it has, the bars it needs and whether it agrees with its backtest. */
export function clockRow(row: LeaderboardRow, now = Date.now()): Row | null {
	const c = row.evidence?.clock, a = assess(row, now);
	if (!c || a.verdict === 'control' || a.verdict === 'retired') return null;
	const since = c.since > row.startedAt + 60_000 ? `Since its demotion from Capital demo on ${day(c.since)}; whole record t ${num(c.life.t)} over ${num(c.life.observations, 0)} weekdays` : '';
	return compact({ id: 'clock', title: `${verdictWord(a.verdict)} · daily t ${num(c.t)}`,
		subtitle: `${num(c.trades, 0)} ${c.trades === 1 ? 'trade' : 'trades'} · ${num(Math.floor(c.days), 0)} days · judged from ${LIFECYCLE.MIN_TRADES} trades and ${LIFECYCLE.MIN_DAYS} days`,
		stats: [{ label: `Daily t over ${num(c.observations, 0)} weekdays`, value: num(c.t), tone: tone(c.t) }, { label: 'Candidate at', value: num(LIFECYCLE.CANDIDATE_TSTAT) }, { label: `Confirmed at, ${num(c.trials, 0)} tried`, value: num(c.confirmAt) }],
		chart: c.confirmAt != null ? { kind: 'meter' as const, height: 18, meter: { value: c.life.t, limit: c.confirmAt, above: true } } : undefined,
		body: [barsLine(c), agreementLine(c), since].filter(Boolean).join('\n') });
}
/** The backtest's every period as long as the record has lived, with the record's own return drawn across them. */
export function frequencyRow(id: string, what: string, f: BacktestFrequency, p: BacktestPeriods | null | undefined): Row {
	const { well, count } = frequencySide(f), points = (p?.points ?? []).map(x => ({ t: x.t, value: x.ret * 100 }));
	const ym = (t: number) => new Date(t).toISOString().slice(0, 7);
	return compact({ id, title: `${what} ${pct(f.observed)} in ${daysText(f.days)}`,
		stats: [{ label: count ? `of ${f.periods} backtest periods this ${well ? 'good' : 'bad'}` : `this ${well ? 'good' : 'bad'} in ${f.periods} backtest periods`, value: count ? shareText(count, f.periods) : 'Never' },
			{ label: `Median ${daysText(f.days)}`, value: pct(p?.median) }, { label: well ? 'Best' : 'Worst', value: pct(well ? f.best : f.worst) }],
		chart: points.length > 1 ? { kind: 'line' as const, unit: '%', precision: 1, height: 180, series: [series(`Backtest ${f.days}-day return`, points)],
			guides: [{ label: `This record ${pct(f.observed)}`, value: f.observed * 100, tone: tone(f.observed) }] } : undefined,
		body: [`${num(count, 0)} of ${num(f.periods, 0)} periods of ${daysText(f.days)}${p ? ` in the ${ym(p.from)} → ${ym(p.through)} backtest` : ''}${f.independent < f.periods ? `; they overlap, ${num(f.independent, 0)} fit end to end` : ''}`,
			`Worst ${pct(f.worst)} · best ${pct(f.best)}`, winsLine(f)].filter(Boolean).join('\n') });
}
export function runScreen({ run, agentName, capital, excluded, comparison, sparks, account, periods = [] }: RunInputs): Screen {
	const historical = run.kind === 'backtest', m = run.metrics, e = run.evidence as AgentEvidence | undefined, extra = (run.extra ?? {}) as Json;
	const summary: Row[] = [compact({ id: 'virtual', title: historical ? `Backtest · ${run.windowId ?? ''}` : `Virtual · ${usd(run.equity)}`,
		subtitle: [tier(run.leverage), date(run.startedAt), count(m?.trades, 'closed trade', 'closed trades')].filter(Boolean).join(' · '),
		badge: extra.demoAdmission ? 'User experiment' : ['running', 'completed'].includes(run.status) ? '' : run.status,
		stats: worthStats('Return', m?.totalReturn, e?.benchmark as Json | undefined),
		body: [historical ? '' : clockLine({ ...run, runId: run.id, slug: run.agentId.split('/')[0]!, evidence: e } as unknown as LeaderboardRow), frequencyLine(e?.frequency), alternatives(e?.benchmark as Json | undefined), [afterInflation(e?.benchmark as Json | undefined) != null ? `After inflation ${pct(afterInflation(e?.benchmark as Json | undefined))}` : '',
			m ? `Sharpe ${num(m.sharpe)}` : '', `drawdown ${pct(m?.maxDrawdown ? -m.maxDrawdown : m?.maxDrawdown)}`].filter(Boolean).join(' · ')].filter(Boolean).join('\n') })];
	const deals = (run.deals as (Deal & Json)[]).filter(d => d.account?.startsWith('Arena') && d.status !== 'failed');
	if (!historical && (capital || deals.length)) {
		const cm = capital?.metrics, cash = deals.reduce((n, d) => n + (d.status === 'closed' ? (d.pnl ?? 0) : 0), 0);
		summary.push(compact({ id: 'capital', title: `Capital demo · ${signedUsd(cash)}`,
			subtitle: [capital?.mirrored ? `Mirrored on ${account ?? 'an Arena account'} at 0.2× size` : 'Not mirrored now · past deals', count(deals.filter(d => d.status === 'closed').length, 'closed deal', 'closed deals')].join(' · '),
			badge: excluded ? 'Excluded' : '',
			stats: worthStats('Cash return', cm?.totalReturn, (capital?.evidence as Json | undefined)?.benchmark),
			body: [frequencyLine(capital?.evidence?.frequency), ...((capital?.evidence as Json | undefined)?.benchmark?.status === 'matched' ? [`${alternatives((capital!.evidence as Json).benchmark)} since the first deal`,
				[afterInflation((capital!.evidence as Json).benchmark) != null ? `After inflation ${pct(afterInflation((capital!.evidence as Json).benchmark))}` : '', cm ? `Sharpe ${num(cm.sharpe)}` : '', `cash drawdown ${pct(cm?.maxDrawdown ? -cm.maxDrawdown : cm?.maxDrawdown)}`].filter(Boolean).join(' · ')] : [])].filter(Boolean).join('\n') }));
	}
	if (extra.retirement) summary.push({ id: 'retirement', title: 'Retired', subtitle: date(extra.retirement.at), body: extra.retirement.reason });
	const sections: Section[] = [{ title: '', rows: summary }];
	const charts: Row[] = [];
	const curve = run.equityCurve.map(p => ({ t: p.t, value: p.equity }));
	if (curve.length > 1) {
		let peak = run.capital;
		charts.push({ id: 'equity', title: historical ? 'Equity · daily' : 'Virtual equity · hourly', chart: { kind: 'line', height: 200, series: [series('Equity', curve)] } });
		charts.push({ id: 'drawdown', title: 'Drawdown', chart: { kind: 'line', unit: '%', height: 110, series: [series('Drawdown', curve.map(p => { peak = Math.max(peak, p.value); return { t: p.t, value: peak > 0 ? (p.value / peak - 1) * 100 : 0 }; }))] } });
	}
	const priced = deals.filter(d => d.status === 'closed' && d.pnl != null && d.close_time).sort((a, b) => a.close_time! - b.close_time!);
	if (priced.length) { let cash = 0; charts.push({ id: 'cash', title: 'Capital demo closed P&L', chart: { kind: 'line', height: 140, series: [series('P&L', priced.map(d => ({ t: d.close_time!, value: (cash += d.pnl!) })))] } }); }
	if (charts.length) sections.push({ title: '', rows: charts });
	const judged = historical ? null : clockRow({ ...run, runId: run.id, slug: run.agentId.split('/')[0]!, evidence: e } as unknown as LeaderboardRow);
	if (judged) sections.push({ title: 'Edge or luck', rows: [judged] });
	const often = ([['frequency-virtual', 'Virtual', e?.frequency], ['frequency-capital', 'Capital demo', capital?.evidence?.frequency]] as const)
		.flatMap(([id, what, f]) => (f ? [frequencyRow(id, what, f, periods.find(p => p?.runId === f.runId && p.days === f.days))] : []));
	if (often.length) sections.push({ title: 'How often its backtest did this', rows: often });
	const trades = runTrades(run, sparks);
	sections.push({ title: trades.length ? `Trades · ${trades.length}` : 'Trades', rows: trades.length ? trades.map(t => tradeRow(t, false)) : [{ id: 'no-trades', title: 'No trades yet' }] });
	if (m?.monthly?.length) sections.push({ title: '', rows: [{ id: 'monthly', title: 'Monthly return', chart: { kind: 'bars', unit: '%', height: Math.max(120, m.monthly.length * 24 + 20), bars: m.monthly.map(x => ({ name: x.month, value: x.ret * 100, total: true })) } }] });
	const b = e?.benchmark as Json | undefined;
	if (b?.status === 'matched') sections.push({ title: 'Same dates, other uses of the money', rows: [{ id: 'benchmark', title: `${day(b.from)} → ${day(b.through)}`,
		stats: [{ label: 'Strategy', value: pct(b.strategyReturn) }, { label: '1:1 hold', value: pct(b.benchmarkReturn) }, { label: 'vs hold', value: pp(b.excessReturn), tone: tone(b.excessReturn) }],
		body: holdParts(b) },
		...(b.hurdles ? [hurdlesRow(b)] : [])] });
	if (comparison) sections.push({ title: 'Same-code backtest', rows: [rankingRow({ ...comparison, name: 'Backtest' }, 'backtest')] });
	sections.push(...evidenceSections(e));
	if (!historical && run.status !== 'retired' && !run.id.includes(':delay='))
		sections.push({ title: 'Demo control', rows: [{ id: 'exclude', title: excluded ? 'Allow this strategy on Capital demo' : 'Exclude this strategy from Capital demo', action: `exclude:${excluded ? 'false' : 'true'}:${run.id}` }] });
	sections.push({ title: '', rows: [{ id: 'params', title: 'Parameters', body: Object.entries(run.params).map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join('\n'), code: true }] });
	return compact({ v: 2 as const, title: `${run.epic} · ${tier(run.leverage)}`, subtitle: agentName, sections });
}
/** Treasury bills (the safe alternative) and CPI (what idle dollars lost) over the comparison's dates. */
export function hurdlesRow(b: Json): Row {
	const h: Json = b.hurdles, real = afterInflation(b)!, holdReal = (1 + b.benchmarkReturn) / (1 + h.inflation) - 1;
	return { id: 'hurdles', title: 'Treasury bills and inflation',
		stats: [{ label: 'T-bills', value: pct(h.cash) }, { label: 'Inflation', value: pct(h.inflation) }, { label: 'After inflation', value: pct(real), tone: tone(real) }],
		body: `${pp(b.strategyReturn - h.cash)} over T-bills · hold after inflation ${pct(holdReal)} · T-bills after inflation ${pct((1 + h.cash) / (1 + h.inflation) - 1)}\n` +
			`T-bills: 3-month US Treasury bills rolled daily, rates through ${day(h.billsThrough)}; Sharpe measures returns above them. Inflation: US CPI-U through ${month(h.cpiThrough)}${h.estimated ? '; later weeks continue its 12-month pace' : ''}.` };
}
const month = (ym: string) => { const [y, m] = ym.split('-').map(Number); return y && m ? new Date(Date.UTC(y, m - 1, 15)).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ym; };
export function evidenceSections(e: AgentEvidence | undefined): Section[] {
	if (!e) return [];
	const out: Section[] = [], c = e.costs as Json | null, d = e.dependency as Json | undefined;
	if (d && d.state !== 'available') out.push({ title: 'Forecast dependency', rows: [{ id: 'dependency', title: d.state === 'user-paused' ? 'TimesFM paused by resource hold' : 'TimesFM unavailable', body: `${d.note ?? ''} Known downtime is excluded from virtual maturity.` }] });
	if (e.openPosition) out.push({ title: 'Open risk', rows: [{ id: 'exposure', title: `Actual sizing · ${e.admission.replaceAll('-', ' ')}`,
		stats: [{ label: 'Exposure', value: e.exposure != null ? num(e.exposure) + '×' : '—' }, { label: 'Stop downside', value: pct(e.stopRisk) }, { label: 'Open P&L', value: signedUsd(e.unrealizedPnl), tone: tone(e.unrealizedPnl) }] }] });
	if (!c) return out;
	const rows: Row[] = [{ id: 'totals', title: 'Closed-trade accounting', stats: [{ label: 'Before funding', value: signedUsd(c.beforeFundingPnl) }, { label: 'Funding', value: signedUsd(c.closedFunding) }, { label: 'Net', value: signedUsd(c.closedNetPnl), tone: tone(c.closedNetPnl) }] },
		{ id: 'coverage', title: `${num(c.measuredTrades, 0)}/${num(c.closedTrades, 0)} quote-supported trades`, body: `${num(c.capturedTrades, 0)} at-fill references · ${num(c.reconstructedTrades, 0)} archived quote matches. Missing costs are unknown, not zero.` }];
	if (c.historyComplete === false) rows.push({ id: 'partial', title: 'Stored history is a subset', body: `${num(c.closedTrades, 0)} stored of ${num(c.reportedTrades, 0)} reported trades. Totals cover stored trades.` });
	if ((c.measuredTrades ?? 0) > 0) rows.push({ id: 'decomposition', title: 'Quote-supported subset', stats: [{ label: 'Midpoint', value: signedUsd(c.midpointPnl) }, { label: 'Spread', value: usd(c.spreadCost) }, { label: 'Net', value: signedUsd(c.measuredNetPnl), tone: tone(c.measuredNetPnl) }] });
	out.push({ title: e.basis === 'historical-equity' ? 'Historical simulation costs' : 'Execution costs', rows });
	return out;
}

// ---------------------------------------------------------------- trade

const toneOfSide = (side: string, from: number, to: number) => tone((side === 'long' ? 1 : -1) * (to - from));
/** Price lines for the trade chart: the stop, and where the trade would lose 50% / 100% of its entry equity. */
export function riskGuides(side: string, entry: number, size: number, equity: number | null, stop: number | null, low: number, high: number, precision = 2): { guides: Guide[]; far: Stat[] } {
	const sign = side === 'long' ? 1 : -1, range = Math.max(high - low, entry * 0.0005), guides: Guide[] = [], far: Stat[] = [];
	const near = (level: number) => Math.abs(level - entry) <= Math.max(range * 3, Math.abs(entry - (sign > 0 ? low : high)) * 1.5);
	const add = (label: string, level: number, t: -1 | 0) => {
		if (!(level > 0) || !Number.isFinite(level)) return;
		const away = `${num(Math.abs(level / entry - 1) * 100)}% away`;
		if (near(level)) guides.push({ label: `${label} ${num(level, precision)}`, value: level, tone: t });
		else far.push({ label, value: `${num(level, precision)} · ${away}` });
	};
	const half = equity && size > 0 ? entry - sign * 0.5 * equity / size : null, whole = equity && size > 0 ? entry - sign * equity / size : null;
	// A stop placed at the 50% loss budget is one line, not two.
	const same = (a: number | null, b: number | null) => a != null && b != null && Math.abs(a - b) <= Math.abs(entry - b) * 0.05;
	if (stop) add(same(stop, half) ? 'Stop · −50% of equity' : same(stop, whole) ? 'Stop · −100% of equity' : 'Stop', stop, -1);
	if (half != null && !same(stop, half)) add('−50% of equity', half, -1);
	if (whole != null && !same(stop, whole)) add('−100% of equity', whole, -1);
	return { guides, far };
}
export function tradeScreen(d: Inspection, agentName: string): Screen {
	const s = d.subject, c = d.costs, risk = d.risk, twin = s.twin, prec = precisionFor(s.epic), sign = s.side === 'long' ? 1 : -1;
	const paper = s.stage === 'capital' ? twin : null, demo = s.stage === 'capital' ? null : twin;
	const paperPnl = s.stage === 'capital' ? paper?.pnl ?? null : s.pnl, demoPnl = s.stage === 'capital' ? s.pnl : demo?.pnl ?? null;
	const sections: Section[] = [];
	const head: Row = compact({ id: 'head', title: `${s.side === 'long' ? 'Long' : 'Short'} · ${num(s.size, 3)} units`, subtitle: `${moment(s.entryTime)} → ${s.exitTime ? moment(s.exitTime) : 'open'}${s.exitTime ? ' · ' + span(s.exitTime - s.entryTime) : ''}`,
		badge: d.coverage.complete ? '' : 'Tick gaps', badgeTone: 0 as const,
		stats: [{ label: 'Paper P&L', value: signedUsd(paperPnl), tone: tone(paperPnl) }, { label: s.stage === 'capital' ? 'Demo P&L' : 'Demo P&L (0.2×)', value: twin || s.stage === 'capital' ? signedUsd(demoPnl) : 'Not mirrored', tone: tone(demoPnl) },
			{ label: risk.fullTrade ? 'Worst adverse' : 'Observed adverse', value: signedUsd(risk.mae), tone: tone(risk.mae) }],
		body: [`Open: ${s.entryReason ?? 'reason not recorded'}`, `Close: ${s.exitTime ? (s.exitReason ?? 'reason not recorded') : 'still open'}`].join('\n') });
	sections.push({ title: '', rows: [head] });
	// The setup: the strategy's own charts (for the night rule: the NY session, then 22:00 → 03:27).
	const panels: Row[] = [];
	for (const [i, p] of (d.strategy?.panels ?? []).entries()) {
		const title = p.title.replace('Previous New York session', 'Previous NY session').replace(' reference → 03:27 decision', ' → 03:27');
		if (!p.series.some(x => x.points.length)) { panels.push({ id: `panel-${i}`, title, body: p.guides.map(g => `${g.label}: ${num(g.value)}`).join('\n') }); continue; }
		const precision = p.unit === 'Price' && p.guides.some(g => Math.abs(g.value) < 10) ? 5 : 2;
		panels.push(compact({ id: `panel-${i}`, title, badge: i === 0 && d.strategy?.basis === 'reconstructed' ? 'Recomputed' : '', badgeTone: 0 as const,
			chart: compact({ kind: 'line' as const, unit: p.unit, precision, height: 220, from: p.from, through: p.through, series: p.series.map(x => series(x.name, x.points)),
				markers: p.markers.map(m => ({ t: m.t, value: m.value, label: m.label })), guides: p.guides.map(g => ({ label: g.label, value: g.value })), candles: p.candles?.length ? packCandles(p.candles) : undefined }) }));
	}
	// The trade itself: price with both fills and the lines where the stop and the equity losses sit.
	const bid = d.price.bid, ask = d.price.ask, values = [...bid, ...ask].map(p => p.value).concat(d.price.candles.flatMap(x => [x.low, x.high]));
	const low = values.length ? Math.min(...values) : s.entryPrice, high = values.length ? Math.max(...values) : s.entryPrice;
	const stop = s.stopLoss ?? d.strategy?.protections.stopLoss ?? null, target = s.takeProfit ?? d.strategy?.protections.takeProfit ?? null;
	const { guides, far } = riskGuides(s.side, s.entryPrice, s.size, s.entryEquity, stop, low, high, prec);
	if (target) guides.push({ label: `Target ${num(target, prec)}`, value: target, tone: 1 });
	const markers: Marker[] = [{ t: s.entryTime, value: s.entryPrice, label: s.stage === 'capital' ? 'DEMO OPEN' : 'OPEN', detail: s.entryReason ?? '' }];
	if (s.exitTime) markers.push({ t: s.exitTime, value: s.exitPrice, label: s.stage === 'capital' ? 'DEMO CLOSE' : 'CLOSE', detail: s.exitReason ?? '', tone: s.exitPrice != null ? toneOfSide(s.side, s.entryPrice, s.exitPrice) : 0 });
	if (twin && twin.entryPrice != null) markers.push({ t: twin.entryTime, value: twin.entryPrice, label: twin.stage === 'capital' ? 'DEMO OPEN' : 'OPEN' });
	if (twin?.exitTime) markers.push({ t: twin.exitTime, value: twin.exitPrice, label: twin.stage === 'capital' ? 'DEMO CLOSE' : 'CLOSE', detail: twin.exitPrice == null ? 'Close price not recorded (closed by Capital)' : '' });
	const from = Math.min(d.window.from, twin?.entryTime ?? Infinity), through = Math.max(d.window.through, twin?.exitTime ?? -Infinity);
	const tradeChart: Graph = compact({ kind: 'price' as const, unit: 'Price', precision: prec, height: 280, from, through,
		series: [series('Bid', bid, 600), series('Ask', ask, 600)], candles: d.price.candles.length ? packCandles(d.price.candles) : undefined, gaps: d.coverage.gaps, markers, guides });
	panels.push(compact({ id: 'trade-chart', title: `Trade · ${clock(s.entryTime)} → ${s.exitTime ? clock(s.exitTime) : 'now'}`, chart: tradeChart,
		stats: far.slice(0, 3) }));
	sections.push({ title: '', rows: panels });
	const notional = s.size * s.entryPrice;
	sections.push({ title: 'Sizing', rows: [{ id: 'sizing', title: `${s.epic} · ${tier(s.leverage)} · ${agentName}`, stats: [{ label: 'Notional', value: usd(notional) }, { label: 'Entry equity', value: usd(s.entryEquity) }, { label: 'Exposure', value: s.entryEquity ? num(notional / s.entryEquity) + '×' : '—' }] },
		{ id: 'risk', title: 'Price path', stats: [{ label: risk.fullTrade ? 'Max decline' : 'Observed decline', value: risk.maxDrawdown == null ? '—' : (risk.fullTrade ? '' : '≥') + signedUsd(-risk.maxDrawdown), tone: tone(-(risk.maxDrawdown ?? 0)) }, { label: 'Best favorable', value: signedUsd(risk.mfe), tone: tone(risk.mfe) }, { label: 'Decline of equity', value: risk.drawdownFraction == null ? '—' : pct(-risk.drawdownFraction), tone: -1 }] }] });
	const gates = gateRows(d.strategy?.gates ?? []);
	if (gates.length) sections.push({ title: 'Entry limits', rows: gates });
	const costs: Row[] = [{ id: 'costs', title: 'Costs', stats: [{ label: 'Spread cost', value: usd(c.spread) }, { label: 'Funding', value: signedUsd(c.funding) }, { label: 'Timing', value: signedUsd(c.timing) }] }];
	if (c.midpoint != null && c.spread != null && c.net != null) costs.push({ id: 'waterfall', title: 'Signal → net', chart: { kind: 'waterfall', height: 200, bars: [
		...(c.timing != null ? [{ name: 'Signal', value: c.midpoint + c.timing, total: true }, { name: 'Timing', value: -c.timing }] : [{ name: 'Midpoint', value: c.midpoint, total: true }]),
		{ name: 'Spread', value: -c.spread }, { name: 'Funding', value: c.funding ?? 0 }, { name: 'Adjust', value: c.adjustment ?? 0 }, { name: 'Net', value: c.net, total: true }] } });
	if (d.spread.length > 1) costs.push({ id: 'spread', title: 'Bid–ask spread', chart: compact({ kind: 'line' as const, unit: 'Points', precision: prec, height: 100, from: d.window.from, through: d.window.through, series: [series('Spread', d.spread, 300)], gaps: d.coverage.gaps }) });
	sections.push({ title: '', rows: costs });
	const timeline = s.stage === 'capital' ? s.timeline : twin?.timeline ?? [];
	if (timeline.length > 2) { const first = Math.min(...timeline.map(t => t.t)); sections.push({ title: 'Capital order timing', rows: [...timeline].sort((a, b) => a.t - b.t).map((t, i) => ({ id: `timing-${i}`, title: t.label, subtitle: t.t - first < 60000 ? `+${num((t.t - first) / 1000, 3)} s · ${moment(t.t)}` : moment(t.t) })) }); }
	const gaps: Row[] = [];
	if (!d.coverage.complete) gaps.push(compact({ id: 'coverage', title: `${num(d.coverage.ticks, 0)} quotes · ${num(d.coverage.candles, 0)} candles`, badge: d.window.clipped ? 'Last 7 days' : d.coverage.limited ? 'Partial' : '', badgeTone: 0 as const }));
	for (const g of d.coverage.gaps) gaps.push({ id: `gap-${g.from}`, title: 'Tick gap', subtitle: `${moment(g.from)} → ${moment(g.through)}` });
	if (gaps.length) sections.push({ title: '', rows: gaps });
	if (d.strategy?.exitRule) sections.push({ title: '', rows: [{ id: 'exit-rule', title: 'Exit rule', body: d.strategy.exitRule + (d.strategy.note ? `\n${d.strategy.note}` : '') }] });
	return compact({ v: 2 as const, title: `${s.epic} · ${s.side === 'long' ? 'Long' : 'Short'}`, subtitle: s.stage === 'capital' ? 'Capital demo deal' : s.stage === 'backtest' ? 'Backtest trade' : 'Paper trade', sections });
}
const REDUNDANT = new Set(['15-minute checkpoints', 'Session direction', 'Calendar allows entry', 'Entry clock', 'Weekday entry', 'Reference belongs to previous day']);
export function gateNumber(n: number | null, unit: string): string {
	if (n == null || !Number.isFinite(n)) return 'Unknown';
	if (unit === 'yes/no') return n === 1 ? 'Yes' : 'No';
	if (unit === 'direction') return n > 0 ? 'Bullish' : n < 0 ? 'Bearish' : 'Unqualified';
	if (unit === 'minute of day') return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
	if (unit === 'Sunday = 0') return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][Math.min(6, Math.max(0, n))]!;
	if (unit === 'fraction') return gateNumber(n * 100, '%');
	const digits = Math.abs(n) > 0 && Math.abs(n) < 0.01 ? 6 : unit === 'Price' && Math.abs(n) < 10 ? 5 : unit === 'Price' ? 2 : 3;
	return n.toLocaleString('en-US', { maximumFractionDigits: digits }) + (!unit || unit === 'Price' ? '' : ' ' + unit);
}
export function gateRows(gates: NonNullable<Inspection['strategy']>['gates']): Row[] {
	return gates.flatMap((g, i) => {
		if (g.state === 'pass' && REDUNDANT.has(g.label)) return [];
		const unit = g.label === 'Session direction' ? 'direction' : g.unit;
		const delta = g.margin == null ? '—' : (g.margin > 0 ? '+' : '') + gateNumber(unit === 'fraction' ? g.margin * 100 : g.margin, unit === '%' || unit === 'fraction' ? 'pp' : unit === 'minute of day' ? 'minutes' : unit) + (unit === 'Price' ? ' points' : '');
		return [compact({ id: `gate-${i}`, title: g.label, subtitle: `${gateNumber(g.value, unit)} ${g.op} ${gateNumber(g.limit, unit)}${g.op === '=' ? '' : ' · Δ ' + delta}`,
			badge: g.state === 'fail' ? 'Outside' : '', badgeTone: -1 as const, body: g.note ?? '',
			chart: g.op !== '=' && g.value != null && g.limit != null ? { kind: 'meter' as const, height: 18, meter: { value: g.value, limit: g.limit, above: g.op === '>' || g.op === '>=', price: unit === 'Price' } } : undefined })];
	});
}

// ---------------------------------------------------------------- accounts, status and documents

export function accountsScreen(b: Json): Screen {
	const s = b.status ?? {};
	return { v: 2, title: 'Accounts', subtitle: 'Capital demo only · Arena 01–09', sections: [
		{ title: 'Broker mirror', rows: [{ id: 'mirror', title: s.enabled ? 'Demo orders enabled' : 'Demo orders paused', subtitle: `${num(s.coverage?.mirrored, 0)} assigned · queue ${num(s.queued?.length ?? s.queued, 0)}`, action: s.enabled ? 'mirror:off' : 'mirror:on' }] },
		{ title: 'Nine leverage tiers', rows: (s.accounts ?? []).map((a: Json) => compact({ id: a.id, title: a.name, subtitle: `${tier(a.leverage)} · ${a.runs.length}/${num(a.slots, 0)} slots`, badge: a.killed ? 'Kill switch' : '', badgeTone: -1 as const,
			stats: [{ label: 'Equity', value: usd(a.equity) }, { label: 'Balance', value: usd(a.balance) }, { label: 'Open deals', value: num(a.openDeals, 0) }], route: { screen: 'account', id: a.id } })) }] };
}
export function accountScreen(b: Json, id: string, names: Map<string, string>): Screen {
	const a = (b.status?.accounts ?? []).find((x: Json) => x.id === id) ?? { name: 'Account', runs: [] };
	const deals = (b.deals ?? []).filter((d: Json) => d.account_id === id);
	return { v: 2, title: a.name, subtitle: `${tier(a.leverage)} · Capital demo account`, sections: [
		{ title: '', rows: [{ id: 'equity', title: `Equity ${usd(a.equity)}`, stats: [{ label: 'Balance', value: usd(a.balance) }, { label: 'Open deals', value: num(a.openDeals, 0) }, { label: 'Slots', value: `${a.runs.length}/${num(a.slots, 0)}` }] }] },
		{ title: `Assigned strategies · ${a.runs.length}`, rows: a.runs.map((r: string) => ({ id: r, title: names.get(r.split(':')[1] ?? '') ?? r.split(':')[1] ?? r, subtitle: r.split(':')[2] ?? '', route: runRoute(r) })) },
		{ title: 'Recent deals', rows: deals.map((d: Json) => compact({ id: `deal-${d.id}`, title: `${d.epic} · ${d.side === 'long' ? 'Long' : 'Short'} · ${signedUsd(d.pnl)}`, subtitle: `${d.status} · ${moment(d.close_time ?? d.open_time)}`, body: d.note ?? '', route: { screen: 'trade', id: d.run_id, stage: 'capital', version: String(d.id) } })) }] };
}
export function statusScreen(data: Json): Screen {
	const s = data.status ?? {}, e = data.execution ?? {}, ticks = s.ticks ?? {}, storage = s.tickStorage ?? {};
	return { v: 2, title: 'Platform status', subtitle: s.stream?.connected ? 'Live Capital feed connected' : 'Feed reconnecting', sections: [
		{ title: 'Execution', rows: [{ id: 'health', title: `${num(s.demoRuns, 0)} virtual records`, stats: [{ label: 'Memory', value: `${num(s.memoryMb, 0)} MB` }, { label: 'CPU / core', value: `${num(e.virtual?.cpuCorePercent, 0)}%` }, { label: 'Pending', value: num(e.virtual?.pending, 0) }] },
			{ id: 'parity', title: 'Demo execution', stats: [{ label: 'HTTP p95', value: `${num(e.network?.requestP95Ms, 0)} ms` }, { label: 'Missing closes', value: num(e.parity?.unpricedCloses, 0) }] }] },
		{ title: 'Model and storage', rows: [{ id: 'model', title: s.forecaster?.reachable ? 'TimesFM reachable' : data.heavyResourcesPaused ? 'TimesFM paused by user' : 'TimesFM offline' },
			{ id: 'ticks', title: `${num(ticks.acknowledged, 0)} quotes archived`, subtitle: `${num(ticks.lostTicks, 0)} dropped received quotes · one compressed archive`, stats: [{ label: 'Project', value: `${num((storage.totalBytes ?? NaN) / 1e9, 1)} GB` }, { label: '2y stress', value: `${num((storage.stressTwoYearBytes ?? NaN) / 1e9, 1)} GB` }, { label: 'Budget', value: '100 GB' }] }] },
		{ title: 'Research evidence', rows: [{ id: 'evidence', title: `${num(data.evidence?.strategyVariants, 0)} strategy variants`, stats: [{ label: 'Quote-supported', value: num(data.evidence?.measuredTrades, 0) }, { label: 'Stored trades', value: num(data.evidence?.storedTrades, 0) }] }] },
		{ title: 'Recent events', rows: (data.events ?? []).slice(0, 40).map((v: Json, i: number) => compact({ id: `event${i}`, title: v.source, subtitle: date(v.time), body: v.message, badge: v.level === 'info' ? '' : v.level, badgeTone: v.level === 'error' ? -1 as const : 0 as const })) }] };
}
export function scenariosScreen(scenarios: { name: string; count: number }[]): Screen {
	return { v: 2, title: 'Execution comparisons', sections: [{ title: 'Virtual cohorts', rows: [...scenarios].sort((a, b) => a.name.localeCompare(b.name)).map(s => ({ id: s.name, title: s.name, subtitle: `${num(s.count, 0)} virtual records`, route: { screen: 'rankings', stage: 'virtual', scenario: s.name } })) }] };
}
export function graveyardScreen(entries: GraveyardEntry[], platform: { name: string; date: string; description: string }[]): Screen {
	return { v: 2, title: 'Graveyard', sections: [
		{ title: 'Platform history', rows: platform.map((m, i) => ({ id: `platform${i}`, title: m.name, subtitle: m.date, body: m.description })) },
		{ title: `${entries.length} archived versions`, rows: entries.map(e => compact({ id: e.key, title: e.name, subtitle: `${e.codeHash} · ${e.runs.length} forward records`, body: e.runs[0]?.reason ?? '', badge: e.category[0]!.toUpperCase() + e.category.slice(1), route: { screen: 'archive', id: e.key } })) }] };
}
export function archiveScreen(entries: GraveyardEntry[], key: string): Screen {
	const e = entries.find(x => x.key === key);
	if (!e) return { v: 2, title: 'Archived version', sections: [] };
	const row = (r: Json, stage: string) => { const x = rankingRow({ ...r, name: r.epic, timeframe: '' }, stage); return compact({ ...x, body: r.reason ?? '' }); };
	return compact({ v: 2 as const, title: e.name, subtitle: `${e.codeHash} · retired ${date(e.endedAt)}`, sections: [
		...(e.hasSource ? [{ title: 'Preserved source', rows: [{ id: 'source', title: 'Read this exact version', subtitle: e.codeHash, route: { screen: 'source', id: e.agentId, version: e.codeHash } }] }] : []),
		{ title: 'Forward history', rows: e.runs.map(r => row(r, 'virtual')) }, { title: 'Backtest history', rows: e.backtests.map(r => row(r, 'backtest')) }].filter(s => s.rows.length) });
}
export function sourceScreen(agent: AgentDetail, version: string): Screen {
	const v = agent.versions.find(x => x.code_hash === version) ?? agent.versions[0];
	const lines = (v?.source ?? '').split('\n'), rows: Row[] = [];
	for (let i = 0; i < lines.length; i += 40) rows.push({ id: `code${i}`, title: `Lines ${i + 1}–${Math.min(i + 40, lines.length)}`, body: lines.slice(i, i + 40).join('\n'), code: true });
	return { v: 2, title: 'Source', subtitle: `${agent.name} · ${v?.code_hash ?? ''}`, sections: [{ title: 'Parameters', rows: [{ id: 'params', title: '', body: Object.entries(agent.params).map(([k, x]) => `${k}: ${JSON.stringify(x)}`).join('\n'), code: true }] }, { title: 'Preserved strategy code', rows }] };
}
/** Markdown as one section per heading, paragraphs as rows. */
export function markdownSections(text: string): Section[] {
	const sections: Section[] = [];
	let title = 'Overview', rows: Row[] = [], paragraph = '', index = 0;
	const flush = () => { if (paragraph.trim()) { rows.push({ id: `text${index++}`, title: '', body: paragraph.trim() }); } paragraph = ''; };
	for (const line of text.split('\n')) {
		if (line.startsWith('#')) { flush(); if (rows.length) sections.push({ title, rows }); rows = []; title = line.replace(/^#+\s*/, ''); }
		else if (!line.trim() || paragraph.length + line.length > 650) { flush(); paragraph = line; }
		else paragraph += (paragraph ? '\n' : '') + line;
	}
	flush(); if (rows.length) sections.push({ title, rows });
	return sections;
}
export function documentScreen(title: string, markdown: string, extra: Section[] = []): Screen {
	return { v: 2, title, sections: [...extra.filter(s => s.rows.length), ...markdownSections(markdown)] };
}
export function verdicts(rows: LeaderboardRow[], stage: string): RankingRow[] {
	const now = Date.now();
	return rows.map(r => ({ ...r, control: CONTROL_SLUGS.has(r.slug), forwardVerdict: stage === 'virtual' && !r.comparisonOnly ? assess(r, now).verdict : null }));
}
export type { Trade };
