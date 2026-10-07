<script lang="ts">
	import { enhance } from '$app/forms';
	import StatTile from '$lib/components/StatTile.svelte';
	import { ago, lev, levTitle, num, pct, price, sign, usd, utc } from '$lib/format';

	let { data, form } = $props();
	const status = $derived(data.broker.status);
	const accountOf = $derived(new Map((status?.accounts ?? []).flatMap(a => a.runs.map(id => [id, a.name] as const))));
	const capacity = $derived((status?.accounts ?? []).reduce((n, a) => n + (a.killed || a.retiring ? 0 : a.slots), 0));
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
			Demo runs are copied onto Capital.com <strong>demo</strong> accounts as real demo orders at
			{status?.scale ?? 0.2}× the paper size, to measure how real fills differ from the paper fills the leaderboard uses.
			Every account whose name starts with <strong>"{status?.prefix || '—'}"</strong> is used: it is topped up to $100,000,
			switched to hedging mode (many runs per instrument, each its own deal) and holds up to
			{status?.slotsPerAccount ?? 50} runs. Each account has one leverage (set in <code>agents/roster.json</code> and applied by
			the arena) and holds only runs of that leverage, so a demo deal is opened at the same leverage as its paper run; see
			<a href="/leverage">Leverage</a>. Capital.com allows {status?.maxAccountsPerLogin ?? 10} demo accounts per login;
			accounts with other names are never touched. Safety: a run opening 12+ times in an hour is excluded, at most
			{status?.maxOpensPerHour ?? 600} opens per hour in total, and an account whose equity falls below 50% of its
			allocation is switched off.
		</p>
	</header>

	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}
	{#if form?.message}<div class="card">{form.message}</div>{/if}

	{#if status}
		<div class="row">
			<StatTile label="Mirrored runs" value="{status.coverage.mirrored} / {status.coverage.liveRuns}" />
			<StatTile label="Capacity" value="{capacity} runs on {status.accounts.length} accounts" />
			{#if status.coverage.accountsNeeded > 0}<StatTile label="More accounts needed" value={String(status.coverage.accountsNeeded)} />{/if}
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
			<p class="secondary small">Each mirrored run reserves {usd((status.scale ?? 0.2) * 10_000, 0)} of an account's allocation.</p>
			<div class="table-wrap">
				<table class="data">
					<thead>
						<tr><th>Account</th><th>Leverage</th><th class="num">Balance</th><th class="num">Equity</th><th class="num">Allocation</th><th>Mode</th><th class="num">Runs</th><th class="num">Open deals</th><th>State</th><th>Reconciled</th></tr>
					</thead>
					<tbody>
						{#each status.accounts as a (a.id)}
							<tr>
								<td>{a.name}</td>
								<td>
									{#if a.leverage === null}<span class="muted" title="Not in agents/roster.json: gets no runs">none</span>
									{:else}1:{a.leverage}{#if a.leverageOk === false}<span class="status-dot status-critical" style="margin-left: 6px"></span>not set{:else if a.leverageOk === null}<span class="muted"> (checking)</span>{/if}{/if}
								</td>
								<td class="num">{usd(a.balance)}</td>
								<td class="num {sign(a.allocation !== null ? a.equity - a.allocation : null)}">{usd(a.equity)}</td>
								<td class="num">{usd(a.allocation, 0)}</td>
								<td>{a.hedging === null ? '—' : a.hedging ? 'hedging' : 'netting (1 run per instrument)'}</td>
								<td class="num">{a.runs.length} / {a.slots}</td>
								<td class="num">{a.openDeals}</td>
								<td>
									{#if a.killed}<span class="status-dot status-critical"></span>kill switch — turn the mirror on again to reset
									{:else if a.retiring}<span class="status-dot status-warning"></span>renamed away; closing the arena's deals
									{:else if a.allocation === null}<span class="status-dot status-warning"></span>enrolling
									{:else}<span class="status-dot status-good"></span>ok{/if}
									{#if a.foreignEpics.length}<div class="muted small">also holds positions the arena did not open: {a.foreignEpics.join(', ')}</div>{/if}
								</td>
								<td class="muted">{ago(a.lastReconcileAt)}</td>
							</tr>
						{:else}
							<tr><td colspan="10" class="muted">No accounts found.</td></tr>
						{/each}
					</tbody>
				</table>
			</div>
		</section>
	{/if}

	<section class="card">
		<h2>Runs</h2>
		<p class="secondary small">
			Every live run is mirrored on an account of its leverage while capacity lasts, best demo equity first; a run keeps its
			account once assigned. Excluding a run closes its deal and frees its slot.
		</p>
		<input type="search" placeholder="Filter" bind:value={filter} style="max-width: 260px; margin-bottom: 8px" />
		<div class="table-wrap" style="max-height: 480px">
			<table class="data">
				<thead><tr><th>Agent</th><th>Instrument</th><th>Lev.</th><th>Account</th><th class="num">Demo trades</th><th class="num">Demo return</th><th></th></tr></thead>
				<tbody>
					{#each runs as r (r.runId)}
						<tr class:hidden={filter !== '' && !`${r.name} ${r.epic} ${accountOf.get(r.runId) ?? ''}`.toLowerCase().includes(filter.toLowerCase())}>
							<td><a href="/runs/{encodeURIComponent(r.runId)}">{r.name}</a></td>
							<td>{r.epic}</td>
							<td title={levTitle(r)}>{lev(r)}</td>
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
