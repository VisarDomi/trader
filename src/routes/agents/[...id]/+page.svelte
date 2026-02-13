<script lang="ts">
	import { formatCurrency, formatPercent, formatDate } from '$lib/utils/format';

	let { data } = $props();
</script>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else if data.agent}
	<div class="page-header">
		<div class="header-row">
			<h1>{data.agent.config.name}</h1>
			<a href="/runs/new?agentId={data.agent.id}" class="btn btn-primary">New Run</a>
		</div>
		<p class="subtitle mono">{data.agent.id}</p>
	</div>

	<div class="config-card card">
		<h2>Configuration</h2>
		<div class="config-grid">
			<div class="config-item">
				<span class="config-label">Version</span>
				<span class="config-value">{data.agent.config.version}</span>
			</div>
			<div class="config-item">
				<span class="config-label">Instrument</span>
				<span class="config-value">{data.agent.config.instrument}</span>
			</div>
			<div class="config-item">
				<span class="config-label">Primary Feed</span>
				<span class="config-value">{data.agent.config.primaryFeed}</span>
			</div>
			{#if data.agent.config.secondaryFeeds?.length}
				<div class="config-item">
					<span class="config-label">Secondary Feeds</span>
					<span class="config-value">{data.agent.config.secondaryFeeds.join(', ')}</span>
				</div>
			{/if}
			{#if data.agent.config.maxDrawdown}
				<div class="config-item">
					<span class="config-label">Max Drawdown</span>
					<span class="config-value">{formatPercent(data.agent.config.maxDrawdown)}</span>
				</div>
			{/if}
			{#if data.agent.config.maxPositionSize}
				<div class="config-item">
					<span class="config-label">Max Position</span>
					<span class="config-value">{data.agent.config.maxPositionSize}</span>
				</div>
			{/if}
		</div>
	</div>

	<h2 class="section-title">Runs ({data.runs.length})</h2>

	{#if data.runs.length === 0}
		<div class="empty-state">No runs yet for this agent.</div>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Status</th>
					<th>Mode</th>
					<th>Capital</th>
					<th>Return</th>
					<th>PnL</th>
					<th>Trades</th>
					<th>Started</th>
				</tr>
			</thead>
			<tbody>
				{#each data.runs as run}
					{@const m = run.metrics}
					<tr>
						<td>
							<a href="/runs/{run.id}" class="run-link">
								<span class="badge" class:badge-profit={run.status === 'completed'} class:badge-running={run.status === 'running'} class:badge-loss={run.status === 'error'} class:badge-neutral={!['completed','running','error'].includes(run.status)}>
									{run.status}
								</span>
							</a>
						</td>
						<td>{run.mode}</td>
						<td>{formatCurrency(run.capital)}</td>
						<td style="color: {m && m.totalReturn >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatPercent(m.totalReturn) : '—'}
						</td>
						<td style="color: {m && m.totalPnL >= 0 ? 'var(--profit)' : 'var(--loss)'}">
							{m ? formatCurrency(m.totalPnL) : '—'}
						</td>
						<td>{m ? m.totalTrades : '—'}</td>
						<td class="mono">{run.startedAt ? formatDate(run.startedAt) : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
{/if}

<style>
	.page-header { margin-bottom: 24px; }

	.header-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
	}

	h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}

	.subtitle {
		font-size: 13px;
		color: var(--text-dim);
		margin-top: 4px;
	}

	.config-card {
		margin-bottom: 32px;
	}

	.config-card h2 {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.config-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
		gap: 12px;
	}

	.config-item {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}

	.config-label {
		font-size: 11px;
		color: var(--text-dim);
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.config-value {
		font-size: 14px;
		font-weight: 600;
	}

	.section-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 16px;
	}

	.run-link { text-decoration: none; }
</style>
