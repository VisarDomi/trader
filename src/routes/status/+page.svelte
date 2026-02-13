<script lang="ts">
	import { formatNumber } from '$lib/utils/format';

	let { data } = $props();

	const instrumentList = Object.entries(data.instruments);
</script>

<div class="page-header">
	<h1>System Status</h1>
</div>

<div class="status-cards">
	<div class="card status-card">
		<h2>Backend</h2>
		{#if data.health}
			<div class="status-row">
				<span class="status-dot ok"></span>
				<span class="status-text">Connected</span>
			</div>
			<div class="detail">Status: {data.health.status}</div>
			<div class="detail">Timestamp: {new Date(data.health.timestamp).toLocaleString()}</div>
		{:else}
			<div class="status-row">
				<span class="status-dot error"></span>
				<span class="status-text">Disconnected</span>
			</div>
			{#if data.error}
				<div class="detail error-text">{data.error}</div>
			{/if}
		{/if}
		<div class="detail">URL: <code>{data.backendUrl}</code></div>
	</div>

	<div class="card status-card">
		<h2>Connection</h2>
		<div class="detail">API calls are proxied server-side through the SvelteKit backend.</div>
		<div class="detail">The trader-backend is never directly exposed to the internet.</div>
	</div>
</div>

{#if instrumentList.length > 0}
	<h2 class="section-title">Instruments ({instrumentList.length})</h2>
	<table>
		<thead>
			<tr>
				<th>Epic</th>
				<th>Category</th>
				<th>Leverage</th>
				<th>Spread</th>
				<th>Min Size</th>
				<th>Max Size</th>
				<th>Precision</th>
				<th>Timezone</th>
			</tr>
		</thead>
		<tbody>
			{#each instrumentList as [epic, info]}
				<tr>
					<td><strong>{epic}</strong></td>
					<td>{info.category ?? '—'}</td>
					<td>{info.leverage}x</td>
					<td>{formatNumber(info.spread)}</td>
					<td>{info.minSize}</td>
					<td>{info.maxSize}</td>
					<td>{info.pricePrecision}</td>
					<td class="mono">{info.tradingHours.timezone}</td>
				</tr>
			{/each}
		</tbody>
	</table>
{/if}

<style>
	.page-header h1 {
		font-size: 24px;
		font-weight: 700;
		letter-spacing: -0.5px;
		margin-bottom: 24px;
	}

	.status-cards {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 14px;
		margin-bottom: 32px;
	}

	.status-card h2 {
		font-size: 14px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 12px;
	}

	.status-row {
		display: flex;
		align-items: center;
		margin-bottom: 8px;
	}

	.status-text {
		font-size: 16px;
		font-weight: 600;
	}

	.detail {
		font-size: 12px;
		color: var(--text-dim);
		margin-top: 4px;
	}

	.error-text { color: var(--loss); }

	code {
		background: var(--bg);
		padding: 2px 6px;
		border-radius: 4px;
		font-size: 12px;
	}

	.section-title {
		font-size: 16px;
		font-weight: 600;
		color: var(--text-muted);
		margin-bottom: 16px;
	}
</style>
