<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/format';
	import { groupRunsByBehavior, getDimension } from '$lib/utils/grouping';
	import type { RunRecord } from '$lib/types';

	let { data } = $props();

	const modes = [
		{ value: 'backtest', label: 'Backtest' },
		{ value: 'paper', label: 'Paper' },
		{ value: 'live', label: 'Live' },
	] as const;

	const sortOptions = [
		{ value: 'totalReturn', label: 'Return' },
		{ value: 'sharpe', label: 'Sharpe' },
		{ value: 'winRate', label: 'Win Rate' },
		{ value: 'totalPnL', label: 'PnL' },
		{ value: 'profitFactor', label: 'Profit Factor' },
		{ value: 'maxDrawdown', label: 'Drawdown' },
		{ value: 'totalTrades', label: 'Trades' },
	];

	let activeTab = $state(data.mode ?? 'backtest');
	let filterInstrument = $state('');
	let expanded = $state<Set<string>>(new Set());

	function toggleExpand(behavior: string) {
		const next = new Set(expanded);
		if (next.has(behavior)) next.delete(behavior);
		else next.add(behavior);
		expanded = next;
	}

	let byMode = $derived({
		backtest: data.leaderboard.filter((r: RunRecord) => r.mode === 'backtest'),
		paper: data.leaderboard.filter((r: RunRecord) => r.mode === 'paper'),
		live: data.leaderboard.filter((r: RunRecord) => r.mode === 'live'),
	});

	let activeRuns = $derived(byMode[activeTab as keyof typeof byMode] ?? []);

	let filtered = $derived(
		filterInstrument
			? activeRuns.filter((r: RunRecord) => r.instrument === filterInstrument)
			: activeRuns
	);

	let instruments = $derived([...new Set(activeRuns.map((r: RunRecord) => r.instrument))]);

	let counts = $derived({
		backtest: byMode.backtest.length,
		paper: byMode.paper.length,
		live: byMode.live.length,
	});

	let groups = $derived(groupRunsByBehavior(filtered, data.sortBy));
</script>

