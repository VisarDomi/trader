<script lang="ts">
	let { data } = $props();
	const item = $derived(data.item);
	const toneClass = (tone: number | null) => (tone === 1 ? 'good' : tone === -1 ? 'bad' : tone === 0 ? 'warn' : '');
</script>

<p class="back"><a href="/agents">← Agents</a></p>

<header class="card summary">
	<div class="top">
		<h1>{item.name}</h1>
		<span class="pill {toneClass(item.verdictTone)}">{item.verdict}</span>
	</div>
	<p class="tldr">{item.tldr}</p>
	<div class="stats">
		<div><span class="k">SOTA verdict</span><strong class={toneClass(item.verdictTone)}>{item.verdict}</strong></div>
		{#if item.bestFit}<div><span class="k">Best fit</span><strong>{item.bestFit}</strong></div>{/if}
		{#if item.expectedEdge}<div><span class="k">Expected edge</span><strong>{item.expectedEdge}</strong></div>{/if}
	</div>
</header>

<div class="stack">
	{#each data.sections as sec (sec.title)}
		<article class="card prose">
			<h2>{sec.title}</h2>
			{@html sec.html}
		</article>
	{/each}

	{#if item.variants.length}
		<section class="card">
			<h2>Active in Trader ({item.variants.length})</h2>
			<ul class="links">
				{#each item.variants as v (v.id)}
					<li>
						<a href="/agents/{v.id}">{v.name}</a>
						<span class="meta">{v.timeframe} · {v.instruments.join(', ')}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if item.sources.length}
		<section class="card">
			<h2>Key sources</h2>
			<ul class="links">
				{#each item.sources as s (s.url)}
					<li><a href={s.url} target="_blank" rel="noopener">{s.title}</a></li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

<style>
	.back {
		margin-bottom: 12px;
		font-size: 13px;
	}
	.summary {
		margin-bottom: 14px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		flex-wrap: wrap;
	}
	.top h1 {
		margin: 0;
	}
	.tldr {
		margin: 0;
		color: var(--ink-2);
		font-size: 14px;
		line-height: 1.5;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
		padding-top: 8px;
		border-top: 1px solid var(--hairline);
	}
	.stats div {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.k {
		font-size: 11px;
		color: var(--ink-2);
	}
	.stack {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.links {
		list-style: none;
		padding: 0;
		margin: 8px 0 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.links li {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.meta {
		font-size: 12px;
		color: var(--ink-2);
	}
	.pill {
		font-size: 11.5px;
		font-weight: 600;
		padding: 3px 8px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.good {
		color: var(--pos, #16a34a);
	}
	.bad {
		color: var(--neg, #dc2626);
	}
	.warn {
		color: var(--warn, #d97706);
	}
</style>
