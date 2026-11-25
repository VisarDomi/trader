<script lang="ts">
	let { data } = $props();
	let query = $state('');

	const matches = (item: (typeof data.catalog.all)[number]) => {
		const q = query.trim().toLowerCase();
		if (!q) return true;
		return `${item.name} ${item.id} ${item.verdict} ${item.tldr} ${item.instruments.join(' ')}`.toLowerCase().includes(q);
	};

	const guides = $derived(data.catalog.guides.filter(matches));
	const researched = $derived(data.catalog.researched.filter(matches));
	const queued = $derived(data.catalog.queued.filter(matches));
	const controls = $derived(data.catalog.controls.filter(matches));
	const totalStrategies = $derived(data.catalog.researched.length + data.catalog.queued.length);

	const toneClass = (tone: number | null) => (tone === 1 ? 'good' : tone === -1 ? 'bad' : tone === 0 ? 'warn' : '');
</script>

<header class="head">
	<div>
		<h1>Strategies</h1>
		<p class="secondary small">{data.catalog.researched.length} of {totalStrategies} strategies researched · SOTA plain-English hub</p>
	</div>
	<input class="search" type="search" placeholder="Filter strategies…" bind:value={query} />
</header>

{#if guides.length}
	<section class="group">
		<h2>Reference</h2>
		<div class="grid">
			{#each guides as item (item.id)}
				<a class="card item" href="/strategies/{item.id}">
					<div class="row">
						<h3>{item.name}</h3>
						<span class="pill {toneClass(item.verdictTone)}">{item.verdict}</span>
					</div>
					<p class="tldr">{item.tldr}</p>
				</a>
			{/each}
		</div>
	</section>
{/if}

{#if researched.length}
	<section class="group">
		<h2>SOTA researched · {researched.length}</h2>
		<div class="grid">
			{#each researched as item (item.id)}
				<a class="card item" href="/strategies/{item.id}">
					<div class="row">
						<h3>{item.name}</h3>
						<span class="pill {toneClass(item.verdictTone)}">{item.verdict}</span>
					</div>
					<p class="meta">
						{[item.timeframes.join('/'), item.instruments.length ? `${item.instruments.length} markets` : '', item.expectedEdge].filter(Boolean).join(' · ')}
					</p>
					<p class="tldr">{item.tldr}</p>
				</a>
			{/each}
		</div>
	</section>
{/if}

{#if queued.length}
	<section class="group">
		<h2>Queued for research · {queued.length}</h2>
		<div class="grid">
			{#each queued as item (item.id)}
				<a class="card item muted-card" href="/strategies/{item.id}">
					<div class="row">
						<h3>{item.name}</h3>
						<span class="pill">Queued</span>
					</div>
					<p class="meta">
						{[item.timeframes.join('/'), item.instruments.length ? `${item.instruments.length} markets` : '', item.variants.length > 1 ? `${item.variants.length} variants` : '', item.usesForecast ? 'TimesFM' : ''].filter(Boolean).join(' · ')}
					</p>
					<p class="tldr">{item.tldr}</p>
				</a>
			{/each}
		</div>
	</section>
{/if}

{#if controls.length}
	<section class="group">
		<h2>Controls &amp; baselines · {controls.length}</h2>
		<div class="grid">
			{#each controls as item (item.id)}
				<a class="card item muted-card" href="/strategies/{item.id}">
					<div class="row">
						<h3>{item.name}</h3>
						<span class="pill">{item.verdict}</span>
					</div>
					<p class="tldr">{item.tldr}</p>
				</a>
			{/each}
		</div>
	</section>
{/if}

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: flex-end;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 18px;
	}
	.small {
		font-size: 12.5px;
		margin-top: 4px;
	}
	.search {
		padding: 7px 11px;
		border-radius: 6px;
		border: 1px solid var(--hairline);
		background: var(--surface);
		color: var(--ink);
		font-size: 13px;
		min-width: 220px;
	}
	.group {
		margin-bottom: 24px;
	}
	.group h2 {
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--ink-2);
		margin-bottom: 10px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
		gap: 12px;
	}
	.item {
		display: flex;
		flex-direction: column;
		gap: 6px;
		text-decoration: none;
		color: inherit;
	}
	.item:hover {
		border-color: var(--baseline);
	}
	.row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 8px;
	}
	.item h3 {
		font-size: 15px;
		margin: 0;
	}
	.meta {
		font-size: 12px;
		color: var(--ink-2);
		margin: 0;
	}
	.tldr {
		font-size: 13px;
		color: var(--ink-2);
		margin: 0;
		line-height: 1.45;
	}
	.pill {
		flex-shrink: 0;
		font-size: 11px;
		font-weight: 600;
		padding: 2px 7px;
		border-radius: 999px;
		background: var(--surface-2);
		color: var(--ink-2);
	}
	.pill.good {
		color: var(--pos, #16a34a);
	}
	.pill.bad {
		color: var(--neg, #dc2626);
	}
	.pill.warn {
		color: var(--warn, #d97706);
	}
</style>
