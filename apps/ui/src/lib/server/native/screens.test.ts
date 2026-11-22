import { expect, test } from 'bun:test';
import { riskGuides, runTrades, tradeRow, rankingRow, rankingsScreen } from './screens';
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
	expect(row.keys).toEqual([0.1, 1, 3, null]);
	expect(row.stats?.[2]).toEqual({ label: 'Cash drawdown', value: '−5.0%' });
	expect(rankingsScreen([], 'capital').sort).toEqual(['Return', 'Sharpe', 'Closed trades']);
});
test('thinning keeps extremes and packing round-trips', () => {
	const pts = Array.from({ length: 5000 }, (_, i) => ({ t: i, value: i === 2500 ? 99 : Math.sin(i / 50) }));
	const out = thin(pts, 200);
	expect(out.length).toBeLessThanOrEqual(200);
	expect(out.some(p => p.value === 99)).toBe(true);
	expect([...new Float64Array(Buffer.from(f64([1.5, 1794882420703]), 'base64').buffer.slice(0))].length).toBeGreaterThan(0);
	expect(new Float32Array(new Uint8Array(Buffer.from(f32([27272.5]), 'base64')).buffer)[0]).toBe(27272.5);
});
