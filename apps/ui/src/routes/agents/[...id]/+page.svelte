<script lang="ts">
	import type { RunSummary } from '@trader/shared';
	import { day, num, pct, pctPlain, sign, utc } from '$lib/format';
	import { page } from '$app/state';
    import ValueBars from '$lib/components/ValueBars.svelte';
	import { goto } from '$app/navigation';

	let { data } = $props();
	const agent = $derived(data.agent);

	const byEpic = $derived.by(() => {
		const rows = new Map<string, { demo?: RunSummary; retired: RunSummary[]; backtest?: RunSummary }>();

		for (const r of agent.runs) {
			const key=`${r.epic} · ${r.leverage===null?'legacy':'1:'+r.leverage}`;
            const row = rows.get(key) ?? { retired: [] };
			if (r.kind === 'backtest') {
				if (r.status !== 'retired' && r.codeHash === agent.codeHash && (!row.backtest || r.updatedAt > row.backtest.updatedAt)) row.backtest = r;
			}
			else if (r.status === 'retired') row.retired.push(r);
			else row.demo = r;
			rows.set(key, row);
		}
		return [...rows.entries()];
	});

	const shownVersion = $derived(agent.versions.find(v => v.code_hash === page.url.searchParams.get('version')) ?? agent.versions[0]);
</script>

<div class="stack">
	<header class="stack" style="gap: 6px">
		<div class="muted"><a href="/agents">Agents</a> / {agent.slug}</div>
		<h1>{agent.name}</h1>
		<p class="lede">{agent.description}</p>
		<div class="row" style="gap: 6px">
			<span class="badge">{agent.timeframe}</span>
			{#if agent.usesForecast}<span class="badge">TimesFM forecast</span>{/if}
			<span class="badge">code {agent.codeHash}</span>
			{#if agent.author}<span class="badge">by {agent.author}</span>{/if}
			<span class="muted" style="font-size: 12px">first seen {day(agent.firstSeen)}</span>
		</div>
	</header>

    <section class="card"><h2>Virtual return by market</h2><ValueBars height={460} items={agent.runs.filter(r=>r.kind==='demo'&&r.status!=='retired'&&r.metrics).map(r=>({label:`${r.epic} · 1:${r.leverage}`,value:r.metrics!.totalReturn*100,href:`/runs/${encodeURIComponent(r.id)}`}))}/></section>
	<section class="card">
		<h2>Virtual / backtest results</h2>
		<div class="table-wrap" style="max-height: none">
			<table class="data">
				<thead>
					<tr>
						<th>Instrument</th>
						<th class="num">Virtual days</th><th class="num">Virtual trades</th><th class="num">Virtual return</th><th class="num">Virtual Sharpe</th>
						<th class="num">BT trades</th><th class="num">BT annual</th><th class="num">BT max DD</th><th class="num">BT Sharpe</th><th class="num">BT months +</th>
					</tr>
				</thead>
				<tbody>
					{#each byEpic as [epic, row]}
						{@const d = row.demo?.metrics}
						{@const b = row.backtest?.metrics}
						<tr>
							<td>{epic}</td>
							<td class="num">{row.demo ? num(d?.days, 1) : '—'}</td>
							<td class="num">{row.demo ? (d?.trades ?? 0) : '—'}</td>
							<td class="num {sign(d?.totalReturn)}">
								{#if row.demo}<a href="/runs/{encodeURIComponent(row.demo.id)}">{pct(d?.totalReturn)}</a>{:else}—{/if}
							</td>
							<td class="num">{num(d?.sharpe)}</td>
							<td class="num">{b?.trades ?? '—'}</td>
							<td class="num {sign(b?.annualReturn)}">
								{#if row.backtest}<a href="/runs/{encodeURIComponent(row.backtest.id)}">{pct(b?.annualReturn)}</a>{:else}—{/if}
							</td>
							<td class="num">{pctPlain(b?.maxDrawdown)}</td>
							<td class="num">{num(b?.sharpe)}{#if row.backtest && row.backtest.codeHash !== agent.codeHash}<span class="muted" title="Backtest of an older version"> *</span>{/if}</td>
							<td class="num">{b ? `${b.profitableMonths}/${b.totalMonths}` : '—'}</td>
						</tr>
						{#each row.retired as old}
							<tr class="retired">
								<td class="muted">↳ retired {old.codeHash}</td>
								<td class="num">{num(old.metrics?.days, 1)}</td>
								<td class="num">{old.metrics?.trades ?? 0}</td>
								<td class="num"><a href="/runs/{encodeURIComponent(old.id)}">{pct(old.metrics?.totalReturn)}</a></td>
								<td class="num">{num(old.metrics?.sharpe)}</td>
								<td colspan="5" class="muted">ended {utc(old.endedAt)}</td>
							</tr>
						{/each}
					{/each}
				</tbody>
			</table>
		</div>
	</section>

	<details class="card"><summary>Parameters</summary>
		<pre>{JSON.stringify(agent.params, null, 2)}</pre>
	</details>

	<details class="card" id="source" open={page.url.hash==='#source'}><summary>Source</summary>
		<div class="row" style="justify-content: space-between">
			<h2>Source</h2>
			{#if agent.versions.length > 1}
				<select value={shownVersion?.code_hash} onchange={e => goto(`?version=${encodeURIComponent(e.currentTarget.value)}#source`,{noScroll:true})} aria-label="Version">
					{#each agent.versions as v, i}<option value={v.code_hash}>{v.code_hash} · {day(v.first_seen)}{i === 0 ? ' (current)' : ''}</option>{/each}
				</select>
			{/if}
		</div>
		<pre class="source">{shownVersion?.source ?? ''}</pre>
	</details>
</div>

<style>
	tr.retired td {
		font-size: 12px;
	}
	pre {
		overflow: auto;
		color: var(--ink-2);
	}
	pre.source {
		max-height: 600px;
		background: var(--surface-2);
		border-radius: 6px;
		padding: 12px;
		color: var(--ink);
	}
</style>
