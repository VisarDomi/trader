<script lang="ts">
	import type { Assessment, LeaderboardRow, RunMetrics, Verdict } from '@trader/shared';
	import { assess, luckBands, VERDICT } from '@trader/shared';
	import { page } from '$app/state';
	import { ago, isControl, median, num, pct, pctPlain, sign } from '$lib/format';
	import OverfitScatter from '$lib/components/OverfitScatter.svelte';

	let { data } = $props();

	type View = 'demo' | 'backtest' | 'overfit';
	type Group = 'run' | 'agent';
	const view = $derived((page.url.searchParams.get('view') as View) ?? 'demo');

	let group = $state<Group>('run');
	let epic = $state('');
	let timeframe = $state('');
	let query = $state('');
	let hideControls = $state(false);
	let sortKey = $state<string>('totalReturn');
	let sortDesc = $state(true);

	const rows = $derived(view === 'backtest' ? data.backtest : data.demo);
	const epics = $derived([...new Set([...data.demo, ...data.backtest].map(r => r.epic))].sort());
	const timeframes = $derived([...new Set([...data.demo, ...data.backtest].map(r => r.timeframe))]);

	function matches(r: LeaderboardRow): boolean {
		if (epic && r.epic !== epic) return false;
		if (timeframe && r.timeframe !== timeframe) return false;
		if (hideControls && isControl(r)) return false;
		if (query && !`${r.name} ${r.agentId}`.toLowerCase().includes(query.toLowerCase())) return false;
		return true;
	}

	const filtered = $derived(rows.filter(matches));

	// ------------------------------------------------------------ lifecycle stage (demo)
	const bands = $derived(luckBands(data.demo));
	const stages = $derived(new Map<string, Assessment>(data.demo.map(r => [r.runId, assess(r, bands)])));
	const STAGE_RANK: Record<Verdict, number> = {
		[VERDICT.LEADER]: 5,
		[VERDICT.KEEP]: 4,
		[VERDICT.EARLY]: 3,
		[VERDICT.CONTROL]: 2,
		[VERDICT.RETIRE]: 1,
		[VERDICT.RETIRED]: 0,
	};
	const STAGE_DOT: Partial<Record<Verdict, string>> = {
		[VERDICT.LEADER]: 'status-good',
		[VERDICT.KEEP]: 'status-good',
		[VERDICT.RETIRE]: 'status-critical',
	};

	// ------------------------------------------------------------ per-run rows
	function metric(r: LeaderboardRow, key: string): number {
		if (key === 'btSharpe') return r.backtest?.metrics?.sharpe ?? -Infinity;
		if (key === 'btAnnual') return r.backtest?.metrics?.annualReturn ?? -Infinity;
		if (key === 'name') return 0;
		if (key === 'stage') return STAGE_RANK[stages.get(r.runId)?.verdict ?? VERDICT.EARLY];
		const m = r.metrics as unknown as Record<string, number> | null;
		const v = m?.[key];
		return typeof v === 'number' && Number.isFinite(v) ? v : -Infinity;
	}

	const sortedRuns = $derived(
		[...filtered].sort((a, b) => {
			if (sortKey === 'name') return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
			const d = metric(a, sortKey) - metric(b, sortKey);
			return sortDesc ? -d : d;
		}),
	);

	// ------------------------------------------------------------ per-agent aggregation
	interface AgentAgg {
		agentId: string;
		name: string;
		timeframe: string;
		control: boolean;
		runs: number;
		profitable: number;
		avgReturn: number;
		medianSharpe: number;
		trades: number;
		combined: number;
		btMedianSharpe: number;
		bestEpic: string;
		worstEpic: string;
	}

	const agents = $derived.by((): AgentAgg[] => {
		const by = new Map<string, LeaderboardRow[]>();
		for (const r of filtered) by.set(r.agentId, [...(by.get(r.agentId) ?? []), r]);
		return [...by.entries()].map(([agentId, rs]) => {
			const ms = rs.map(r => r.metrics).filter((m): m is RunMetrics => m !== null);
			const byReturn = [...rs].sort((a, b) => (b.metrics?.totalReturn ?? 0) - (a.metrics?.totalReturn ?? 0));
			const capital = ms.reduce((s, m) => s + m.initialCapital, 0);
			const equity = ms.reduce((s, m) => s + m.finalEquity, 0);
			const bt = rs.map(r => r.backtest?.metrics?.sharpe).filter((x): x is number => typeof x === 'number');
			return {
				agentId,
				name: rs[0]!.name,
				timeframe: rs[0]!.timeframe,
				control: isControl(rs[0]!),
				runs: rs.length,
				profitable: ms.filter(m => m.totalReturn > 0).length,
				avgReturn: ms.length ? ms.reduce((s, m) => s + m.totalReturn, 0) / ms.length : 0,
				medianSharpe: median(ms.map(m => m.sharpe)),
				trades: ms.reduce((s, m) => s + m.trades, 0),
				combined: capital > 0 ? equity / capital - 1 : 0,
				btMedianSharpe: median(bt),
				bestEpic: byReturn[0]?.epic ?? '',
				worstEpic: byReturn.at(-1)?.epic ?? '',
			};
		});
	});

	const aggKey: Record<string, keyof AgentAgg> = {
		totalReturn: 'avgReturn',
		sharpe: 'medianSharpe',
		trades: 'trades',
		combined: 'combined',
		profitable: 'profitable',
		btSharpe: 'btMedianSharpe',
	};

	const sortedAgents = $derived(
		[...agents].sort((a, b) => {
			if (sortKey === 'name') return sortDesc ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
			const k = aggKey[sortKey] ?? 'avgReturn';
			const av = Number(a[k]);
			const bv = Number(b[k]);
			const d = (Number.isFinite(av) ? av : -Infinity) - (Number.isFinite(bv) ? bv : -Infinity);
			return sortDesc ? -d : d;
		}),
	);

	// ------------------------------------------------------------ luck band (monkeys)
	const luck = $derived.by(() => {
		const monkeys = filtered.filter(r => r.slug === 'random-baseline' && r.metrics && r.metrics.trades > 0);
		if (monkeys.length === 0) return null;
		const rets = monkeys.map(r => r.metrics!.totalReturn);
		const sharpes = monkeys.map(r => r.metrics!.sharpe);
		return {
			n: monkeys.length,
			minReturn: Math.min(...rets),
			maxReturn: Math.max(...rets),
			maxSharpe: Math.max(...sharpes),
		};
	});

	const demoStarted = $derived(data.demo.length ? Math.min(...data.demo.map(r => r.startedAt)) : 0);
	const tradedDemo = $derived(data.demo.filter(r => (r.metrics?.trades ?? 0) > 0).length);

	function sortBy(key: string) {
		if (sortKey === key) sortDesc = !sortDesc;
		else {
			sortKey = key;
			sortDesc = key !== 'maxDrawdown';
		}
	}

	function arrow(key: string): string {
		return sortKey === key ? (sortDesc ? ' ↓' : ' ↑') : '';
	}

	function viewHref(v: View): string {
		const u = new URL(page.url);
		u.searchParams.set('view', v);
		return `${u.pathname}${u.search}`;
	}
