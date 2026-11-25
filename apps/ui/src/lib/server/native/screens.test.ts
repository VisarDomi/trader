import { expect, test } from 'bun:test';
import { riskGuides, runTrades, tradeRow, rankingRow, rankingsScreen, hurdlesRow, holdParts, frequencyRow, runScreen, clockRow, verdicts, familyRow, standingRow, agentScreen } from './screens';
import { agreementLine, barsLine, clockLine, standingLine, standingTitle } from '../../clock';
import { frequencyLine, winsLine } from '../../frequency';
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
	expect(row.body).toBe('Sharpe 1.00 · cash drawdown −5.0%');
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
		expect(r.body).toBe('Hold −8.3% · T-bills +0.2% · inflation +0.5%\n' + (stage === 'capital' ? 'After inflation +166.8% · Sharpe 5.14 · cash drawdown −35.4%' : 'After inflation +166.8% · Sharpe 5.14 · drawdown −35.4%'));
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
test('a record says how often its own backtest did this well or this badly, at a glance and in full on its screen', () => {
	// Three wins of three for +166.2% in 40 days; the backtest's best 40 days were +114.6%.
	const night = { runId: 'bt:2024-01_2026-09:visar-night-trading:US500:x200', days: 40, observed: 1.662, periods: 825, independent: 25, atLeast: 0, atMost: 825, best: 1.146, worst: -0.92,
		wins: { won: 3, trades: 3, rate: 0.4366, backtestTrades: 71, chance: 0.4366 ** 3 } };
	expect(frequencyLine(night)).toBe('Backtest never did this well in 40 days (825 periods)');
	expect(winsLine(night)).toBe("3 of 3 trades won; that many or more happen 8.3% of the time at the backtest's 43.7% win rate (71 trades)");
	const usual = { ...night, days: 48, observed: 0.112, periods: 817, atLeast: 134, atMost: 683, best: 0.281, worst: -0.116, wins: undefined };
	expect(frequencyLine(usual)).toBe('Backtest did this well in 16% of 48-day periods');
	expect(frequencyLine({ ...usual, observed: -0.1, atLeast: 800, atMost: 17 })).toBe('Backtest did this badly in 2.1% of 48-day periods');
	expect(frequencyLine({ ...usual, days: 1, atLeast: 0 })).toBe('Backtest never did this well in 1 day (817 periods)');
	expect(frequencyLine({ ...usual, periods: 5000, atLeast: 1, atMost: 4999 })).toBe('Backtest did this well in <0.1% of 48-day periods');
	expect(frequencyLine(undefined)).toBe('');
	// The ranking row leads with it, in every forward stage.
	const row = rankingRow({ runId: 'demo:a', name: 'A', epic: 'US500', leverage: 200, status: 'running', mirrored: true, metrics: { totalReturn: 1.662, sharpe: 9.27, trades: 3, maxDrawdown: 0 }, evidence: { frequency: night } }, 'capital');
	expect(row.body).toBe('Backtest never did this well in 40 days (825 periods)\nSharpe 9.27 · cash drawdown 0.0%');
	const periods = { runId: night.runId, days: 40, from: Date.UTC(2024, 0, 1), through: Date.UTC(2026, 8, 30), median: -0.16, points: [{ t: Date.UTC(2024, 1, 10), ret: -0.2 }, { t: Date.UTC(2024, 1, 11), ret: 1.146 }] };
	const detail = frequencyRow('frequency-capital', 'Capital demo', night, periods);
	expect(detail.title).toBe('Capital demo +166.2% in 40 days');
	expect(detail.stats).toEqual([{ label: 'this good in 825 backtest periods', value: 'Never' }, { label: 'Median 40 days', value: '−16.0%' }, { label: 'Best', value: '+114.6%' }]);
	expect(detail.chart).toMatchObject({ kind: 'line', unit: '%', height: 180, guides: [{ label: 'This record +166.2%', value: 166.2, tone: 1 }] });
	expect(detail.body).toBe("0 of 825 periods of 40 days in the 2024-01 → 2026-09 backtest; they overlap, 25 fit end to end\nWorst −92.0% · best +114.6%\n3 of 3 trades won; that many or more happen 8.3% of the time at the backtest's 43.7% win rate (71 trades)");
	// A loser reads its own side: the share of periods this bad, and the worst one.
	const bad = frequencyRow('frequency-virtual', 'Virtual', { ...usual, observed: -0.1, atLeast: 800, atMost: 17 }, null);
	expect(bad.stats?.map(s => [s.label, s.value])).toEqual([['of 817 backtest periods this bad', '2.1%'], ['Median 48 days', '—'], ['Worst', '−11.6%']]);
	expect(bad.chart).toBeUndefined();
	// The record's screen: the line on both summaries, then one row per stage before the trades.
	const screen = runScreen({ run: { ...run, evidence: { frequency: usual } }, agentName: 'X', capital: { runId: run.id, mirrored: true, metrics: { totalReturn: 1.662, sharpe: 9.27, maxDrawdown: 0 }, evidence: { frequency: night } } as any,
		excluded: false, comparison: null, sparks: null, account: 'Arena 09', periods: [periods, null] });
	expect(screen.sections[0]!.rows.map(r => r.body?.split('\n')[0])).toEqual(['Backtest did this well in 16% of 48-day periods', 'Backtest never did this well in 40 days (825 periods)']);
	const often = screen.sections.find(s => s.title === 'How often its backtest did this')!;
	expect(often.rows.map(r => [r.id, !!r.chart])).toEqual([['frequency-virtual', false], ['frequency-capital', true]]);
	expect(screen.sections.findIndex(s => s === often)).toBeLessThan(screen.sections.findIndex(s => s.title.startsWith('Trades')));
});
test('every forward row says where it stands on the daily clock, and the record screen what it would take', () => {
	const NOW = Date.UTC(2026, 10, 25);
	const clock = { since: NOW - 41 * 86400000, days: 40.8, trades: 3, observations: 29, t: 1.6307, monkey: 1.29, life: { observations: 29, t: 1.6307, e: 2.38 }, backtestZ: 1.88, trials: 844, confirmAt: 5.992, aloneAt: 3.713, confirmed: false };
	const row = (c: object = {}, extra: object = {}): any => ({ runId: 'demo:visar-night-trading:US500:x200:h', agentId: 'visar-night-trading', slug: 'visar-night-trading', name: 'visar-night-trading', epic: 'US500', leverage: 200,
		status: 'running', mirrored: true, startedAt: clock.since, metrics: { totalReturn: 1.662, sharpe: 9.27, trades: 3, maxDrawdown: 0 }, evidence: { clock: { ...clock, ...c } }, ...extra });
	expect(clockLine(row(), NOW)).toBe('Early · 3 trades in 40 days · daily t 1.63');
	expect(clockLine(row({ trades: 14, days: 49.2, t: 0.42 }), NOW)).toBe('Keep · daily t 0.42 over 49 days');
	expect(clockLine(row({ trades: 14, days: 49.2, t: 2.05, monkey: 0.19 }), NOW)).toBe('Candidate · daily t 2.05 over 49 days · may still be luck');
	expect(clockLine(row({ trades: 400, days: 720, t: 4.9, confirmed: true }), NOW)).toBe('Confirmed · daily t 4.90 over 720 days');
	expect(clockLine(row({ trades: 40, days: 49.2, t: -1.31 }), NOW)).toBe('Retire · daily t −1.31 over 49 days');
	expect(clockLine(row({}, { slug: 'random-baseline' }), NOW)).toBe('');
	expect(clockLine(row({}, { evidence: {} }), NOW)).toBe('');
	expect(barsLine(clock)).toBe("Confirmed at t 5.99 with 844 records tried (3.71 alone) · candidate at 2.00, above the luckiest monkey's 1.29");
	expect(agreementLine(clock)).toBe('Agrees with its backtest (1.9 standard errors above)');
	expect(agreementLine({ ...clock, backtestZ: 2.63 })).toBe('Better than its backtest allows (2.6 standard errors above; agrees up to 2)');
	expect(agreementLine({ ...clock, backtestZ: null })).toBe('No backtest of this code: it cannot be confirmed');
	// Capital rows carry the virtual record's clock and lead with its verdict; a virtual row whose badge already names it does not repeat the word.
	expect(rankingRow(row(), 'capital').body).toBe('Early · 3 trades in 40 days · daily t 1.63\nSharpe 9.27 · cash drawdown 0.0%');
	const judged = verdicts([row({ trades: 14, days: 49.2, t: 0.42 })], 'virtual')[0]!;
	expect(judged.forwardVerdict).toBe('keep');
	expect(rankingRow(judged, 'virtual')).toMatchObject({ badge: 'Keep', body: 'Daily t 0.42 over 49 days\nSharpe 9.27 · drawdown 0.0%' });
	expect(rankingRow({ ...judged, demoAdmission: { date: '2026-10-15', reason: 'x' } }, 'virtual')).toMatchObject({ badge: 'User experiment', body: 'Keep · daily t 0.42 over 49 days\nSharpe 9.27 · drawdown 0.0%' });
	expect(rankingRow(row(), 'backtest').body).toBe('Sharpe 9.27 · drawdown 0.0%');
	const detail = clockRow(row(), NOW)!;
	expect(detail.title).toBe('Early · daily t 1.63');
	expect(detail.subtitle).toBe('3 trades · 40 days · judged from 10 trades and 42 days');
	expect(detail.stats).toEqual([{ label: 'Daily t over 29 weekdays', value: '1.63', tone: 1 }, { label: 'Candidate at', value: '2.00' }, { label: 'Confirmed at, 844 tried', value: '5.99' }]);
	expect(detail.chart).toEqual({ kind: 'meter', height: 18, meter: { value: 1.6307, limit: 5.992, above: true } });
	expect(detail.body).toBe("Confirmed at t 5.99 with 844 records tried (3.71 alone) · candidate at 2.00, above the luckiest monkey's 1.29\nAgrees with its backtest (1.9 standard errors above)");
	expect(clockRow(row({ since: clock.since + 20 * 86400000, days: 20, trades: 1 }), NOW)!.body).toContain('Since its demotion from Capital demo on');
	expect(clockRow(row({}, { slug: 'random-baseline' }), NOW)).toBeNull();
	// The record's screen: the verdict on the virtual summary, then its own section before the backtest periods and the trades.
	const screen = runScreen({ run: { ...run, agentId: 'visar-night-trading', status: 'running', evidence: { clock } }, agentName: 'X', capital: null, excluded: false, comparison: null, sparks: null, account: null });
	expect(screen.sections[0]!.rows[0]!.body?.split('\n')[0]).toBe('Early · 3 trades in 40 days · daily t 1.63');
	expect(screen.sections.find(s => s.title === 'Edge or luck')!.rows.map(r => r.id)).toEqual(['clock']);
	expect(screen.sections.findIndex(s => s.title === 'Edge or luck')).toBeLessThan(screen.sections.findIndex(s => s.title.startsWith('Trades')));
});
test('the family has its own section: what it says about the record, apart from the record\'s own lines', () => {
	const NOW = Date.UTC(2026, 10, 25);
	const family = { id: 'visar-night', name: 'Visar night', records: 16, everRecords: 84, markets: 2, since: NOW - 41 * 86400000, days: 41.2, trades: 11, observations: 29, t: 1.27, e: 1.72, monkey: -2.15, backtestZ: 1.29, trials: 39, confirmAt: 4.82, aloneAt: 3.71, confirmed: false };
	const clock = { since: family.since, days: 40.8, trades: 3, observations: 29, t: 1.63, monkey: 1.29, life: { observations: 29, t: 1.63, e: 2.38 }, backtestZ: 1.88, trials: 844, confirmAt: 5.99, aloneAt: 3.71, confirmed: false };
	// Six judged members whose t-statistics differ by less than chance: the leader is read at their average.
	const level = { ...family, member: { t: 1.63, rank: 1, of: 6, average: 0.41, spread: 0.83, kept: 0, estimate: 0.41 } };
	expect(standingTitle(level)).toBe('1st of 6 in Visar night');
	expect(standingLine(level)).toBe("Members' t-statistics differ by 0.83; chance alone gives 1.00. The members cannot be told apart yet, so each is read at their average");
	// Members that differ by twice what chance gives: three quarters of a lead is kept.
	const apart = { ...family, member: { t: 3.2, rank: 2, of: 12, average: 0.4, spread: 2, kept: 0.75, estimate: 2.5 } };
	expect(standingTitle(apart)).toBe('2nd of 12 in Visar night');
	expect(standingLine(apart)).toBe("Members' t-statistics differ by 2.00; chance alone gives 1.00. 75% of this record's lead over the average member is kept");
	expect(standingTitle({ ...family, member: { ...apart.member, rank: 13 } })).toBe('13th of 12 in Visar night');
	const row: any = { runId: 'demo:visar-night-trading:US500:x200:h', agentId: 'visar-night-trading', slug: 'visar-night-trading', name: 'visar-night-trading', epic: 'US500', leverage: 200, status: 'running', mirrored: true,
		startedAt: clock.since, metrics: { totalReturn: 1.662, sharpe: 9.27, trades: 3, maxDrawdown: 0 }, evidence: { clock, family: level } };
	// The ranking row is the record's own: no family line.
	expect(rankingRow(row, 'capital').body).toBe('Early · 3 trades in 40 days · daily t 1.63\nSharpe 9.27 · cash drawdown 0.0%');
	const standing = standingRow(level)!;
	expect(standing).toMatchObject({ id: 'family-member', title: '1st of 6 in Visar night' });
	expect(standing.stats).toEqual([{ label: 'Own daily t', value: '1.63', tone: 1 }, { label: "Family's estimate for it", value: '0.41', tone: 1 }, { label: 'Average member', value: '0.41', tone: 1 }]);
	expect(standingRow(family)).toBeNull();                                   // too few judged members to stand among
	const detail = familyRow(family);
	expect(detail.title).toBe('Family Visar night · Early · daily t 1.27');
	expect(detail.subtitle).toBe('16 records on 2 markets · 11 trades · 41 days');
	expect(detail.stats).toEqual([{ label: 'Family t over 29 weekdays', value: '1.27', tone: 1 }, { label: 'Candidate at', value: '2.00' }, { label: 'Confirmed at, 39 families tried', value: '4.82' }]);
	expect(detail.body).toBe("Confirmed at t 4.82 with 39 families tried (3.71 alone) · candidate at 2.00, above the monkeys' family t −2.15\nAgrees with its backtests (1.3 standard errors above)\nEach weekday the family is worth the average of its records, each at equal risk; 68 retired records count on the days they ran");
	// The record's screen: its own "Edge or luck" row, then the family in a section of its own.
	const screen = runScreen({ run: { ...run, agentId: 'visar-night-trading', status: 'running', evidence: { clock, family: level } }, agentName: 'X', capital: null, excluded: false, comparison: null, sparks: null, account: null });
	expect(screen.sections.find(s => s.title === 'Edge or luck')!.rows.map(r => r.id)).toEqual(['clock']);
	expect(screen.sections.find(s => s.title === 'Family')!.rows.map(r => r.id)).toEqual(['family-member', 'family']);
	expect(screen.sections.findIndex(s => s.title === 'Family')).toBe(screen.sections.findIndex(s => s.title === 'Edge or luck') + 1);
	expect(screen.sections[0]!.rows[0]!.body).not.toContain('Family');
	// The agent's screen leads with the family, then one standing per record.
	const agent = agentScreen({ agent: { id: 'visar-night-trading', slug: 'visar-night-trading', name: 'visar-night-trading', description: '', codeHash: 'h', runs: [], versions: [] } as any,
		runs: [{ ...run, id: 'demo:visar-night-trading:US500:x200:h', agentId: 'visar-night-trading', epic: 'US500', leverage: 200, status: 'running', evidence: { clock, family: level } }], sparks: new Map(), capital: new Map() });
	expect(agent.sections[0]!.title).toBe('Family');
	expect(agent.sections[0]!.rows.map(r => r.title)).toEqual(['Family Visar night · Early · daily t 1.27', 'US500 1:200 · 1st of 6 in Visar night']);
	// A family that never had a second record gets no section.
	const lone = runScreen({ run: { ...run, agentId: 'visar-night-trading', status: 'running', evidence: { clock, family: { ...family, records: 1, everRecords: 1 } } }, agentName: 'X', capital: null, excluded: false, comparison: null, sparks: null, account: null });
	expect(lone.sections.some(s => s.title === 'Family')).toBe(false);
});
test('thinning keeps extremes and packing round-trips', () => {
	const pts = Array.from({ length: 5000 }, (_, i) => ({ t: i, value: i === 2500 ? 99 : Math.sin(i / 50) }));
	const out = thin(pts, 200);
	expect(out.length).toBeLessThanOrEqual(200);
	expect(out.some(p => p.value === 99)).toBe(true);
	expect([...new Float64Array(Buffer.from(f64([1.5, 1794882420703]), 'base64').buffer.slice(0))].length).toBeGreaterThan(0);
	expect(new Float32Array(new Uint8Array(Buffer.from(f32([27272.5]), 'base64')).buffer)[0]).toBe(27272.5);
});
