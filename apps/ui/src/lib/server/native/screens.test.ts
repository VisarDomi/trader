import { expect, test } from 'bun:test';
import { riskGuides, runTrades, tradeRow, rankingRow, rankingsScreen, hurdlesRow, holdParts } from './screens';
import { thin, f32, f64 } from './wire';

const run: any = {
	id: 'demo:x:US100:x200:h', kind: 'demo', agentId: 'x', epic: 'US100', leverage: 200, capital: 10000, equity: 4944.55, startedAt: 1, metrics: { trades: 1 },
	trades: [{ index: 0, side: 'short', size: 66, entryTime: 1000, entryPrice: 27272.5, exitTime: 2000, exitPrice: 27349.1, pnl: -5055.45, funding: 0, exitReason: 'stop_loss', entryReason: 'bearish day', barsHeld: 11 }],
	deals: [
		{ id: 6706, account: 'Arena 09', status: 'closed', side: 'short', size: 13.2, open_time: 990, confirmed_time: 995, open_price: 27273.5, close_time: 2001, close_price: null, pnl: -997.84, virtual_fill_time: 1000 },
		{ id: 7000, account: 'Arena 09', status: 'closed', side: 'long', size: 1, open_time: 5000, open_price: 27000, close_time: 6000, close_price: 27010, pnl: 10 },
		{ id: 7001, account: 'Visi', status: 'closed', side: 'long', size: 1, open_time: 5000, open_price: 1, close_time: 6000, close_price: 1, pnl: 1 },
	],
	position: null, equityCurve: [], params: {}, extra: null, logs: [],
};
test('each paper trade carries the demo deal of its fill; unpaired Arena deals stand alone; other accounts never appear', () => {
	const t = runTrades(run, { epic: 'US100', points: 3, trades: [['0', [27272.5, 27300, 27349.1]]], deals: [], open: null });
	expect(t.map(x => [x.stage, x.key])).toEqual([['capital', '7000'], ['virtual', '0']]);
	const paired = t[1]!;
	expect(paired.demo?.id).toBe(6706);
	expect(paired.entryEquity).toBe(10000);
	const row = tradeRow(paired, false);
	expect(row.stats?.map(s => s.value)).toEqual(['−$5,055.45', '−$997.84', '−50.6%']);
	expect(row.chart?.kind).toBe('spark');
	expect(row.route).toEqual({ screen: 'trade', id: run.id, stage: 'virtual', version: '0' });
});
test('a stop at the 50% loss budget is one line; lines far from the trade become numbers instead', () => {
	// Short 66 units at 27,272.5 with $10,000: −50% of equity sits 75.76 points above entry.
	const near = riskGuides('short', 27272.5, 66, 10000, 27350, 27250, 27349.1);
	expect(near.guides.map(g => g.label)).toEqual(['Stop · −50% of equity 27,350.00', '−100% of equity 27,424.02']);
	// 1:20 long: the loss levels are percent away and must not flatten a 0.2% price path.
	const far = riskGuides('long', 7000, 25, 10000, null, 6990, 7015);
	expect(far.guides).toEqual([]);
	expect(far.far.map(s => s.label)).toEqual(['−50% of equity', '−100% of equity']);
});
test('rankings rows carry sort keys and the capital stage reads cash drawdown as a loss', () => {
	const row = rankingRow({ runId: 'demo:a', name: 'A', epic: 'US500', leverage: 20, status: 'running', mirrored: true, metrics: { totalReturn: 0.1, sharpe: 1, trades: 3, maxDrawdown: 0.05 } }, 'capital');
	expect(row.keys).toEqual([0.1, null, null, 1, 3]);
	expect(row.stats).toEqual([{ label: 'Return', value: '+10.0%', tone: 1 }, { label: 'vs T-bills', value: '—', tone: 0 }, { label: 'vs hold', value: '—', tone: 0 }]);
	expect(row.subtitle).toBe('US500 · 1:20 · 3 trades');
	expect(row.body).toBe('cash drawdown −5.0%');
	expect(rankingsScreen([], 'capital').sort).toEqual(['Return', 'vs T-bills', 'vs hold', 'Sharpe', 'Closed trades']);
});
test('every stage leads with the return over T-bills and over the outright hold, then the alternatives and after inflation', () => {
	const hurdles = { cash: 0.0021, inflation: 0.005, billsThrough: Date.UTC(2026, 10, 19), cpiThrough: '2026-10', estimated: true };
	const benchmark = { status: 'matched', strategyReturn: 1.681, benchmarkReturn: -0.083, excessReturn: 1.764, hurdles };
	const row = (stage: string, b: object) => rankingRow({ runId: 'demo:visar-night-trading:US500:x200:h', name: 'visar-night-trading', epic: 'US500', leverage: 200, status: 'running', mirrored: true,
		metrics: { totalReturn: 1.681, sharpe: 5.14, trades: 3, maxDrawdown: 0.354 }, evidence: { benchmark: b, exposure: 0 } }, stage);
	for (const stage of ['virtual', 'backtest', 'capital']) {
		const r = row(stage, benchmark);
		// At a glance: worth more than the safe floor (T-bills) and than holding the index outright.
		expect(r.stats).toEqual([{ label: 'Return', value: '+168.1%', tone: 1 }, { label: 'vs T-bills', value: '+167.89 pp', tone: 1 }, { label: 'vs hold', value: '+176.40 pp', tone: 1 }]);
		expect(r.keys).toEqual([1.681, 1.681 - 0.0021, 1.764, 5.14, 3]);
		// (1 + 168.1%) / (1 + 0.5%) − 1 = +166.8%: still gained purchasing power.
		expect(r.body).toBe('Hold −8.3% · T-bills +0.2% · inflation +0.5%\n' + (stage === 'capital' ? 'After inflation +166.8% · cash drawdown −35.4%' : 'After inflation +166.8% · Sharpe 5.14 · drawdown −35.4%'));
		expect(r.body).not.toContain('exposure');   // flat: no "Exposure 0.00×"
	}
	// Without stored rates the hold still shows.
	expect(row('virtual', { ...benchmark, hurdles: undefined }).body).toBe('Hold −8.3%\nSharpe 5.14 · drawdown −35.4%');
	const cash = hurdlesRow(benchmark);
	expect(cash.stats).toEqual([{ label: 'T-bills', value: '+0.2%' }, { label: 'Inflation', value: '+0.5%' }, { label: 'After inflation', value: '+166.8%', tone: 1 }]);
	expect(cash.body).toStartWith('+167.89 pp over T-bills · hold after inflation −8.8% · T-bills after inflation −0.3%\n');
	expect(cash.body).toContain('US CPI-U through Oct 2026; later weeks continue its 12-month pace.');
	const flat = rankingRow({ runId: 'demo:a', name: 'A', epic: 'GOLD', leverage: 1, status: 'running', mirrored: false, control: true, metrics: { totalReturn: -0.5, trades: 2, maxDrawdown: 0.6 }, evidence: { exposure: 1.2 } }, 'capital');
	expect(flat.badge).toBe('Control · past assignment');
	expect(flat.stats?.[2]).toEqual({ label: 'vs hold', value: '—', tone: 0 });
	expect(flat.body).toBe('cash drawdown −60.0% · exposure 1.20×');
	expect(holdParts({ hold: { price: -0.093, income: 0.002, kind: 'dividends', source: 'SPY dividends ×1' } })).toBe('Bought outright, no CFD fees: price −9.3% · SPY dividends ×1 +0.2%.');
	expect(holdParts({ hold: { price: -0.1, income: 0, kind: 'dividends', source: 'no SPY dividend in these dates' } })).toBe('Bought outright, no CFD fees: price −10.0% · no SPY dividend in these dates.');
	expect(holdParts({ hold: { price: 0.05, income: 0, kind: 'none', priceOnly: true } })).toBe('Bought outright, no CFD fees: price +5.0%. Nobody owns oil or gas outright, so this hold is an upper bound.');
});
test('thinning keeps extremes and packing round-trips', () => {
	const pts = Array.from({ length: 5000 }, (_, i) => ({ t: i, value: i === 2500 ? 99 : Math.sin(i / 50) }));
	const out = thin(pts, 200);
	expect(out.length).toBeLessThanOrEqual(200);
	expect(out.some(p => p.value === 99)).toBe(true);
	expect([...new Float64Array(Buffer.from(f64([1.5, 1794882420703]), 'base64').buffer.slice(0))].length).toBeGreaterThan(0);
	expect(new Float32Array(new Uint8Array(Buffer.from(f32([27272.5]), 'base64')).buffer)[0]).toBe(27272.5);
});