</script>

<div class="stack">
	<header class="stack" style="gap: 6px">
		<h1>Leaderboard</h1>
		{#if view === 'demo'}
			<p class="lede">
				Every agent trades live Capital.com demo prices from the moment it is deployed, with $10,000 of virtual capital per
				instrument. This is out-of-sample: nobody could have tuned an agent to these prices. Treat results with fewer than
				~30 trades as noise.
			</p>
		{:else if view === 'backtest'}
			<p class="lede">
				The same agents on 2024-01 → 2026-09 history (spread, overnight funding and margin included). For information only:
				anything can be fitted to the past. Compare with the demo tab.
			</p>
		{:else}
			<p class="lede">
				Backtest Sharpe against demo Sharpe for each agent × instrument. Points far below the diagonal did much worse live
				than in the backtest — the signature of overfitting. Points need demo trades to mean anything.
			</p>
		{/if}
	</header>

	{#if data.error}
		<div class="card"><span class="status-dot status-critical"></span>{data.error}</div>
	{/if}

	<div class="row" role="toolbar" aria-label="Leaderboard filters">
		<div class="pill-group" aria-label="View">
			<a href={viewHref('demo')} class:active={view === 'demo'}>Demo</a>
			<a href={viewHref('backtest')} class:active={view === 'backtest'}>Backtest</a>
			<a href={viewHref('overfit')} class:active={view === 'overfit'}>Overfit</a>
		</div>
		{#if view !== 'overfit'}
			<div class="pill-group" aria-label="Group">
				<button class:active={group === 'run'} onclick={() => (group = 'run')}>Agent × instrument</button>
				<button class:active={group === 'agent'} onclick={() => (group = 'agent')}>Per agent</button>
			</div>
		{/if}
		<select bind:value={epic} aria-label="Instrument">
			<option value="">All instruments</option>
			{#each epics as e}<option value={e}>{e}</option>{/each}
		</select>
		<select bind:value={timeframe} aria-label="Timeframe">
			<option value="">All timeframes</option>
			{#each timeframes as t}<option value={t}>{t}</option>{/each}
		</select>
		<input type="search" placeholder="Search agents" bind:value={query} />
		<label class="row" style="gap: 4px"><input type="checkbox" bind:checked={hideControls} /> Hide control agents</label>
	</div>

	{#if view === 'demo'}
		<div class="row secondary" style="font-size: 13px">
			<span>Demo running since {demoStarted ? new Date(demoStarted).toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'} ({ago(demoStarted)})</span>
			<span>· {tradedDemo} of {data.demo.length} runs have traded</span>
		</div>
	{/if}

	{#if luck && view !== 'overfit'}
		<div class="card luck">
			<strong>Luck band.</strong>
			{luck.n} random-entry "monkey" runs in this view returned between
			<span class={sign(luck.minReturn)}>{pct(luck.minReturn)}</span> and
			<span class={sign(luck.maxReturn)}>{pct(luck.maxReturn)}</span>
			(best Sharpe {num(luck.maxSharpe)}). An agent inside this range has not shown skill yet.
		</div>
	{/if}

	{#if view === 'overfit'}
		<OverfitScatter rows={filtered} />
	{:else if group === 'run'}
		<div class="table-wrap">
			<table class="data">
				<thead>
					<tr>
						<th><button onclick={() => sortBy('name')}>Agent{arrow('name')}</button></th>
						<th>Instrument</th>
						<th>TF</th>
						<th class="num"><button onclick={() => sortBy('days')}>Days{arrow('days')}</button></th>
						<th class="num"><button onclick={() => sortBy('trades')}>Trades{arrow('trades')}</button></th>
						<th class="num"><button onclick={() => sortBy('totalReturn')}>Return{arrow('totalReturn')}</button></th>
						{#if view === 'backtest'}<th class="num"><button onclick={() => sortBy('annualReturn')}>Annual{arrow('annualReturn')}</button></th>{/if}
						<th class="num"><button onclick={() => sortBy('maxDrawdown')}>Max DD{arrow('maxDrawdown')}</button></th>
						<th class="num"><button onclick={() => sortBy('sharpe')}>Sharpe{arrow('sharpe')}</button></th>
						<th class="num"><button onclick={() => sortBy('winRate')}>Win{arrow('winRate')}</button></th>
						<th class="num"><button onclick={() => sortBy('profitFactor')}>PF{arrow('profitFactor')}</button></th>
						<th class="num" title="t-statistic of trade P&L: above ~2 is unlikely to be luck"><button onclick={() => sortBy('tStat')}>t{arrow('tStat')}</button></th>
						{#if view === 'demo'}
							<th class="num" title="Backtest Sharpe of the same agent on the same instrument"><button onclick={() => sortBy('btSharpe')}>BT Sharpe{arrow('btSharpe')}</button></th>
							<th title="Lifecycle stage: see the Journal page"><button onclick={() => sortBy('stage')}>Stage{arrow('stage')}</button></th>
						{/if}
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each sortedRuns as r (r.runId)}
						{@const m = r.metrics}
						<tr class:control={isControl(r)}>
							<td>
								<a href="/agents/{r.agentId}">{r.name}</a>
								{#if isControl(r)}<span class="badge">control</span>{/if}
								{#if r.usesForecast}<span class="badge">TimesFM</span>{/if}
							</td>
							<td><a href="/runs/{encodeURIComponent(r.runId)}">{r.epic}</a></td>
							<td class="muted">{r.timeframe}</td>
							<td class="num">{num(m?.days, 1)}</td>
							<td class="num">{m?.trades ?? 0}</td>
							<td class="num {sign(m?.totalReturn)}">{pct(m?.totalReturn)}</td>
							{#if view === 'backtest'}<td class="num {sign(m?.annualReturn)}">{pct(m?.annualReturn)}</td>{/if}
							<td class="num">{pctPlain(m?.maxDrawdown)}</td>
							<td class="num">{num(m?.sharpe)}</td>
							<td class="num">{m && m.trades ? pctPlain(m.winRate, 0) : '—'}</td>
							<td class="num">{m && m.trades ? num(m.profitFactor) : '—'}</td>
							<td class="num">{m && m.trades > 1 ? num(m.tStat, 1) : '—'}</td>
							{#if view === 'demo'}
								<td class="num">
									{#if r.backtest?.metrics}
										{num(r.backtest.metrics.sharpe)}{#if !r.backtest.sameCode}<span class="muted" title="Backtest ran on an older version of this agent"> *</span>{/if}
									{:else}<span class="muted">—</span>{/if}
								</td>
								{@const st = stages.get(r.runId)}
								<td class="stage" title={st?.reason ?? ''}>
									{#if st && st.verdict !== VERDICT.CONTROL}
										{#if STAGE_DOT[st.verdict]}<span class="status-dot {STAGE_DOT[st.verdict]}"></span>{/if}<span class:muted={st.verdict === VERDICT.EARLY}>{st.verdict}</span>
									{/if}
								</td>
							{/if}
							<td>
								{#if r.mirrored}<span class="badge" title="Mirrored onto a Capital.com demo account as real demo orders">broker</span>{/if}
								{#if r.status !== 'running' && r.status !== 'completed'}<span class="badge">{r.status}</span>{/if}
							</td>
						</tr>
					{:else}
						<tr><td colspan="15" class="muted">No runs match.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{:else}
		<div class="table-wrap">
			<table class="data">
				<thead>
					<tr>
						<th><button onclick={() => sortBy('name')}>Agent{arrow('name')}</button></th>
						<th>TF</th>
						<th class="num"><button onclick={() => sortBy('profitable')}>Profitable on{arrow('profitable')}</button></th>
						<th class="num" title="Return of all its instruments combined"><button onclick={() => sortBy('combined')}>Combined{arrow('combined')}</button></th>
						<th class="num"><button onclick={() => sortBy('totalReturn')}>Avg return{arrow('totalReturn')}</button></th>
						<th class="num"><button onclick={() => sortBy('sharpe')}>Median Sharpe{arrow('sharpe')}</button></th>
						<th class="num"><button onclick={() => sortBy('trades')}>Trades{arrow('trades')}</button></th>
						{#if view === 'demo'}<th class="num"><button onclick={() => sortBy('btSharpe')}>BT median Sharpe{arrow('btSharpe')}</button></th>{/if}
						<th>Best / worst</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedAgents as a (a.agentId)}
						<tr class:control={a.control}>
							<td><a href="/agents/{a.agentId}">{a.name}</a>{#if a.control}<span class="badge">control</span>{/if}</td>
							<td class="muted">{a.timeframe}</td>
							<td class="num">{a.profitable} / {a.runs}</td>
							<td class="num {sign(a.combined)}">{pct(a.combined)}</td>
							<td class="num {sign(a.avgReturn)}">{pct(a.avgReturn)}</td>
							<td class="num">{num(a.medianSharpe)}</td>
							<td class="num">{a.trades}</td>
							{#if view === 'demo'}<td class="num">{num(a.btMedianSharpe)}</td>{/if}
							<td class="muted">{a.bestEpic} / {a.worstEpic}</td>
						</tr>
					{:else}
						<tr><td colspan="9" class="muted">No agents match.</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>

<style>
	td.stage {
		white-space: nowrap;
	}
	tr.control td {
		color: var(--ink-2);
	}
	.luck {
		font-size: 13px;
		color: var(--ink-2);
		padding: 10px 14px;
	}
	td .badge {
		margin-left: 6px;
	}
</style>
