<script lang="ts">
	import { formatCurrency, formatPercent, formatNumber, formatDate, formatDuration } from '$lib/utils/format';
	import MetricsGrid from '$lib/components/MetricsGrid.svelte';
	import EquityChart from '$lib/components/EquityChart.svelte';
	import FillsTable from '$lib/components/FillsTable.svelte';

	let { data } = $props();

	let stopping = $state(false);
</script>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else if data.run}
	{@const run = data.run}
	{@const m = run.metrics}

	<div class="page-header">
		<div class="header-row">
			<div>
				<h1>{run.agentName}</h1>
				<p class="subtitle">
					<span class="badge" class:badge-profit={run.status === 'completed'} class:badge-running={run.status === 'running'} class:badge-loss={run.status === 'error'} class:badge-neutral={!['completed','running','error'].includes(run.status)}>
						{run.status}
					</span>
					<span class="badge badge-neutral">{run.mode}</span>
					<span class="badge badge-neutral">{run.instrument}</span>
					{#if run.startedAt}
						<span class="meta-text">{formatDate(run.startedAt)}</span>
					{/if}
				</p>
			</div>
			<div class="header-actions">
				<a href="/agents/{run.agentId}" class="btn">View Agent</a>
				{#if run.status === 'running'}
					<form method="POST" action="?/stop">
						<button type="submit" class="btn btn-danger" disabled={stopping} onclick={() => stopping = true}>
							{stopping ? 'Stopping...' : 'Stop Run'}
						</button>
					</form>
				{/if}
			</div>
		</div>
	</div>

	<!-- Metrics Grid -->
	{#if m}
		<MetricsGrid metrics={m} capital={run.capital} />
	{/if}

	<!-- Equity Chart -->
	{#if data.equityCurve.length > 0}
		<div class="section">
			<h2 class="section-title">Equity Curve</h2>
			<div class="chart-wrapper card">
				<EquityChart data={data.equityCurve} />
			</div>
		</div>
	{/if}

	<!-- Fills Table -->
	{#if data.fills.length > 0}
		<div class="section">
			<h2 class="section-title">Trades ({data.fills.length} fills)</h2>
			<FillsTable fills={data.fills} />
		</div>
	{:else}
		<div class="empty-state">No trades recorded for this run.</div>
	{/if}

	<!-- Run Config -->
	<div class="section">
		<h2 class="section-title">Run Configuration</h2>
		<div class="card config-details">
			<div class="config-grid">
				<div class="config-item">
					<span class="config-label">Capital</span>
					<span class="config-value">{formatCurrency(run.capital)}</span>
				</div>
				<div class="config-item">
					<span class="config-label">Run ID</span>
					<span class="config-value mono">{run.id}</span>
				</div>
				{#if run.startedAt && run.completedAt}
					<div class="config-item">
						<span class="config-label">Duration</span>
						<span class="config-value">{formatDuration(run.completedAt - run.startedAt)}</span>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	.page-header { margin-bottom: 24px; }

	.header-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
	}

	h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.5px;
	}

	.subtitle {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		flex-wrap: wrap;
	}

	.meta-text {
		font-size: 12px;
		color: var(--text-dim);
	}

	.header-actions {
		display: flex;
		gap: 8px;
		flex-shrink: 0;
	}

	.section {
		margin-bottom: 32px;
	}

	.section-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.chart-wrapper {
		height: 350px;
		padding: 0;
		overflow: hidden;
	}

	.config-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
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
		font-weight: 500;
		word-break: break-all;
	}

	.config-details { margin-bottom: 32px; }
</style>
