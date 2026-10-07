<script lang="ts">
	import EquityChart from '$lib/components/EquityChart.svelte';
	import StatTile from '$lib/components/StatTile.svelte';
	import { ago, duration, num, pct, pctPlain, price, sign, usd, utc } from '$lib/format';

	let { data } = $props();
	const run = $derived(data.run);
	const m = $derived(run.metrics);
	const trades = $derived([...run.trades].reverse());
	let showAllTrades = $state(false);
</script>

<div class="stack">
	<header class="stack" style="gap: 4px">
		<div class="muted"><a href="/?view={run.kind}">Leaderboard</a> / <a href="/agents/{run.agentId}">{data.agentName}</a></div>
		<h1>
			{data.agentName} · {run.epic} <span class="badge">{run.kind}</span>
			{#if run.leverage !== null}<span class="badge" title="Leverage of the demo account this run trades on">1:{run.leverage}</span>{/if}
			<span class="badge">{run.status}</span>
		</h1>
		<div class="secondary" style="font-size: 13px">
			{#if run.kind === 'demo'}
				Live since {utc(run.startedAt)} · updated {ago(run.updatedAt)} · code {run.codeHash}
			{:else}
				Window {run.windowId} · ran {ago(run.updatedAt)} · code {run.codeHash}
				{#if run.extra}· {num(Number(run.extra.agentUsPerBar), 0)} µs per bar{/if}
			{/if}
		</div>
	</header>

	<div class="row">
		<StatTile label="Equity" value={usd(run.equity, 0)} />
		<StatTile label="Return" value={pct(m?.totalReturn)} tone={sign(m?.totalReturn)} />
		{#if run.kind === 'backtest'}<StatTile label="Annual return" value={pct(m?.annualReturn)} tone={sign(m?.annualReturn)} />{/if}
		<StatTile label="Max drawdown" value={pctPlain(m?.maxDrawdown)} />
		<StatTile label="Sharpe" value={num(m?.sharpe)} />
		<StatTile label="Trades" value={String(m?.trades ?? 0)} />
		<StatTile label="Win rate" value={m?.trades ? pctPlain(m.winRate, 0) : '—'} />
		<StatTile label="Profit factor" value={m?.trades ? num(m.profitFactor) : '—'} />
		<StatTile label="t-stat" value={m && m.trades > 1 ? num(m.tStat, 1) : '—'} hint="Trade P&L mean / stdev × √n. Above ~2 is unlikely to be luck." />
		<StatTile label="Funding paid" value={usd(m?.funding)} tone={sign(m?.funding)} />
	</div>

	<section class="card">
		<h2>Equity ({run.kind === 'demo' ? 'hourly' : 'daily'}, $10,000 start)</h2>
		<EquityChart data={run.equityCurve} baseline={run.capital} />
	</section>

	{#if run.position}
		<section class="card">
			<h2>Open position</h2>
			<div class="row secondary">
				<span class="badge">{run.position.side}</span>
				<span>{run.position.size} @ {price(run.position.entryPrice)}</span>
				<span>since {utc(run.position.entryTime)}</span>
				<span>stop {price(run.position.stopLoss)}</span>
				<span>target {price(run.position.takeProfit)}</span>
				{#if run.position.trailingStop}<span>trailing {price(run.position.trailingStop)}</span>{/if}
			</div>
		</section>
	{/if}

	{#if m && m.monthly.length > 1}
		<section class="card">
			<h2>Monthly returns · profitable {m.profitableMonths} of {m.totalMonths}</h2>
			<div class="months">
				{#each m.monthly as mo}
					<div class="month" title="{mo.month}: {pct(mo.ret, 2)}">
						<div class="mlabel muted">{mo.month.slice(2)}</div>
						<div class="num {sign(mo.ret)}">{pct(mo.ret)}</div>
					</div>
				{/each}
			</div>
		</section>
	{/if}

	<section class="card">
		<h2>Trades ({run.trades.length}{run.trades.length >= 2000 ? ', latest 2000' : ''})</h2>
		<div class="table-wrap" style="max-height: 520px">
			<table class="data">
				<thead>
					<tr>
						<th>Side</th><th>Entry</th><th class="num">Entry px</th><th>Exit</th><th class="num">Exit px</th><th class="num">Size</th>
						<th class="num">P&L</th><th class="num">Funding</th><th>Held</th><th>Exit reason</th><th>Entry reason</th>
					</tr>
				</thead>
				<tbody>
					{#each showAllTrades ? trades : trades.slice(0, 200) as t}
						<tr>
							<td><span class="badge">{t.side}</span></td>
							<td class="muted">{utc(t.entryTime)}</td>
							<td class="num">{price(t.entryPrice)}</td>
							<td class="muted">{utc(t.exitTime)}</td>
							<td class="num">{price(t.exitPrice)}</td>
							<td class="num">{t.size}</td>
							<td class="num {sign(t.pnl)}">{usd(t.pnl)}</td>
							<td class="num muted">{usd(t.funding)}</td>
							<td class="muted">{duration(t.exitTime - t.entryTime)}</td>
							<td>{t.exitReason.replaceAll('_', ' ')}</td>
							<td class="muted">{t.entryReason ?? ''}</td>
						</tr>
					{:else}
						<tr><td colspan="11" class="muted">No trades yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if trades.length > 200 && !showAllTrades}
			<button class="btn" style="margin-top: 8px" onclick={() => (showAllTrades = true)}>Show all {trades.length}</button>
		{/if}
	</section>

	{#if run.deals.length > 0}
		<section class="card">
			<h2>Broker deals (real demo orders mirrored from this run)</h2>
			<table class="data">
				<thead>
					<tr><th>Opened</th><th>Account</th><th>Side</th><th class="num">Size</th><th class="num">Broker open</th><th class="num">Paper open</th><th class="num">Broker close</th><th class="num">Paper close</th><th class="num">P&L</th><th>Status</th><th>Note</th></tr>
				</thead>
				<tbody>
					{#each run.deals as d}
						<tr>
							<td class="muted">{utc(d.open_time)}</td>
							<td>{d.account}</td>
							<td>{d.side}</td>
							<td class="num">{d.size}</td>
							<td class="num">{price(d.open_price)}</td>
							<td class="num muted">{price(d.paper_open_price)}</td>
							<td class="num">{price(d.close_price)}</td>
							<td class="num muted">{price(d.paper_close_price)}</td>
							<td class="num {sign(d.pnl)}">{usd(d.pnl)}</td>
							<td>{d.status}</td>
							<td class="muted">{d.note ?? ''}</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>
	{/if}

	<section class="card">
		<h2>Log</h2>
		{#if run.logs.length === 0}
			<p class="muted">Empty.</p>
		{:else}
			<pre class="log">{#each [...run.logs].reverse() as l}{utc(l.time)}  {l.message}
{/each}</pre>
		{/if}
	</section>

	{#if run.state && Object.keys(run.state as object).length > 0}
		<section class="card">
			<h2>Agent state</h2>
			<pre class="log">{JSON.stringify(run.state, null, 2)}</pre>
		</section>
	{/if}

	<section class="card">
		<h2>Parameters</h2>
		<pre class="log">{JSON.stringify(run.params, null, 2)}</pre>
	</section>
</div>

<style>
	.months {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(74px, 1fr));
		gap: 6px;
	}
	.month {
		border: 1px solid var(--grid);
		border-radius: 6px;
		padding: 4px 8px;
		font-size: 12px;
	}
	.month .num {
		text-align: left;
	}
	.mlabel {
		font-size: 11px;
	}
	pre.log {
		max-height: 320px;
		overflow: auto;
		white-space: pre-wrap;
		color: var(--ink-2);
	}
</style>
