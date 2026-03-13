<script lang="ts">
	import { groupAgentsByBehavior, getDimension } from '$lib/utils/grouping';
	import type { AgentSummary } from '@trader/shared';

	let { data } = $props();

	let search = $state('');
	let expanded = $state<Set<string>>(new Set());

	function toggleExpand(behavior: string) {
		const next = new Set(expanded);
		if (next.has(behavior)) next.delete(behavior);
		else next.add(behavior);
		expanded = next;
	}

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

	let groups = $derived(groupAgentsByBehavior(filtered));
</script>

<div class="page-header">
	<h1>Agents</h1>
	<div class="filters">
		<input type="text" bind:value={search} placeholder="Search behaviors or dimensions..." class="search-input" />
		<span class="count">{filtered.length} agents in {groups.length} behaviors</span>
	</div>
</div>

{#if data.error}
	<div class="error-state">{data.error}</div>
{:else if groups.length === 0}
	<div class="empty-state">No agents found.</div>
{:else}
	<div class="behavior-grid">
		{#each groups as group}
			{@const isExpanded = expanded.has(group.behavior)}
			<div class="card behavior-card" class:expanded={isExpanded}>
				<button class="behavior-header" onclick={() => toggleExpand(group.behavior)}>
					<div class="behavior-top">
						<span class="behavior-name">{group.behavior}</span>
						<div class="behavior-badges">
							{#each group.instruments as inst}
								<span class="badge badge-neutral">{inst}</span>
							{/each}
						</div>
					</div>
					<div class="behavior-meta">
						<span class="dim-count">{group.agents.length} dimensions</span>
						<span class="feeds">{group.feeds.join(', ')}</span>
					</div>
				</button>

				{#if isExpanded}
					<div class="dim-table-wrap">
						<table class="dim-table">
							<thead>
								<tr>
									<th>Dimension</th>
									<th>Name</th>
									<th>Feed</th>
									<th>Max DD</th>
									<th></th>
								</tr>
							</thead>
							<tbody>
								{#each group.agents as agent}
									<tr>
										<td class="mono dim-id">{getDimension(agent.id)}</td>
										<td>{agent.config.name}</td>
										<td>{agent.config.primaryFeed}</td>
										<td>{agent.config.maxDrawdown != null ? `${(agent.config.maxDrawdown * 100).toFixed(0)}%` : '—'}</td>
										<td>
											<a href="/agents/{agent.id}" class="dim-arrow">→</a>
										</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
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
		width: 320px;
	}

	.count {
		font-size: 13px;
		color: var(--text-dim);
	}

	.behavior-grid {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}

	.behavior-card {
		padding: 0;
		overflow: hidden;
	}

	.behavior-card.expanded {
		border-color: var(--border-hover);
	}

	.behavior-header {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 20px;
		background: none;
		border: none;
		cursor: pointer;
		text-align: left;
		color: var(--text);
	}

	.behavior-header:hover {
		background: var(--bg-card-hover);
	}

	.behavior-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.behavior-name {
		font-size: 18px;
		font-weight: 700;
	}

	.behavior-badges {
		display: flex;
		gap: 6px;
	}

	.behavior-meta {
		display: flex;
		align-items: center;
		gap: 16px;
	}

	.dim-count {
		font-size: 13px;
		font-weight: 600;
		color: var(--accent);
	}

	.feeds {
		font-size: 12px;
		color: var(--text-dim);
		font-family: 'SF Mono', Consolas, 'Liberation Mono', Menlo, monospace;
	}

	.dim-table-wrap {
		border-top: 1px solid var(--border);
		overflow-x: auto;
	}

	.dim-table {
		width: 100%;
		font-size: 13px;
	}

	.dim-table th {
		background: var(--bg-elevated);
	}

	.dim-table td {
		padding: 8px 12px;
	}

	.dim-id {
		font-size: 12px;
		color: var(--text-dim);
	}

	.dim-arrow {
		color: var(--text-faint);
		text-decoration: none;
		font-size: 14px;
	}

	.dim-arrow:hover {
		color: var(--accent);
	}
</style>
