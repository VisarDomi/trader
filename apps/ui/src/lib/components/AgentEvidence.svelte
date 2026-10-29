<script lang="ts">
  import type { AgentEvidence } from '@trader/shared';
  import { num,pct,pctPlain,usd,utc,sign } from '$lib/format';
  import StatTile from './StatTile.svelte';
  let { evidence:e }:{evidence:AgentEvidence}=$props();
  const benchmark=$derived(e.benchmark),costs=$derived(e.costs);
  const maxReturn=$derived(Math.max(.01,Math.abs(benchmark.strategyReturn??0),Math.abs(benchmark.benchmarkReturn??0)));
  const names={control:'Control','user-experiment':'User experiment',calibration:'Calibration record','backtest-qualified':'Backtest-qualified','backtest-rejected':'Fails new-admission gate'};
  const diagnoses={unmeasured:'Cost attribution unavailable','negative-before-spread':'Mid-price P&L was not positive before spread',
    'costs-exceed-gain':'Net P&L was not positive after spread, funding and adjustments','positive-after-costs':'Measured trades remained positive after costs'};
</script>

<section class="card stack">
  <div class="row"><h2>Benchmark and risk evidence</h2><span class="badge">{names[e.admission]}</span></div>
  {#if e.dependency && e.dependency.state!=='available'}
    <p class="notice"><strong>{e.dependency.state==='user-paused'?'Forecast dependency paused':'Forecast dependency unavailable'}</strong> · {e.dependency.note}
      Known unavailable time is excluded from virtual maturity. Tracking since {utc(e.dependency.trackedSince)}.</p>
  {/if}
  {#if benchmark.status==='matched'}
    <p>Common window: {utc(benchmark.from)} → {utc(benchmark.through)}.</p>
    <div class="compare" role="img" aria-label={`Common-window returns: strategy ${pct(benchmark.strategyReturn,2)}, 1:1 buy and hold ${pct(benchmark.benchmarkReturn,2)}. Sizing differs.`}>
      {#each [{label:'Strategy',value:benchmark.strategyReturn??0},{label:'1:1 buy & hold',value:benchmark.benchmarkReturn??0}] as item}
        <div class="compare-row"><span>{item.label}</span><div class="bar-track"><div class:negative={item.value<0} style:width={`${Math.abs(item.value)/maxReturn*100}%`}></div></div><strong class={sign(item.value)}>{pct(item.value,2)}</strong></div>
      {/each}
    </div>
    <p><strong class={sign(benchmark.excessReturn)}>{num((benchmark.excessReturn??0)*100,2)} pp excess over holding</strong>.</p>
  {:else}<p>{benchmark.note}</p>{/if}
  {#if benchmark.status==='matched'}<p class="muted">{benchmark.note}</p>{/if}
  <div class="row">
    <StatTile label="Current notional / equity" value={e.exposure==null?'—':`${num(e.exposure)}×`} hint="Actual position exposure, not the account's leverage ceiling." />
    <StatTile label="Downside to current stop" value={pctPlain(e.stopRisk)} hint="From current liquidation equity to the fixed/trailing stop; gaps and fees can change the result." />
    <StatTile label="Open position P&L" value={usd(e.unrealizedPnl)} tone={sign(e.unrealizedPnl)} />
    <StatTile label="Open position funding" value={usd(e.openFunding)} tone={sign(e.openFunding)} />
  </div>
  <p class="muted">A high rank among {e.strategyVariants} forward strategy variants does not establish skill. Failed and archived trials add selection risk; these are not independent experiments. Leverage, related instruments and small samples can dominate returns.</p>
</section>

<section class="card stack">
  <h2>{e.basis==='historical-equity'?'Historical simulation costs':e.basis==='broker-realized-cash'?'Actual demo cash coverage':'Virtual execution costs'}</h2>
  {#if costs}
    <p>{costs.closedTrades} stored closed trades · {costs.capturedTrades} at-fill references · {costs.reconstructedTrades} archived quote matches · {costs.closedTrades-costs.measuredTrades} unknown.</p>
    {#if !costs.historyComplete}<p class="notice">Stored history covers {costs.closedTrades} of {costs.reportedTrades} reported trades. These totals cover the stored subset.</p>{/if}
    <div class="row">
      <StatTile label="Price P&L before funding" value={usd(costs.beforeFundingPnl)} tone={sign(costs.beforeFundingPnl)} hint="Executable bid/ask fills; spread and timing are still included." />
      <StatTile label="Closed-trade funding" value={usd(costs.closedFunding)} tone={sign(costs.closedFunding)} />
      <StatTile label="Closed net P&L" value={usd(costs.closedNetPnl)} tone={sign(costs.closedNetPnl)} />
    </div>
    {#if costs.measuredTrades}
      <h3>Quote-supported subset · {costs.measuredTrades} trades</h3>
      <div class="row">
        <StatTile label="Fill-time midpoint P&L" value={usd(costs.midpointPnl)} tone={sign(costs.midpointPnl)} />
        <StatTile label="Less quoted spread" value={usd(-costs.spreadCost)} tone={sign(-costs.spreadCost)} />
        <StatTile label="Plus funding" value={usd(costs.measuredFunding)} tone={sign(costs.measuredFunding)} />
        <StatTile label="Rounding / protection" value={usd(costs.adjustmentPnl)} />
        <StatTile label="Subset net P&L" value={usd(costs.measuredNetPnl)} tone={sign(costs.measuredNetPnl)} />
      </div>
      <p><strong>{diagnoses[costs.diagnosis]}</strong>. This describes this subset, not a statistical verdict on the strategy.</p>
      <p>Fixed-trade double-spread scenario: <strong class={sign(costs.doubledSpreadPnl)}>{usd(costs.doubledSpreadPnl)}</strong>.
        Observed trades and sizes stay fixed; stops, signals and liquidations are not re-simulated.</p>
      <p>Execution timing: {costs.timedTrades} of {costs.measuredTrades} trades have both decision quotes.
        {#if costs.timedTrades}Decision-mid signal P&L {usd(costs.timedSignalPnl)}, timing cost {usd(costs.timingCost)} (positive adverse, negative favorable), final net {usd(costs.timedNetPnl)} for that timed subset.{/if}
        Older decision timing is unknown.</p>
    {:else}<p>No complete entry/exit quote evidence is stored yet. Missing spread and timing costs are unknown, not zero.</p>{/if}
  {/if}
  <p class="muted">{e.note}</p>
</section>

<style>
  .compare{display:grid;gap:10px;max-width:720px}.compare-row{display:grid;grid-template-columns:120px minmax(0,1fr) 80px;gap:10px;align-items:center;font-size:13px}
  .compare-row strong{text-align:right;font-variant-numeric:tabular-nums}.bar-track{height:16px;background:var(--grid);border-radius:3px;min-width:0}.bar-track div{height:100%;background:var(--good);border-radius:3px}.bar-track div.negative{background:var(--down)}
  .notice{border-left:3px solid var(--warning);padding-left:10px}.stack h3{font-size:14px;margin:0}
  @media(max-width:520px){.compare-row{grid-template-columns:92px minmax(0,1fr) 65px;font-size:12px;gap:6px}}
</style>
