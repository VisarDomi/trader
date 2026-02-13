<script lang="ts">
	import type { AgentSummary } from '$lib/types';

	let { data } = $props();

	let search = $state('');

	let filtered = $derived(
		data.agents.filter((a: AgentSummary) => {
			if (!search) return true;
			const q = search.toLowerCase();
			return (
				a.config.name.toLowerCase().includes(q) ||
				a.id.toLowerCase().includes(q) ||
				a.config.instrument.toLowerCase().includes(q)
			);
		})
	);
</script>

<div class="page-header">
	<h1>Agents</h1>
	<div class="filters">
		<input type="text" bind:value={search} placeholder="Search agents..." class="search-input" />
		<span class="count">{filtered.length} agents</span>
	</div>
</div>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else if filtered.length === 0}
	<div class="empty-state">No agents found.</div>
{:else}
	<div class="agent-grid">
		{#each filtered as agent}
			<a href="/agents/{agent.id}" class="card agent-card">
				<div class="agent-header">
					<span class="agent-name">{agent.config.name}</span>
					<span class="badge badge-neutral">v{agent.config.version}</span>
				</div>
				<div class="agent-meta">
					<div class="meta-row">
						<span class="meta-label">Instrument</span>
						<span class="meta-value">{agent.config.instrument}</span>
					</div>
					<div class="meta-row">
						<span class="meta-label">Feed</span>
						<span class="meta-value">{agent.config.primaryFeed}</span>
					</div>
					{#if agent.config.secondaryFeeds?.length}
						<div class="meta-row">
							<span class="meta-label">Secondary</span>
							<span class="meta-value">{agent.config.secondaryFeeds.join(', ')}</span>
						</div>
					{/if}
				</div>
				<div class="agent-id mono">{agent.id}</div>
			</a>
		{/each}
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
	}

	.search-input {
		width: 280px;
	}

	.count {
		font-size: 13px;
		color: var(--text-dim);
	}

	.agent-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 14px;
	}

	.agent-card {
		text-decoration: none;
		color: var(--text);
		transition: all 0.2s;
	}

	.agent-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
	}

	.agent-name {
		font-size: 15px;
		font-weight: 600;
	}

	.agent-meta {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}

	.meta-row {
		display: flex;
		justify-content: space-between;
		font-size: 13px;
	}

	.meta-label { color: var(--text-dim); }
	.meta-value { color: var(--text-muted); }

	.agent-id {
		font-size: 11px;
		color: var(--text-faint);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
