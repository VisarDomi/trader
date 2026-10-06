<script lang="ts">
	import type { RunSummary } from '@trader/shared';
	import { CONTROL_SLUGS, median, num, pct, sign } from '$lib/format';

	let { data } = $props();
	let query = $state('');

	const groups = $derived.by(() => {
		const by = new Map<string, typeof data.agents>();
		for (const a of data.agents.filter(a => a.active)) by.set(a.slug, [...(by.get(a.slug) ?? []), a]);
		return [...by.entries()]
			.filter(([slug, list]) => !query || `${slug} ${list[0]!.name} ${list[0]!.description}`.toLowerCase().includes(query.toLowerCase()))
			.sort(([a], [b]) => a.localeCompare(b));
	});

	function summary(runs: RunSummary[]) {
		const ms = runs.map(r => r.metrics).filter(m => m !== null);
		return {
			profitable: ms.filter(m => m!.totalReturn > 0).length,
			n: runs.length,
			sharpe: median(ms.map(m => m!.sharpe)),
			avg: ms.length ? ms.reduce((s, m) => s + m!.totalReturn, 0) / ms.length : NaN,
			trades: ms.reduce((s, m) => s + m!.trades, 0),
		};
	}
</script>

<div class="stack">
	<header class="stack" style="gap: 6px">
		<h1>Agents</h1>
		<p class="lede">
			Each agent is one file in <code>apps/backend/agents/</code>. Variants are separate agents with different parameters.
			To add one, follow <code>apps/backend/agents/GUIDE.md</code>.
		</p>
	</header>
	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}
	<input type="search" placeholder="Search agents" bind:value={query} style="max-width: 320px" />

	<div class="grid">
		{#each groups as [slug, variants] (slug)}
			<article class="card">
				<div class="row" style="justify-content: space-between">
					<h3>{variants[0]!.name.replace(/ \(.*\)$/, '')}</h3>
					<div class="row" style="gap: 4px">
						<span class="badge">{variants[0]!.timeframe}</span>
						{#if variants[0]!.usesForecast}<span class="badge">TimesFM</span>{/if}
						{#if CONTROL_SLUGS.has(slug)}<span class="badge">control</span>{/if}
					</div>
				</div>
				<p class="secondary desc">{variants[0]!.description}</p>
				<p class="muted small">{variants[0]!.instruments.join(' · ')}</p>
				<table class="data small">
					<thead>
						<tr><th>Variant</th><th class="num">Demo trades</th><th class="num">Demo avg</th><th class="num">BT profitable</th><th class="num">BT med. Sharpe</th></tr>
					</thead>
					<tbody>
						{#each variants as v (v.id)}
							{@const d = summary(v.demo)}
							{@const b = summary(v.backtest)}
							<tr>
								<td><a href="/agents/{v.id}">{v.variant ?? 'default'}</a></td>
								<td class="num">{d.trades}</td>
								<td class="num {sign(d.avg)}">{d.trades ? pct(d.avg) : '—'}</td>
								<td class="num">{b.n ? `${b.profitable}/${b.n}` : '—'}</td>
								<td class="num">{b.n ? num(b.sharpe) : '—'}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</article>
		{/each}
	</div>
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
		gap: 12px;
	}
	.desc {
		margin: 6px 0 4px;
		font-size: 13px;
	}
	.small {
		font-size: 12px;
	}
	table.small {
		margin-top: 8px;
	}
	table.small th {
		position: static;
	}
</style>
