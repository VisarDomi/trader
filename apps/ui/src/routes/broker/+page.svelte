<script lang="ts">
	import { enhance } from '$app/forms';
	import StatTile from '$lib/components/StatTile.svelte';
	import { ago, isControl, num, pct, price, sign, usd, utc } from '$lib/format';

	let { data, form } = $props();
	const status = $derived(data.broker.status);
	const mirrored = $derived(new Set(status?.mirroredRuns ?? []));
	const candidates = $derived(
		[...data.demo]
			.filter(r => r.status === 'running' && !isControl(r))
			.sort((a, b) => (b.metrics?.totalReturn ?? 0) - (a.metrics?.totalReturn ?? 0)),
	);
	let filter = $state('');

	function slippage(broker: number | null, paper: number | null, side: string, opening: boolean): string {
		if (broker === null || paper === null) return '—';
		// Positive = broker fill worse than paper.
		const buying = (side === 'long') === opening;
		const diff = buying ? broker - paper : paper - broker;
		return num(diff, 2);
	}
</script>

<div class="stack">
	<header class="stack" style="gap: 6px">
		<h1>Gerti — broker mirror</h1>
		<p class="lede">
			A few demo runs are copied onto the Capital.com <strong>demo</strong> sub-account "Gerti" as real demo orders, scaled
			to its balance. This measures how real fills differ from the paper fills the leaderboard uses. One run per instrument
			(the account nets positions). Safety: max 20 orders/minute, a run placing 12+ orders in an hour is removed, and the
			mirror shuts itself off if equity falls below 50% of the $1,000 allocation.
		</p>
	</header>

	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}
	{#if form?.message}<div class="card">{form.message}</div>{/if}

	{#if status}
		<div class="row">
			<StatTile label="Balance" value={usd(status.balance)} />
			<StatTile label="Equity" value={usd(status.equity)} />
			<StatTile label="Open deals" value={String(status.openDeals)} />
			<StatTile label="Mirrored runs" value={String(status.mirroredRuns.length)} />
			<div class="card state">
				{#if status.killed}
					<span class="status-dot status-critical"></span><strong>Kill switch tripped</strong> — re-enable to resume.
				{:else if status.enabled}
					<span class="status-dot status-good"></span>Mirror on
				{:else}
					<span class="status-dot status-warning"></span>Mirror off
				{/if}
				<div class="muted small">reconciled {ago(status.lastReconcileAt)}</div>
				<form method="POST" action="?/toggle" use:enhance>
					<input type="hidden" name="enabled" value={status.enabled ? 'false' : 'true'} />
					<button class="btn">{status.enabled ? 'Turn mirror off' : 'Turn mirror on'}</button>
				</form>
			</div>
		</div>
		{#if status.lastError}<div class="card small"><span class="status-dot status-warning"></span>Last error: {status.lastError}</div>{/if}
		{#if status.foreignEpics.length}<div class="card small"><span class="status-dot status-warning"></span>Positions on Gerti the arena did not open (left alone, instrument skipped): {status.foreignEpics.join(', ')}</div>{/if}
	{/if}

	<section class="card">
		<h2>Choose mirrored runs</h2>
		<p class="secondary small">Sorted by demo return. Picking two runs on the same instrument keeps only the first.</p>
		<form method="POST" action="?/mirror" use:enhance class="stack" style="gap: 8px">
			<input type="search" placeholder="Filter" bind:value={filter} style="max-width: 260px" />
			<div class="table-wrap" style="max-height: 420px">
				<table class="data">
					<thead><tr><th></th><th>Agent</th><th>Instrument</th><th class="num">Demo trades</th><th class="num">Demo return</th><th class="num">BT Sharpe</th></tr></thead>
					<tbody>
						{#each candidates as r (r.runId)}
							<tr class:hidden={filter !== '' && !`${r.name} ${r.epic}`.toLowerCase().includes(filter.toLowerCase())}>
								<td><input type="checkbox" name="runId" value={r.runId} checked={mirrored.has(r.runId)} aria-label="Mirror {r.name} on {r.epic}" /></td>
								<td>{r.name}</td>
								<td>{r.epic}</td>
								<td class="num">{r.metrics?.trades ?? 0}</td>
								<td class="num {sign(r.metrics?.totalReturn)}">{pct(r.metrics?.totalReturn)}</td>
								<td class="num">{num(r.backtest?.metrics?.sharpe)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div><button class="btn">Save mirrored runs</button></div>
		</form>
	</section>

	<section class="card">
		<h2>Deals</h2>
		<p class="secondary small">Slippage = how much worse the broker fill was than the paper fill (price units; negative = better).</p>
		<div class="table-wrap" style="max-height: 520px">
			<table class="data">
				<thead>
					<tr><th>Opened</th><th>Run</th><th>Side</th><th class="num">Size</th><th class="num">Open</th><th class="num">Open slip</th><th class="num">Close</th><th class="num">Close slip</th><th class="num">P&L</th><th>Status</th><th>Note</th></tr>
				</thead>
				<tbody>
					{#each data.broker.deals as d (d.id)}
						<tr>
							<td class="muted">{utc(d.open_time)}</td>
							<td><a href="/runs/{encodeURIComponent(d.run_id)}">{d.run_id.split(':')[1]} · {d.epic}</a></td>
							<td>{d.side}</td>
							<td class="num">{d.size}</td>
							<td class="num">{price(d.open_price)}</td>
							<td class="num">{slippage(d.open_price, d.paper_open_price, d.side, true)}</td>
							<td class="num">{price(d.close_price)}</td>
							<td class="num">{slippage(d.close_price, d.paper_close_price, d.side, false)}</td>
							<td class="num {sign(d.pnl)}">{usd(d.pnl)}</td>
							<td>{d.status}</td>
							<td class="muted">{d.note ?? ''}</td>
						</tr>
					{:else}
						<tr><td colspan="11" class="muted">No deals yet.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>
</div>

<style>
	.state {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.small {
		font-size: 12px;
	}
	tr.hidden {
		display: none;
	}
</style>
