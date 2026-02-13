<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber } from '$lib/utils/format';
	import type { RunRecord } from '$lib/types';

	let { data } = $props();

	const sortOptions = [
		{ value: 'totalReturn', label: 'Return' },
		{ value: 'sharpe', label: 'Sharpe' },
		{ value: 'winRate', label: 'Win Rate' },
		{ value: 'totalPnL', label: 'PnL' },
		{ value: 'profitFactor', label: 'Profit Factor' },
		{ value: 'maxDrawdown', label: 'Drawdown' },
		{ value: 'totalTrades', label: 'Trades' },
	];

	let filterInstrument = $state('');
	let filterMode = $state('');

	let filtered = $derived(
		data.leaderboard.filter((r: RunRecord) => {
			if (filterInstrument && r.instrument !== filterInstrument) return false;
			if (filterMode && r.mode !== filterMode) return false;
			return true;
		})
	);

	let instruments = $derived([...new Set(data.leaderboard.map((r: RunRecord) => r.instrument))]);
</script>

<div class="page-header">
	<h1>Leaderboard</h1>
	<div class="filters">
		<select bind:value={filterInstrument}>
			<option value="">All instruments</option>
			{#each instruments as inst}
				<option value={inst}>{inst}</option>
			{/each}
		</select>
		<select bind:value={filterMode}>
			<option value="">All modes</option>
			<option value="backtest">Backtest</option>
			<option value="paper">Paper</option>
			<option value="live">Live</option>
		</select>
		<div class="sort-links">
			{#each sortOptions as opt}
				<a
					href="/?sortBy={opt.value}"
					class="sort-link"
					class:active={data.sortBy === opt.value}
				>{opt.label}</a>
			{/each}
		</div>
	</div>
</div>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else if filtered.length === 0}
	<div class="empty-state">No completed runs yet. Start a backtest to see results here.</div>
{:else}
	<div class="table-wrapper">
		<table>
			<thead>
				<tr>
					<th>#</th>
					<th>Agent</th>
					<th>Instrument</th>
					<th>Mode</th>
					<th>Return</th>
					<th>Win Rate</th>
					<th>Sharpe</th>
					<th>Drawdown</th>
					<th>PF</th>
					<th>Trades</th>
					<th>PnL</th>
				</tr>
			</thead>
			<tbody>
				{#each filtered as run, i}
					{@const m = run.metrics}
					<tr>
						<td class="rank">{i + 1}</td>
						<td>
							<a href="/runs/{run.id}" class="agent-link">
								<span class="agent-name">{run.agentName}</span>
							</a>
						</td>
						<td><span class="badge badge-neutral">{run.instrument}</span></td>
						<td><span class="badge badge-neutral">{run.mode}</span></td>
						<td style="color: {m && m.totalReturn >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatPercent(m.totalReturn) : '—'}
						</td>
						<td>{m ? formatPercent(m.winRate) : '—'}</td>
						<td style="color: {m && m.sharpe >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatNumber(m.sharpe) : '—'}
						</td>
						<td style="color: var(--loss)">
							{m ? formatPercent(m.maxDrawdown) : '—'}
						</td>
						<td>{m ? formatNumber(m.profitFactor) : '—'}</td>
						<td>{m ? m.totalTrades : '—'}</td>
						<td style="color: {m && m.totalPnL >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatCurrency(m.totalPnL) : '—'}
						</td>
					</tr>
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

	.agent-link {
		text-decoration: none;
	}

	.agent-name {
		font-weight: 600;
		color: var(--text);
	}

	.agent-link:hover .agent-name {
		color: var(--accent);
	}
</style>
