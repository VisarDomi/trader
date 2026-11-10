<script lang="ts">
	import { day, num, usd } from '$lib/format';

	let { data } = $props();
	const r = $derived(data.report);
	const bp = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(1)} bp`);
	const absBp = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${x.toFixed(1)} bp`);
	const share = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${Math.round(x * 100)}%`);
	const secs = (ms: number | null | undefined) => (ms === null || ms === undefined ? '—' : `${(ms / 1000).toFixed(1)} s`);
	const VERDICT_CLASS: Record<string, string> = { converged: 'status-good', watch: 'status-warning', diverged: 'status-critical', 'too few': '' };
	const reasons: Record<string, string> = { stop_loss: 'stop', take_profit: 'take-profit', trailing_stop: 'trailing stop', signal: 'agent exit', reverse: 'reversal', session_end: 'timed exit', margin_call: 'margin call' };
	let showAll = $state(false);
	const title = $derived(
		data.window === 'engine'
			? `since the current engine started (${r?.engine?.version ?? '?'}, ${day(r?.since)})`
			: `last ${data.window} days`,
	);
	const runs = $derived(r ? (showAll ? r.runs : r.runs.filter((x: any) => x.verdict !== 'too few').slice(0, 60)) : []);
</script>

<div class="stack">
	<header class="row" style="justify-content: space-between">
		<h1>Paper vs demo</h1>
		<nav class="pill-group" aria-label="Window">
			{#each data.windows as d}<a href="?days={d}" class:active={d === data.window}>{d === 'engine' ? 'Current engine' : `${d} days`}</a>{/each}
		</nav>
	</header>
	<p class="secondary lede">
		Every agent on a Capital.com demo account also runs as paper in our engine, from the same decisions. Each closed demo deal is paired with
		its paper trade and compared per unit of notional. A pair <strong>agrees</strong> when the two returns differ by at most one typical spread.
		Agents whose pairs keep agreeing show that paper results stand for demo results, so paper can carry the agents that do not fit on the nine
		demo accounts.
	</p>
	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}

	{#if r}
		<div class="grid">
			<section class="card stack-sm">
				<h2>Agreement, {title}</h2>
				<div class="big">{share(r.overall.agreeShare)} <span class="muted">of {r.overall.pairs} paired trades agree</span></div>
				<div>Mean gap {bp(r.overall.meanGapBps)} · median size {absBp(r.overall.medianAbsGapBps)} · 95th percentile {absBp(r.overall.p95AbsGapBps)}</div>
				<div>
					Paper {usd(r.overall.paperUsd, 0)} · demo at paper size {usd(r.overall.demoUsd, 0)} ·
					<strong class:up={r.overall.gapUsd > 0} class:down={r.overall.gapUsd < 0}>{usd(r.overall.gapUsd, 0)}</strong> for demo
				</div>
				<div class="muted">
					Paper funding {usd(r.overall.paperFundingUsd ?? 0, 0)}, not compared: Capital books overnight swaps per account without a deal id,
					so they cannot be paired with trades yet.
				</div>
			</section>
			<section class="card stack-sm">
				<h2>Agents</h2>
				<div class="row">
					{#each Object.entries(r.verdicts) as [v, n]}<span><span class="status-dot {VERDICT_CLASS[v]}"></span>{n} {v}</span>{/each}
				</div>
				<p class="muted small">
					Converged: at least {Math.round(r.rules.convergedShare * 100)}% of pairs agree and the mean gap is within half a spread.
					Diverged: under {Math.round(r.rules.divergedShare * 100)}% agree or the mean gap exceeds a spread. An agent needs {r.rules.minTrades} paired
					trades for a verdict.
				</p>
			</section>
			<section class="card stack-sm">
				<h2>Timing</h2>
				<div>Capital accepts the demo order {secs(r.overall.entryLagP50Ms)} after the decision (95th percentile {secs(r.overall.entryLagP95Ms)}); the paper twin assumes 0.5 s</div>
				<div>When Capital's own stop or limit closes first: {secs(r.overall.exitLagP50Ms === null ? null : -r.overall.exitLagP50Ms)} before the paper exit (median)</div>
				{#if r.feed?.medianDelayMs !== null && r.feed?.medianDelayMs !== undefined}
					<div>Capital's quote stream arrives <strong>{secs(r.feed.medianDelayMs)}</strong> after each quote's timestamp (median over instruments, now)</div>
				{/if}
				<p class="muted small">
					Since November 10 the demo order leaves at the decision, the paper twin fills at the price Capital had when its order would arrive,
					and minutes close only after their late quotes arrive. Earlier trades filled paper on the quote in hand, about 8 s old, and sent the
					demo order after the paper fill.
				</p>
			</section>
		</div>

		<section class="card">
			<h2>By day</h2>
			<div class="table-wrap">
				<table class="data">
					<thead><tr><th>Day (paper exit, UTC)</th><th class="num">Pairs</th><th class="num">Agree</th><th class="num">Mean gap</th><th class="num">95th pct size</th><th class="num">Demo − paper</th></tr></thead>
					<tbody>
						{#each [...r.days].reverse() as d}
							<tr><td>{day(d.day)}</td><td class="num">{d.pairs}</td><td class="num">{share(d.agreeShare)}</td><td class="num">{bp(d.meanGapBps)}</td><td class="num">{absBp(d.p95AbsGapBps)}</td><td class="num" class:up={d.gapUsd > 0} class:down={d.gapUsd < 0}>{usd(d.gapUsd, 0)}</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<div class="grid two">
			<section class="card">
				<h2>By instrument</h2>
				<div class="table-wrap">
					<table class="data">
						<thead><tr><th>Instrument</th><th class="num">Pairs</th><th class="num">Agree</th><th class="num">Mean gap</th><th class="num">95th pct</th><th class="num">Demo − paper</th></tr></thead>
						<tbody>
							{#each r.byEpic as e}
								<tr><td>{e.epic}</td><td class="num">{e.pairs}</td><td class="num">{share(e.agreeShare)}</td><td class="num">{bp(e.meanGapBps)}</td><td class="num">{absBp(e.p95AbsGapBps)}</td><td class="num" class:up={e.gapUsd > 0} class:down={e.gapUsd < 0}>{usd(e.gapUsd, 0)}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
			<section class="card">
				<h2>By exit</h2>
				<div class="table-wrap">
					<table class="data">
						<thead><tr><th>Paper exit</th><th>Demo closed by</th><th class="num">Pairs</th><th class="num">Agree</th><th class="num">Mean gap</th><th class="num">Demo − paper</th></tr></thead>
						<tbody>
							{#each r.byExit as e}
								<tr><td>{reasons[e.exitReason] ?? e.exitReason}</td><td>{e.closedBy === 'broker' ? "Capital's stop or limit" : 'arena close'}</td><td class="num">{e.pairs}</td><td class="num">{share(e.agreeShare)}</td><td class="num">{bp(e.meanGapBps)}</td><td class="num" class:up={e.gapUsd > 0} class:down={e.gapUsd < 0}>{usd(e.gapUsd, 0)}</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			</section>
		</div>

		<section class="card">
			<div class="row" style="justify-content: space-between">
				<h2>Agents on demo</h2>
				<label class="small muted"><input type="checkbox" bind:checked={showAll} /> include agents with too few trades</label>
			</div>
			<div class="table-wrap">
				<table class="data">
					<thead><tr><th>Verdict</th><th>Run</th><th class="num">Pairs</th><th class="num">Agree</th><th class="num">Mean gap</th><th class="num">Spread</th><th class="num">Paper</th><th class="num">Demo − paper</th></tr></thead>
					<tbody>
						{#each runs as x}
							<tr>
								<td><span class="status-dot {VERDICT_CLASS[x.verdict]}"></span>{x.verdict}</td>
								<td><a href="/runs/{encodeURIComponent(x.runId)}">{x.agentId}</a> <span class="muted">{x.epic} 1:{x.leverage}</span></td>
								<td class="num">{x.pairs}</td><td class="num">{share(x.agreeShare)}</td><td class="num">{bp(x.meanGapBps)}</td><td class="num">{absBp(x.toleranceBps)}</td>
								<td class="num">{usd(x.paperUsd, 0)}</td><td class="num" class:up={x.gapUsd > 0} class:down={x.gapUsd < 0}>{usd(x.gapUsd, 0)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>

		<section class="card">
			<h2>Largest gaps</h2>
			<div class="table-wrap">
				<table class="data">
					<thead><tr><th>Paper exit (UTC)</th><th>Run</th><th>Side</th><th>Exit</th><th class="num">Entry</th><th class="num">Exit</th><th class="num">Gap</th><th class="num">Demo − paper</th></tr></thead>
					<tbody>
						{#each r.worst as t}
							<tr>
								<td>{new Date(t.exitTime).toISOString().slice(0, 16).replace('T', ' ')}</td>
								<td><a href="/runs/{encodeURIComponent(t.runId)}">{t.runId.split(':')[1]}</a> <span class="muted">{t.epic}</span></td>
								<td>{t.side}</td><td>{reasons[t.exitReason] ?? t.exitReason}{t.closedBy === 'broker' ? ' · Capital first' : ''}</td>
								<td class="num">{bp(t.entryBps)}</td><td class="num">{bp(t.exitBps)}</td><td class="num">{bp(t.gapBps)}</td>
								<td class="num" class:up={t.gapUsd > 0} class:down={t.gapUsd < 0}>{usd(t.gapUsd, 0)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<p class="muted small">
				Positive means the demo did better. Entry and exit are price differences in basis points (the demo deal minus the paper trade, in the
				trader's favour); dollars are scaled to the paper trade's size. {r.unpaired.withoutPaperTrade} older demo deals predate pairing and are
				left out.
			</p>
		</section>
	{/if}
</div>

<style>
	.lede { max-width: 900px; margin: 0; }
	.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; }
	.grid.two { grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); }
	.stack-sm { display: flex; flex-direction: column; gap: 6px; }
	.big { font-size: 22px; font-weight: 650; }
	.big .muted { font-size: 14px; font-weight: 400; }
	.small { font-size: 12px; }
	h2 { margin: 0 0 6px; font-size: 15px; }
	.table-wrap { max-height: 420px; }
	@media (max-width: 600px) { .grid.two { grid-template-columns: 1fr; } }
</style>
