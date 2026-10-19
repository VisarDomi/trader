<script lang="ts">
  import { GRAVEYARD_CATEGORY, type GraveyardEntry } from '@trader/shared';
  import { day, median, num, pct, pctPlain, sign } from '$lib/format';
  import StatTile from '$lib/components/StatTile.svelte';
  import { PLATFORM_HISTORY } from '$lib/platform-history';

  let { data } = $props();
  let query = $state('');
  let category = $state('');
  let limit = $state(20);
  const labels = {
    [GRAVEYARD_CATEGORY.AGENT]:'Decommissioned agent',
    [GRAVEYARD_CATEGORY.VERSION]:'Replaced version',
    [GRAVEYARD_CATEGORY.PLATFORM]:'Old platform',
    [GRAVEYARD_CATEGORY.RUNS]:'Retired runs',
  };
  const totalRuns = $derived(data.entries.reduce((n,e) => n+e.runs.length,0));
  const decommissioned = $derived(new Set(data.entries.filter(e => e.category === GRAVEYARD_CATEGORY.AGENT).map(e => e.agentId)).size);
  const comparisons = $derived(data.entries.reduce((n,e) => n+e.comparisonRuns,0));
  const filtered = $derived(data.entries.filter(e => (!category || e.category === category) &&
    `${e.name} ${e.agentId} ${e.codeHash} ${[...e.runs,...e.backtests].map(r => `${r.epic} ${r.reason}`).join(' ')}`.toLowerCase().includes(query.toLowerCase())));
  function source(entry: GraveyardEntry) {
    return `/agents/${entry.agentId.split('/').map(encodeURIComponent).join('/')}?version=${encodeURIComponent(entry.codeHash)}#source`;
  }
  function summary(entry: GraveyardEntry) {
    const measured = entry.runs.filter(r => r.metrics !== null);
    return {trades:measured.reduce((n,r) => n+(r.metrics?.trades ?? 0),0),medianReturn:median(measured.map(r => r.metrics!.totalReturn)),
      reasons:[...new Set([...entry.runs,...entry.backtests].map(r => r.reason))],
      engines:[...new Set([...entry.runs,...entry.backtests].map(r => r.engineVersion).filter(Boolean))]};
  }
</script>

