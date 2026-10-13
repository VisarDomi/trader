<script lang="ts">
	let { data } = $props();
</script>

<header class="stack" style="gap: 6px">
	<h1>{data.title}</h1>
	<p class="secondary small">
		{data.sources.length} sources · {data.sources.filter(s => s.here).length} saved copies ·
		<a href="/research/library?topic={data.slug}">in the library</a>
	</p>
</header>

<article class="card prose">{@html data.html}</article>

<style>
	.small {
		font-size: 12px;
	}
</style>
