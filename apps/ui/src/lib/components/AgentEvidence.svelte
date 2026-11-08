<script lang="ts">
 import type{AgentEvidence}from'@trader/shared';
 import{num,pct,pctPlain,usd,utc,sign}from'$lib/format';
 import StatTile from'./StatTile.svelte';
 import ValueBars from'./ValueBars.svelte';
 let{evidence:e}:{evidence:AgentEvidence}=$props();
 const b=$derived(e.benchmark),c=$derived(e.costs);
</script>
<section class="stack">
 {#if e.dependency&&e.dependency.state!=='available'}<span class="badge">Forecast {e.dependency.state==='user-paused'?'paused':'offline'}</span>{/if}
 {#if b.status==='matched'}<div class="row"><h3>Benchmark</h3><span class="muted small">{utc(b.from)} → {utc(b.through)}</span></div><ValueBars items={[{label:'Strategy',value:(b.strategyReturn??0)*100},{label:'1:1 hold',value:(b.benchmarkReturn??0)*100}]}/><strong class={sign(b.excessReturn)}>{num((b.excessReturn??0)*100,2)} pp excess</strong>{/if}
 <div class="row"><StatTile label="Exposure" value={e.exposure==null?'—':`${num(e.exposure)}×`}/><StatTile label="Stop downside" value={pctPlain(e.stopRisk)}/><StatTile label="Open P&L" value={usd(e.unrealizedPnl)} tone={sign(e.unrealizedPnl)}/><StatTile label="Funding" value={usd(e.openFunding)} tone={sign(e.openFunding)}/></div>
 {#if c}<div class="row"><h3>Costs</h3><span class="muted small">Quotes {c.measuredTrades}/{c.closedTrades}{#if !c.historyComplete} · Trades {c.closedTrades}/{c.reportedTrades}{/if}</span></div>
 <div class="row"><StatTile label="Price P&L" value={usd(c.beforeFundingPnl)} tone={sign(c.beforeFundingPnl)}/><StatTile label="Funding" value={usd(c.closedFunding)} tone={sign(c.closedFunding)}/><StatTile label="Net" value={usd(c.closedNetPnl)} tone={sign(c.closedNetPnl)}/></div>
 {#if c.measuredTrades}<ValueBars unit=" USD" items={[{label:'Midpoint',value:c.midpointPnl},{label:'Spread',value:-c.spreadCost},{label:'Funding',value:c.measuredFunding},{label:'Adjustment',value:c.adjustmentPnl},{label:'Net',value:c.measuredNetPnl}]}/><div class="row"><StatTile label="2× spread · fixed trades" value={usd(c.doubledSpreadPnl)}/><StatTile label={`Timing · ${c.timedTrades} trades`} value={c.timedTrades?usd(c.timingCost):'—'}/></div>{/if}{/if}
</section>
<style>h3{margin:0}.small{font-size:11px}.row{justify-content:space-between;gap:10px}</style>
