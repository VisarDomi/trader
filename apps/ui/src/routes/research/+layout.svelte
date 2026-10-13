<script lang="ts">
	import { page } from '$app/state';

	let { data, children } = $props();

	const path = $derived(page.url.pathname);
</script>

<div class="stack">
	<nav class="research-nav row" aria-label="Research">
		<div class="pill-group">
			<a href="/research" class:active={path === '/research'}>Report</a>
			{#each data.topics as t (t.slug)}
				<a href="/research/{t.slug}" class:active={path === `/research/${t.slug}`}>{t.name}</a>
			{/each}
			<a href="/research/library" class:active={path === '/research/library'}>Library</a>
		</div>
	</nav>
	{@render children()}
</div>

<style>
	.research-nav .pill-group {
		flex-wrap: wrap;
	}
</style>
