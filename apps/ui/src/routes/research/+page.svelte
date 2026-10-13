<script lang="ts">
	let { data } = $props();
</script>

<header class="stack" style="gap: 6px">
	<h1>Research</h1>
	<p class="lede">
		What others have found about trading strategies, leverage, costs and AI agents, read with this arena in mind: what
		could run here, on which account, and what the platform would need. Each topic has its own note; the library holds
		every source, with a saved copy where one could be kept.
	</p>
	<p class="secondary small">
		{data.topics.length} topics · {data.counts.sources} sources · {data.counts.filesHere} of {data.counts.files} saved copies on
		this server
	</p>
</header>

{#if data.html}
	<article class="card prose">{@html data.html}</article>
{:else}
	<div class="card muted">The report is being written.</div>
{/if}

{#if data.topics.length}
	<section class="topics">
		{#each data.topics as t (t.slug)}
			<a class="card topic" href="/research/{t.slug}">
				<h2>{t.title}</h2>
				<ul>
					{#each t.inShort.slice(0, 4) as b}<li>{@html b}</li>{/each}
				</ul>
				{#if t.inShort.length > 4}<span class="muted small">+ {t.inShort.length - 4} more</span>{/if}
			</a>
		{/each}
	</section>
{/if}

<style>
	.small {
		font-size: 12px;
	}
	.topics {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
		gap: 12px;
	}
	.topic {
		text-decoration: none;
		display: block;
	}
	.topic:hover {
		border-color: var(--baseline);
	}
	.topic ul {
		padding-left: 18px;
		color: var(--ink-2);
		font-size: 13px;
	}
	.topic li {
		margin: 3px 0;
	}
	/* Links inside a card link would nest: show them as text. */
	.topic :global(a) {
		pointer-events: none;
		text-decoration: none;
	}
</style>
