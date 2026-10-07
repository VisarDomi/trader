<script lang="ts">
	import { enhance } from '$app/forms';
	import StatTile from '$lib/components/StatTile.svelte';
	import { ago, num, pct, price, sign, usd, utc } from '$lib/format';

	let { data, form } = $props();
	const status = $derived(data.broker.status);
	const accountOf = $derived(new Map((status?.accounts ?? []).flatMap(a => a.runs.map(id => [id, a.name] as const))));
	const excluded = $derived(new Set(status?.excluded ?? []));
	const runs = $derived(
		[...data.demo]
			.filter(r => r.status === 'running')
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
		<h1>Broker mirror</h1>
		<p class="lede">
			Demo runs are copied onto Capital.com <strong>demo</strong> accounts as real demo orders, to measure how real fills
			differ from the paper fills the leaderboard uses. An account nets positions per instrument, so it holds at most one
			run per instrument. To add capacity, create a USD demo account whose name starts with
			<strong>"{status?.prefix || '—'}"</strong>: within a minute it is topped up to $100,000 and given up to
			{status?.defaultSlots ?? 10} runs at exactly the paper size. Safety: a run opening 12+ times in an hour is excluded,
			at most {status?.maxOpensPerHour ?? 600} opens per hour in total, and an account whose equity falls below 50% of its
			allocation is switched off.
		</p>
	</header>

	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}
	{#if form?.message}<div class="card">{form.message}</div>{/if}

	{#if status}
		<div class="row">
			<StatTile label="Mirrored runs" value="{status.coverage.mirrored} / {status.coverage.liveRuns}" />
			<StatTile label="Accounts" value={String(status.accounts.length)} />
			<StatTile label="More accounts needed" value={String(status.coverage.accountsNeeded)} />
			<StatTile label="Opens last hour" value="{status.opensLastHour} / {status.maxOpensPerHour}" />
			<div class="card state">
				{#if status.enabled}
					<span class="status-dot status-good"></span>Mirror on
				{:else}
					<span class="status-dot status-warning"></span>Mirror off
				{/if}
				<div class="muted small">checked {ago(status.lastCycleAt)} · {status.queued} queued</div>
				<form method="POST" action="?/toggle" use:enhance>
					<input type="hidden" name="enabled" value={status.enabled ? 'false' : 'true'} />
					<button class="btn">{status.enabled ? 'Turn mirror off' : 'Turn mirror on'}</button>
				</form>
			</div>
		</div>
		{#if status.lastError}<div class="card small"><span class="status-dot status-warning"></span>Last error: {status.lastError}</div>{/if}

		<section class="card">
			<h2>Accounts</h2>
			<p class="secondary small">Scale = broker size ÷ paper size (allocation ÷ slots ÷ $10,000 paper capital, at most 1).</p>
			<div class="table-wrap">
				<table class="data">
					<thead>
						<tr><th>Account</th><th class="num">Balance</th><th class="num">Equity</th><th class="num">Allocation</th><th class="num">Scale</th><th class="num">Runs</th><th class="num">Open deals</th><th>State</th><th>Reconciled</th></tr>
					</thead>
					<tbody>
						{#each status.accounts as a (a.name)}
							<tr>
								<td>{a.name}</td>
								<td class="num">{usd(a.balance)}</td>
								<td class="num {sign(a.equity !== null && a.allocation !== null ? a.equity - a.allocation : null)}">{usd(a.equity)}</td>
								<td class="num">{usd(a.allocation, 0)}</td>
								<td class="num">{num(a.scale, 3)}</td>
								<td class="num">{a.runs.length} / {a.slots}</td>
								<td class="num">{a.openDeals}</td>
								<td>
									{#if a.killed}<span class="status-dot status-critical"></span>kill switch — turn the mirror on again to reset
									{:else if a.allocation === null}<span class="status-dot status-warning"></span>enrolling
									{:else}<span class="status-dot status-good"></span>ok{/if}
									{#if a.foreignEpics.length}<div class="muted small">skipping {a.foreignEpics.join(', ')} (positions the arena did not open)</div>{/if}
								</td>
								<td class="muted">{ago(a.lastReconcileAt)}</td>
							</tr>
						{:else}
							<tr><td colspan="9" class="muted">No accounts found.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<section class="card">
		<h2>Runs</h2>
		<p class="secondary small">
			Every live run is mirrored while slots last, best demo return first; a run keeps its account once assigned. Excluding a
			run closes its deals and frees its slot.
		</p>
		<input type="search" placeholder="Filter" bind:value={filter} style="max-width: 260px; margin-bottom: 8px" />
		<div class="table-wrap" style="max-height: 480px">
			<table class="data">
				<thead><tr><th>Agent</th><th>Instrument</th><th>Account</th><th class="num">Demo trades</th><th class="num">Demo return</th><th></th></tr></thead>
				<tbody>
					{#each runs as r (r.runId)}
						<tr class:hidden={filter !== '' && !`${r.name} ${r.epic} ${accountOf.get(r.runId) ?? ''}`.toLowerCase().includes(filter.toLowerCase())}>
							<td><a href="/runs/{encodeURIComponent(r.runId)}">{r.name}</a></td>
							<td>{r.epic}</td>
							<td class:muted={!accountOf.has(r.runId)}>{excluded.has(r.runId) ? 'excluded' : (accountOf.get(r.runId) ?? 'no free slot')}</td>
							<td class="num">{r.metrics?.trades ?? 0}</td>
							<td class="num {sign(r.metrics?.totalReturn)}">{pct(r.metrics?.totalReturn)}</td>
							<td>
								<form method="POST" action="?/exclude" use:enhance>
									<input type="hidden" name="runId" value={r.runId} />
									<input type="hidden" name="excluded" value={excluded.has(r.runId) ? 'false' : 'true'} />
									<button class="btn small">{excluded.has(r.runId) ? 'Allow' : 'Exclude'}</button>
								</form>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<section class="card">
		<h2>Deals</h2>
		<p class="secondary small">Slippage = how much worse the broker fill was than the paper fill (price units; negative = better).</p>
		<div class="table-wrap" style="max-height: 520px">
			<table class="data">
				<thead>
					<tr><th>Opened</th><th>Account</th><th>Run</th><th>Side</th><th class="num">Size</th><th class="num">Open</th><th class="num">Open slip</th><th class="num">Close</th><th class="num">Close slip</th><th class="num">P&L</th><th>Status</th><th>Note</th></tr>
				</thead>
				<tbody>
					{#each data.broker.deals as d (d.id)}
						<tr>
							<td class="muted">{utc(d.open_time)}</td>
							<td>{d.account}</td>
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
						<tr><td colspan="12" class="muted">No deals yet.</td></tr>
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
	button.small {
		padding: 2px 8px;
	}
	tr.hidden {
		display: none;
	}
</style>