<div class="page-header">
	<h1>Leaderboard</h1>

	<div class="mode-tabs">
		{#each modes as m}
			<button
				class="mode-tab"
				class:active={activeTab === m.value}
				onclick={() => { activeTab = m.value; filterInstrument = ''; expanded = new Set(); }}
			>
				{m.label}
				<span class="tab-count">{counts[m.value]}</span>
			</button>
		{/each}
	</div>

	<div class="filters">
		<select bind:value={filterInstrument}>
			<option value="">All instruments</option>
			{#each instruments as inst}
				<option value={inst}>{inst}</option>
			{/each}
		</select>
		<div class="sort-links">
			{#each sortOptions as opt}
				<a
					href="/?sortBy={opt.value}&mode={activeTab}"
					class="sort-link"
					class:active={data.sortBy === opt.value}
				>{opt.label}</a>
			{/each}
		</div>
	</div>
</div>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else if groups.length === 0}
	<div class="empty-state">No {activeTab} runs yet.</div>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					<th>#</th>
					<th>Behavior</th>
					<th>Best Dimension</th>
					<th>Instrument</th>
					<th>Return</th>
					<th>Sharpe</th>
					<th>Win Rate</th>
					<th>PnL</th>
					<th>Dims</th>
				</tr>
			</thead>
			<tbody>
				{#each groups as group, i}
					{@const best = group.bestRun}
					{@const m = best.metrics}
					{@const isExpanded = expanded.has(group.behavior)}
					<tr class="behavior-row" class:expanded={isExpanded} onclick={() => toggleExpand(group.behavior)}>
						<td class="rank">{i + 1}</td>
						<td class="behavior-name">{group.behavior}</td>
						<td class="dim-name mono">{getDimension(best.agentId)}</td>
						<td><span class="badge badge-neutral">{best.instrument}</span></td>
						<td style="color: {m && m.totalReturn >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatPercent(m.totalReturn) : '—'}
						</td>
						<td style="color: {m && m.sharpe >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatNumber(m.sharpe) : '—'}
						</td>
						<td>{m ? formatPercent(m.winRate) : '—'}</td>
						<td style="color: {m && m.totalPnL >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatCurrency(m.totalPnL) : '—'}
						</td>
						<td>
							<span class="badge badge-neutral dims-badge">{group.dimCount}</span>
						</td>
					</tr>
					{#if isExpanded}
						{#each group.runs.slice(1) as run, j}
							{@const rm = run.metrics}
							<tr class="dim-row">
								<td class="rank dim-rank">{i + 1}.{j + 2}</td>
								<td></td>
								<td class="dim-name mono">
									<a href="/runs/{run.id}" class="dim-link">{getDimension(run.agentId)}</a>
								</td>
								<td><span class="badge badge-neutral">{run.instrument}</span></td>
								<td style="color: {rm && rm.totalReturn >= 0 ? 'var(--profit)' : 'var(--loss)'}">
									{rm ? formatPercent(rm.totalReturn) : '—'}
								</td>
								<td style="color: {rm && rm.sharpe >= 0 ? 'var(--profit)' : 'var(--loss)'}">
									{rm ? formatNumber(rm.sharpe) : '—'}
								</td>
								<td>{rm ? formatPercent(rm.winRate) : '—'}</td>
								<td style="color: {rm && rm.totalPnL >= 0 ? 'var(--profit)' : 'var(--loss)'}">
									{rm ? formatCurrency(rm.totalPnL) : '—'}
								</td>
								<td></td>
							</tr>
						{/each}
						{#if group.runs.length === 1}
							<tr class="dim-row">
								<td colspan="9" class="no-more-dims">Only one dimension in this behavior</td>
							</tr>
						{/if}
					{/if}
				{/each}
			</tbody>
		</table>
	</div>
{/if}

<style>
	.page-header {
		margin-bottom: 24px;
	}

	.page-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.5px;
		margin-bottom: 16px;
	}

	.mode-tabs {
		display: flex;
		gap: 4px;
		margin-bottom: 16px;
		border-bottom: 1px solid var(--border);
		padding-bottom: 0;
	}

	.mode-tab {
		padding: 8px 16px;
		background: none;
		border: none;
		border-bottom: 2px solid transparent;
		color: var(--text-dim);
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		display: flex;
		align-items: center;
		gap: 8px;
		margin-bottom: -1px;
	}

	.mode-tab:hover {
		color: var(--text);
	}

	.mode-tab.active {
		color: var(--accent);
		border-bottom-color: var(--accent);
	}

	.tab-count {
		font-size: 11px;
		background: var(--surface-hover);
		padding: 1px 6px;
		border-radius: 8px;
		color: var(--text-dim);
	}

	.mode-tab.active .tab-count {
		background: var(--accent);
		color: white;
	}

	.filters {
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}

	.sort-links {
		display: flex;
		gap: 4px;
		margin-left: auto;
	}

	.sort-link {
		font-size: 11px;
		padding: 4px 8px;
		border-radius: 4px;
		color: var(--text-dim);
		border: 1px solid transparent;
	}

	.sort-link:hover {
		color: var(--text);
		border-color: var(--border);
	}

	.sort-link.active {
		background: var(--accent);
		color: white;
		border-color: var(--accent);
	}

	.table-wrapper {
		overflow-x: auto;
	}

	.rank {
		font-weight: 700;
		color: var(--text-dim);
		width: 40px;
	}

	.behavior-row {
		cursor: pointer;
	}

	.behavior-row:hover td {
		background: var(--bg-card);
	}

	.behavior-row.expanded td {
		border-bottom-color: var(--border);
	}

	.behavior-name {
		font-size: 15px;
		font-weight: 700;
		color: var(--text);
	}

	.dim-name {
		font-size: 12px;
		color: var(--text-dim);
	}

	.dims-badge {
		font-size: 11px;
	}

	.dim-row td {
		background: var(--bg-card);
		border-bottom-color: rgba(39, 39, 42, 0.5);
		font-size: 12px;
	}

	.dim-row:last-of-type td {
		border-bottom-color: var(--border);
	}

	.dim-rank {
		font-weight: 500;
		font-size: 11px;
	}

	.dim-link {
		color: var(--text-dim);
		text-decoration: none;
	}

	.dim-link:hover {
		color: var(--accent);
	}

	.no-more-dims {
		text-align: center;
		color: var(--text-faint);
		font-size: 12px;
		font-style: italic;
	}
</style>