<svelte:head><title>Graveyard · Trader</title></svelte:head>
<div class="stack">
  <header class="stack" style="gap:6px">
    <h1>Graveyard</h1>
    <p class="lede">Browse decommissioned agents and archived versions, with their source, trades and results.</p>
    <p class="muted">Retirement reasons distinguish strategy decisions, code updates and platform changes.</p>
  </header>
  {#if data.error}<div class="card" role="alert">{data.error}</div>{/if}
  <div class="row">
    <StatTile label="Archived forward runs" value={totalRuns.toLocaleString()} />
    <StatTile label="Agent versions" value={String(data.entries.length)} />
    <StatTile label="Decommissioned agents" value={String(decommissioned)} />
    {#if comparisons}<StatTile label="Comparison copies" value={comparisons.toLocaleString()} hint="Excluded from strategy results" />{/if}
  </div>

  <section class="card">
    <div class="row heading"><h2>Platform history</h2><a href="/journal">Full journal →</a></div>
    <ol class="timeline">
      {#each PLATFORM_HISTORY as milestone}
        <li><time class="muted" datetime={milestone.date}>{milestone.date}</time><h3>{milestone.name}</h3><p class="secondary">{milestone.description}</p></li>
      {/each}
    </ol>
    <p class="muted small history-note">The original v1 database was removed on October 7. Its deleted trade history cannot be shown here; the surviving records below are preserved.</p>
  </section>

  <div class="row filters">
    <input type="search" aria-label="Search graveyard" placeholder="Search agent, instrument or reason" bind:value={query} />
    <select aria-label="Archive category" bind:value={category}>
      <option value="">All history</option>
      {#each Object.entries(labels) as [value,label]}<option {value}>{label}</option>{/each}
    </select>
    <span class="muted">{filtered.length} {filtered.length === 1 ? 'version' : 'versions'} · newest retirement first</span>
  </div>

  {#each filtered.slice(0,limit) as entry (entry.key)}
    {@const stats = summary(entry)}
    <article class="card stack archive">
      <div class="row heading">
        <div class="identity"><h2><a href={source(entry)}>{entry.name}</a></h2><span class="muted small">{entry.agentId} · <code>{entry.codeHash}</code></span></div>
        <span class="badge">{labels[entry.category]}</span>
      </div>
      <p class="secondary small">{day(entry.startedAt)} → {entry.endedAt ? day(entry.endedAt) : 'retirement date not recorded'} · {entry.runs.length} forward {entry.runs.length === 1 ? 'run' : 'runs'} · {stats.trades} closed trades · median return <span class={sign(stats.medianReturn)}>{pct(stats.medianReturn)}</span></p>
      <p class="reason">{stats.reasons.length ? stats.reasons.join(' · ') : 'Agent is no longer active; no retirement reason was recorded.'}</p>
      {#if stats.engines.length}<p class="muted small">Engines: {stats.engines.join(' · ')}</p>{/if}
      <div class="row small">
        {#if entry.hasSource}<a href={source(entry)}>Preserved source →</a>{:else}<span class="muted">Source not recorded</span>{/if}
        {#if entry.comparisonRuns}<span class="muted">{entry.comparisonRuns} archived comparison copies, excluded from the figures above</span>{/if}
      </div>
      {#each [{label:'Forward records',runs:entry.runs},{label:'Backtest records',runs:entry.backtests}] as history}
        {#if history.runs.length}
          <details>
            <summary>{history.label} ({history.runs.length})</summary>
            <div class="table-wrap">
              <table class="data small">
                <thead><tr><th>Instrument</th><th>Leverage</th><th class="num">Trades</th><th class="num">Return</th><th class="num">Sharpe</th><th class="num">Max DD</th><th>Reason / window</th><th>Record</th></tr></thead>
                <tbody>
                  {#each history.runs as run (run.id)}
                    <tr>
                      <td>{run.epic}</td><td>{run.leverage === null ? 'Pre-tiers' : `1:${run.leverage}`}</td>
                      <td class="num">{run.metrics?.trades ?? '—'}</td><td class="num {sign(run.metrics?.totalReturn)}">{pct(run.metrics?.totalReturn)}</td>
                      <td class="num">{num(run.metrics?.sharpe)}</td><td class="num">{pctPlain(run.metrics?.maxDrawdown)}</td>
                      <td class="explanation">{run.kind === 'backtest' ? run.windowId : run.reason}</td><td><a href="/runs/{encodeURIComponent(run.id)}">View run →</a></td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </details>
        {/if}
      {/each}
    </article>
  {:else}
    <p class="card muted">{query || category ? 'No archived records match these filters.' : 'No agents or runs have been decommissioned yet.'}</p>
  {/each}
  {#if filtered.length > limit}<button onclick={() => limit += 20}>Show more ({filtered.length-limit} remaining)</button>{/if}
</div>

<style>
  .heading {justify-content:space-between; align-items:start; gap:12px}
  .heading h2 {margin:0}
  .timeline {list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,190px),1fr));gap:18px;margin-top:16px}
  .timeline li {min-width:0;border-left:2px solid var(--hairline);padding-left:12px}
  .timeline time {font-size:12px}
  .timeline h3 {margin:4px 0}
  .timeline p,.small {font-size:12px}
  .history-note {margin-top:18px}
  .filters input {flex:1;min-width:0;max-width:390px}
  .archive {gap:10px}
  .identity {min-width:0;overflow-wrap:anywhere}
  .reason {color:var(--ink-2)}
  summary {cursor:pointer;font-weight:500;padding:5px 0}
  .table-wrap {margin-top:8px;max-height:400px;max-width:100%}
  .explanation {white-space:normal;min-width:190px;max-width:340px}
  @media(max-width:600px) {.filters input {flex-basis:100%;max-width:none}.archive .heading {align-items:start}.archive .badge {white-space:normal}}
</style>
