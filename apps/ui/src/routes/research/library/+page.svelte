<script lang="ts">
	import { page } from '$app/state';

	let { data } = $props();

	let query = $state('');
	let topic = $state(page.url.searchParams.get('topic') ?? '');
	let kind = $state('');
	let savedOnly = $state(false);

	const kinds = $derived([...new Set(data.sources.map(s => s.kind ?? 'other'))].sort());
	const shown = $derived(
		data.sources
			.filter(s => !topic || s.topic === topic)
			.filter(s => !kind || (s.kind ?? 'other') === kind)
			.filter(s => !savedOnly || s.here)
			.filter(s => {
				const q = query.trim().toLowerCase();
				return !q || [s.id, s.title, s.authors, s.summary, String(s.year ?? '')].some(f => f?.toLowerCase().includes(q));
			})
			.sort((a, b) => a.topic.localeCompare(b.topic) || a.id.localeCompare(b.id, undefined, { numeric: true })),
	);
</script>

<header class="stack" style="gap: 6px">
	<h1>Library</h1>
	<p class="lede">
		Every source the research used. "Copy" opens the saved paper or page snapshot (kept on this server, not on GitHub);
		the link goes to the original.
	</p>
</header>

<div class="row">
	<input type="search" placeholder="Search title, author, summary…" bind:value={query} />
	<select bind:value={topic} aria-label="Topic">
		<option value="">All topics</option>
		{#each Object.entries(data.topicTitles) as [slug, title]}<option value={slug}>{title}</option>{/each}
	</select>
	<select bind:value={kind} aria-label="Kind">
		<option value="">All kinds</option>
		{#each kinds as k}<option value={k}>{k}</option>{/each}
	</select>
	<label class="secondary"><input type="checkbox" bind:checked={savedOnly} /> with a saved copy</label>
	<span class="muted">{shown.length} of {data.sources.length}</span>
</div>

<div class="table-wrap">
	<table class="data">
		<thead>
			<tr>
				<th>Id</th>
				<th>Source</th>
				<th>Kind</th>
				<th class="num">Year</th>
				<th>Copy</th>
			</tr>
		</thead>
		<tbody>
			{#each shown as s (s.id)}
				<tr id={s.id}>
					<td class="muted nowrap">{s.id}</td>
					<td>
						{#if s.url}<a href={s.url} rel="noopener" target="_blank">{s.title}</a>{:else}{s.title}{/if}
						{#if s.authors}<span class="muted"> — {s.authors}</span>{/if}
						{#if s.summary}<div class="secondary small">{s.summary}</div>{/if}
					</td>
					<td><span class="badge">{s.kind ?? 'other'}</span></td>
					<td class="num">{s.year ?? ''}</td>
					<td class="nowrap">
						{#if s.here}<a href="/research/{s.file}" target="_blank">{s.file?.split('.').pop()}</a>
						{:else if s.file}<span class="muted" title="Saved on the lab PC, not synced to the server yet">not synced</span>{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.small {
		font-size: 12px;
	}
	.nowrap {
		white-space: nowrap;
	}
	tr:target {
		background: var(--series-1-wash);
	}
	input[type='search'] {
		min-width: 260px;
	}
</style>
