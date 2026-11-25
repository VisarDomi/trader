<script lang="ts">
	import type { RunSummary } from '@trader/shared';
	import { CONTROL_SLUGS, median, num, pct, sign } from '$lib/format';
  import {page} from '$app/state';
  import {replaceState} from '$app/navigation';
  import {untrack} from 'svelte';
  import type {Snapshot} from '@sveltejs/kit';
  import {matchesAgentQuery} from '$lib/leaderboard-state';

	let { data } = $props();
	let query = $state(page.url.searchParams.get('q')??'');
  export const snapshot:Snapshot<string>={capture:()=>query,restore:value=>query=value};
  $effect(()=>{const q=query;untrack(()=>{const u=new URL(page.url);if(q)u.searchParams.set('q',q);else u.searchParams.delete('q');if(u.href!==page.url.href)replaceState(u,page.state)})});

	const sections = $derived.by(() => {
		const by = new Map<string, typeof data.agents>();
		for (const a of data.agents.filter(a => a.active)) by.set(a.slug, [...(by.get(a.slug) ?? []), a]);
		const matched = [...by.entries()]
			.filter(([slug, list]) => matchesAgentQuery(slug, `${list[0]!.name} ${list[0]!.description}`, query))
			.sort(([a], [b]) => a.localeCompare(b));
		return data.categories
			.map(cat => ({
				...cat,
				groups: matched.filter(([, list]) => list[0]!.category === cat.id),
			}))
			.filter(section => section.groups.length > 0);
	});

	function familyTitle(name: string): string {
		return name.split(' · ')[0]!.replace(/ \(.*\)$/, '');
	}

	function variantLabel(v: { name: string; variant?: string | null }): string {
		if (v.name.includes(' · ')) return v.name.split(' · ').slice(1).join(' · ');
		return v.variant ?? 'default';
	}

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
	<header class="row" style="justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 10px">
		<h1>Agents</h1>
		<div class="row" style="gap: 10px; font-size: 13px">
			<a href="/strategies/sharpe-guide">Sharpe &amp; Trust guide</a>
			{#if data.researchedCount}<span class="muted">· {data.researchedCount} SOTA briefs attached</span>{/if}
		</div>
	</header>
	{#if data.error}<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>{/if}
	<input type="search" placeholder="Search agents" bind:value={query} style="max-width: 320px" />

	{#each sections as section (section.id)}
		<section class="stack" style="gap: 10px">
			<h2 style="margin: 8px 0 0; font-size: 16px">{section.title} <span class="muted">({section.groups.reduce((n, [, list]) => n + list.length, 0)})</span></h2>
			<div class="grid">
				{#each section.groups as [slug, variants] (slug)}
					{@const brief = data.briefs[slug]}
					<article class="card">
						<div class="row" style="justify-content: space-between">
							<h3>{familyTitle(variants[0]!.name)}</h3>
							<div class="row" style="gap: 4px; flex-wrap: wrap; justify-content: flex-end">
								{#if brief}<a class="badge" href="/strategies/{brief.id}">SOTA: {brief.verdict}</a>{/if}
								<span class="badge">{variants[0]!.timeframe}</span>
								{#if variants[0]!.usesForecast}<span class="badge">TimesFM</span>{/if}
								{#if CONTROL_SLUGS.has(slug)}<span class="badge">control</span>{/if}
							</div>
						</div>
						<p class="secondary desc">{variants[0]!.description}</p>
						{#if brief}<p class="small"><a href="/strategies/{brief.id}">Read SOTA brief →</a></p>{/if}
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
										<td><a href="/agents/{v.id}">{variantLabel(v)}</a></td>
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
		</section>
	{/each}
</div>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr));
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
