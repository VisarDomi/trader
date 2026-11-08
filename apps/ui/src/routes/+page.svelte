<script lang="ts">
	import type { Assessment, LeaderboardRow, RunMetrics, Verdict } from '@trader/shared';
	import { assess, luckBands, VERDICT } from '@trader/shared';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { ago, day, isControl, lev, levTitle, median, num, pct, pctPlain, sign, usd, utc } from '$lib/format';
	import OverfitScatter from '$lib/components/OverfitScatter.svelte';
  import LiveRefresh from '$lib/components/LiveRefresh.svelte';
  import ValueBars from '$lib/components/ValueBars.svelte';

	let { data } = $props();

	type View = 'virtual' | 'demo' | 'backtest' | 'overfit';
	type Group = 'run' | 'agent' | 'family';
	const view = $derived((page.url.searchParams.get('view') as View) ?? 'virtual');

	let group = $state<Group>(page.url.searchParams.get('group')==='family'?'family':page.url.searchParams.get('group')==='agent'?'agent':'run');
	let epic = $state('');
	let timeframe = $state('');
	let leverage = $state(page.url.searchParams.get('leverage') ?? '');
	let query = $state(page.url.searchParams.get('q')??'');
	let evidenceFilter = $state('all');
	const scenario = $derived(page.url.searchParams.get('scenario') || 'standard');
	let pageNumber = $state(1);
	const PAGE_SIZE = 100;
	const scenarios = $derived([...new Set(['standard',...data.scenarios.map(s => s.name),...(scenario==='all'?[]:[scenario])])]);
	const totalVirtual = $derived(data.scenarios.length?data.scenarios.reduce((n, s) => n + s.count, 0):null);
	let hideControls = $state(true);
	let sortKey = $state<string>('totalReturn');
	let sortDesc = $state(true);
	$effect(() => { void [epic, timeframe, leverage, query, scenario, view, evidenceFilter, group]; pageNumber = 1; });

	const rows = $derived(view === 'backtest' ? data.backtest : view === 'demo' ? data.capital : data.demo);
	const epics = $derived([...new Set(rows.map(r => r.epic))].sort());
	const timeframes = $derived([...new Set(rows.map(r => r.timeframe))]);
	const leverages = $derived(
		[...new Set(rows.map(r => r.leverage).filter((l): l is number => l !== null))].sort((a, b) => a - b),
	);

	function matches(r: LeaderboardRow): boolean {
		if (view !== 'backtest' && view !== 'demo' && scenario !== 'all' && (r.scenario ?? 'standard') !== scenario) return false;
		if (epic && r.epic !== epic) return false;
		if (timeframe && r.timeframe !== timeframe) return false;
		if (leverage && String(r.leverage) !== leverage) return false;
		if (hideControls && isControl(r)) return false;
		if (evidenceFilter==='paused'&&(!(r.dependency??r.evidence?.dependency)||(r.dependency??r.evidence?.dependency)?.state==='available'))return false;
		if (evidenceFilter!=='all'&&evidenceFilter!=='paused'&&r.evidence?.admission!==evidenceFilter)return false;
		if (query && !`${r.name} ${r.agentId}`.toLowerCase().includes(query.toLowerCase())) return false;
		return true;
	}

	const filtered = $derived(rows.filter(matches));

	// ------------------------------------------------------------ lifecycle stage (demo)
	const bands = $derived(luckBands(data.demo.filter(r => !r.comparisonOnly)));
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
		if(key==='excess')return r.evidence?.benchmark.excessReturn??-Infinity;
		if(key==='exposure')return r.evidence?.exposure??-Infinity;
		if(key==='activeDays')return observedDays(r)??-Infinity;
		if (key === 'btSharpe') return r.backtest?.metrics?.sharpe ?? -Infinity;
		if (key === 'btAnnual') return r.backtest?.metrics?.annualReturn ?? -Infinity;
		if (key === 'name') return 0;
		if (key === 'stage') return STAGE_RANK[stages.get(r.runId)?.verdict ?? VERDICT.EARLY];
		if (key === 'leverage') return r.leverage ?? -Infinity;
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
		variants:number;
		medianExcess:number;
		benchmarkRuns:number;
		href:string;
	}

	const agents = $derived.by((): AgentAgg[] => {
		const by = new Map<string, LeaderboardRow[]>();
		for (const r of filtered) {const key=group==='family'?r.slug:r.agentId;const rs=by.get(key)??[];rs.push(r);by.set(key,rs);}
		return [...by.entries()].map(([agentId, rs]) => {
			const ms = rs.map(r => r.metrics).filter((m): m is RunMetrics => m !== null);
			const byReturn = [...rs].sort((a, b) => (b.metrics?.totalReturn ?? 0) - (a.metrics?.totalReturn ?? 0));
			const capital = ms.reduce((s, m) => s + m.initialCapital, 0);
			const equity = ms.reduce((s, m) => s + m.finalEquity, 0);
			const bt = rs.map(r => r.backtest?.metrics?.sharpe).filter((x): x is number => typeof x === 'number');
			return {
				agentId,
				name: group==='family'?rs[0]!.name.replace(/\s*\([^)]*\)\s*$/,''):rs[0]!.name,
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
				variants:new Set(rs.map(r=>r.agentId)).size,
				medianExcess:median(rs.flatMap(r=>r.evidence?.benchmark.excessReturn===undefined?[]:[r.evidence.benchmark.excessReturn])),
				benchmarkRuns:rs.filter(r=>r.evidence?.benchmark.status==='matched').length,
				href:group==='family'?`/?view=${view}&q=${encodeURIComponent(agentId)}`:`/agents/${agentId}`,
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
		excess:'medianExcess',
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
		pageNumber=1;
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
	function observedDays(r:LeaderboardRow):number|undefined {
		if(view!=='virtual')return r.metrics?.days;
		return Math.max(0,(r.evidence?.asOf??Date.now())-(r.observation?.since??r.startedAt)-(r.observation?.pausedMs??0))/86_400_000;
	}
	const accountFunding=$derived(data.evidence?.accountCashflows.totals.find(r=>r.type==='SWAP')?.amount);
	const unallocatedFunding=$derived(data.evidence?.accountCashflows.unallocated.find(r=>r.type==='SWAP')?.amount);
</script>

<LiveRefresh recovering={!!data.error||data.warnings.length>0||!data.arena.up} />

<div class="stack">
	<header class="page-heading"><h1>Results</h1><span class="muted small">{filtered.length} records · {view==='demo'?'realized cash':view==='backtest'?'historical simulation':'forward equity'}</span></header>

	{#if data.error}
		<div class="card" role="status"><span class="status-dot status-critical"></span>{data.error}
      {#if data.savedAt}<p>Saved · {utc(data.savedAt)}</p>{/if}
      <p class="muted">Reconnecting…</p>
    </div>
	{/if}
  {#each data.warnings as warning}<p class="notice" role="status">{warning} Retrying automatically.</p>{/each}


	<div class="row" role="toolbar" aria-label="Leaderboard filters">
		<div class="pill-group" aria-label="View">
			<a href={viewHref('backtest')} class:active={view === 'backtest'}>Backtest</a>
			<a href={viewHref('virtual')} class:active={view === 'virtual'}>Virtual engine</a>
			<a href={viewHref('demo')} class:active={view === 'demo'}>Capital demo</a>
			<a href={viewHref('overfit')} class:active={view === 'overfit'}>Overfit</a>
		</div>

		<select bind:value={epic} aria-label="Instrument">
			<option value="">All instruments</option>
			{#each epics as e}<option value={e}>{e}</option>{/each}
		</select>

		<input type="search" placeholder="Search agents" bind:value={query} />
		<label class="row" style="gap: 4px"><input type="checkbox" bind:checked={hideControls} /> Hide control agents</label>
    <details class="filters"><summary>Filters</summary><div class="row">		{#if view !== 'overfit'}
			<div class="pill-group" aria-label="Group">
				<button class:active={group === 'run'} onclick={() => (group = 'run')}>Agent × instrument</button>
				<button class:active={group === 'agent'} onclick={() => (group = 'agent')}>Per agent</button>
        <button class:active={group==='family'} onclick={()=>group='family'}>Per family</button>
			</div>
		{/if}		<select bind:value={timeframe} aria-label="Timeframe">
			<option value="">All timeframes</option>
			{#each timeframes as t}<option value={t}>{t}</option>{/each}
		</select>
		<select bind:value={leverage} aria-label="Leverage">
			<option value="">All leverages</option>
			{#each leverages as l}<option value={String(l)}>1:{l}</option>{/each}
		</select>
    <select bind:value={evidenceFilter} aria-label="Admission and dependency evidence">
      <option value="all">All evidence</option><option value="backtest-qualified">Backtest-qualified</option>
      <option value="calibration">Calibration</option><option value="user-experiment">User experiments</option>
      <option value="backtest-rejected">Fails new-admission gate</option>
      <option value="control">Controls</option><option value="paused">Forecast paused/unavailable</option>
    </select>
		{#if view === 'virtual' || view === 'overfit'}
      <select value={scenario} aria-label="Execution scenario" onchange={event => { const u = new URL(page.url); u.searchParams.set('scenario', event.currentTarget.value); void goto(u); }}>
        <option value="all">All scenarios (correlated)</option>
        {#each scenarios as item}<option value={item}>{item}</option>{/each}
      </select>
    {/if}</div></details>
	</div>

  {#if !data.error||data.savedAt}
    <div class="result-charts">
      <section class="card"><h2>Return · shown records</h2><ValueBars items={sortedRuns.slice(0,8).filter(r=>r.metrics).map(r=>({label:`${r.name} · ${r.epic}`,value:r.metrics!.totalReturn*100,href:`/runs/${encodeURIComponent(r.runId)}${view==='demo'?'?stage=capital':''}`,note:`1:${r.leverage??'—'} · ${r.metrics!.trades} trades · ${day(r.metrics!.startTime)} → ${day(r.metrics!.endTime)}`}))}/></section>
      <section class="card"><h2>{view==='demo'?'Closed-cash drawdown':'Max drawdown'}</h2><ValueBars items={sortedRuns.slice(0,8).filter(r=>r.metrics).map(r=>({label:`${r.name} · ${r.epic}`,value:-r.metrics!.maxDrawdown*100,href:`/runs/${encodeURIComponent(r.runId)}${view==='demo'?'?stage=capital':''}`}))}/></section>
    </div>
  {/if}

	{#if data.error && !data.savedAt}
    <p class="muted" role="status">Waiting for the leaderboard to reconnect.</p>
	{:else if view === 'overfit'}
		<OverfitScatter rows={filtered} />
	{:else if group === 'run'}
    <div class="table-wrap results-table"><table class="data"><thead><tr>
      <th><button onclick={()=>sortBy('name')}>Agent{arrow('name')}</button></th><th>Market</th><th><button onclick={()=>sortBy('leverage')}>Setup{arrow('leverage')}</button></th>
      <th class="num"><button onclick={()=>sortBy('activeDays')}>Days{arrow('activeDays')}</button></th><th class="num"><button onclick={()=>sortBy('trades')}>Trades{arrow('trades')}</button></th>
      <th class="num"><button onclick={()=>sortBy('totalReturn')}>Return{arrow('totalReturn')}</button></th>
      <th class="num"><button onclick={()=>sortBy('maxDrawdown')}>{view==='demo'?'Cash DD':'Max DD'}{arrow('maxDrawdown')}</button></th>
      {#if view!=='demo'}<th class="num" title="Common-date excess over 1:1 hold; sizing differs"><button onclick={()=>sortBy('excess')}>Excess{arrow('excess')}</button></th>{/if}<th>Status</th>
    </tr></thead><tbody>{#each sortedRuns.slice((pageNumber-1)*PAGE_SIZE,pageNumber*PAGE_SIZE)as r(r.runId)}
      {@const m=r.metrics}{@const verdict=stages.get(r.runId)}
      <tr class:control={isControl(r)}><td><a class="agent-name" href="/agents/{r.agentId}">{r.name}</a>{#if r.demoAdmission}<span class="badge">Experiment</span>{/if}{#if isControl(r)}<span class="badge">Control</span>{/if}{#if r.usesForecast}<small>TimesFM{r.dependency&&r.dependency.state!=='available'?' · paused':''}</small>{/if}</td>
        <td><a href="/runs/{encodeURIComponent(r.runId)}{view==='demo'?'?stage=capital':''}">{r.epic}</a></td>
        <td>{lev(r)}<small>{r.timeframe}{#if r.evidence?.exposure!=null} · {num(r.evidence.exposure)}× used{/if}{#if r.comparisonOnly} · {r.scenario}{/if}</small></td>
        <td class="num">{num(observedDays(r),1)}</td><td class="num">{m?.trades??'—'}</td><td class="num {sign(m?.totalReturn)}">{pct(m?.totalReturn)}</td><td class="num">{pctPlain(m?.maxDrawdown)}</td>
        {#if view!=='demo'}<td class="num {sign(r.evidence?.benchmark.excessReturn)}" title={r.evidence?.benchmark.status==='matched'?`${utc(r.evidence.benchmark.from)} → ${utc(r.evidence.benchmark.through)}`:'No common-date benchmark'}>{r.evidence?.benchmark.excessReturn!==undefined?`${num(r.evidence.benchmark.excessReturn*100)} pp`:'—'}</td>{/if}
        <td><span class="badge">{view==='virtual'?(verdict?.verdict??r.status):view==='demo'?(r.mirrored?'Active':'Past'):r.status}</span>{#if view==='virtual'&&r.mirrored}<small>Capital demo</small>{/if}</td>
      </tr>{:else}<tr><td colspan="9" class="muted">No matching records.</td></tr>{/each}</tbody></table></div>
    <div class="row secondary"><button class="btn" disabled={pageNumber<=1} onclick={()=>pageNumber--}>Previous</button><span>{sortedRuns.length} records · {pageNumber} / {Math.max(1,Math.ceil(sortedRuns.length/PAGE_SIZE))}</span><button class="btn" disabled={pageNumber>=Math.ceil(sortedRuns.length/PAGE_SIZE)} onclick={()=>pageNumber++}>Next</button></div>

	{:else}
		<div class="table-wrap">
			<table class="data">
				<thead>
					<tr>
						<th><button onclick={() => sortBy('name')}>Agent{arrow('name')}</button></th>
						<th>TF</th>
						<th class="num"><button onclick={() => sortBy('profitable')}>Profitable on{arrow('profitable')}</button></th>
						<th class="num" title="Sum of record equity divided by sum of starting capital, not a rebalanced or correlation-adjusted portfolio"><button onclick={() => sortBy('combined')}>Equal-capital aggregate{arrow('combined')}</button></th>
						<th class="num"><button onclick={() => sortBy('totalReturn')}>Avg return{arrow('totalReturn')}</button></th>
						<th class="num"><button onclick={() => sortBy('sharpe')}>Median Sharpe{arrow('sharpe')}</button></th>
						<th class="num"><button onclick={() => sortBy('trades')}>Trades{arrow('trades')}</button></th>
            {#if view!=='demo'}<th class="num" title="Median per-record excess over its own common-date control; not portfolio alpha"><button onclick={()=>sortBy('excess')}>Median excess{arrow('excess')}</button></th>{/if}
						{#if view === 'virtual'}<th class="num"><button onclick={() => sortBy('btSharpe')}>BT median Sharpe{arrow('btSharpe')}</button></th>{/if}
						<th>Best / worst</th>
					</tr>
				</thead>
				<tbody>
					{#each sortedAgents as a (a.agentId)}
						<tr class:control={a.control}>
								<td><a href={a.href}>{a.name}</a>{#if a.control}<span class="badge">control</span>{/if}{#if group==='family'}<small class="muted">{a.variants} variants</small>{/if}</td>
							<td class="muted">{a.timeframe}</td>
							<td class="num">{a.profitable} / {a.runs}</td>
							<td class="num {sign(a.combined)}">{pct(a.combined)}</td>
							<td class="num {sign(a.avgReturn)}">{pct(a.avgReturn)}</td>
							<td class="num">{num(a.medianSharpe)}</td>
							<td class="num">{a.trades}</td>
              {#if view!=='demo'}<td class="num {sign(a.medianExcess)}">{Number.isFinite(a.medianExcess)?`${num(a.medianExcess*100,2)} pp`:'—'}<small class="muted">{a.benchmarkRuns}/{a.runs} matched</small></td>{/if}
							{#if view === 'virtual'}<td class="num">{num(a.btMedianSharpe)}</td>{/if}
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
 .page-heading{display:flex;align-items:center;justify-content:space-between;gap:12px}.small{font-size:12px}.result-charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.result-charts h2{font-size:14px}.results-table{max-height:none}.agent-name{font-weight:500;text-decoration:none}.filters summary{cursor:pointer;font-size:12px;color:var(--ink-2)}.filters[open]{flex-basis:100%;border-top:1px solid var(--grid);padding-top:12px}.filters .row{padding-top:12px}@media(max-width:700px){.result-charts{grid-template-columns:1fr}}

	td.stage,
	td.lev {
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
  td small{display:block;font-size:11px;white-space:nowrap;margin-top:3px}

</style>
