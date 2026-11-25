<script lang="ts">
 import type{BacktestFrequency,BacktestPeriods}from'@trader/shared';
 import{pct}from'$lib/format';
 import{daysText,frequencyLine,frequencySide,shareText,winsLine}from'$lib/frequency';
 import TimeChart from'./TimeChart.svelte';
 import StatTile from'./StatTile.svelte';
 let{frequency:f,periods}:{frequency:BacktestFrequency;periods:BacktestPeriods|null}=$props();
 const side=$derived(frequencySide(f)),month=(t:number)=>new Date(t).toISOString().slice(0,7);
 const points=$derived((periods?.points??[]).map(p=>({t:p.t,value:p.ret*100})));
</script>
<section class="card stack">
 <div class="heading"><h2>How often its backtest did this</h2><span class="muted small">{frequencyLine(f)}</span></div>
 <div class="row"><StatTile label={`Periods this ${side.well?'good':'bad'}`} value={side.count?shareText(side.count,f.periods):'Never'} hint={`${side.count} of ${f.periods} periods of ${daysText(f.days)}`}/><StatTile label={`Median ${daysText(f.days)}`} value={pct(periods?.median)}/><StatTile label="Best" value={pct(f.best)}/><StatTile label="Worst" value={pct(f.worst)}/></div>
 {#if points.length>1}<TimeChart series={[{name:`Backtest ${f.days}-day return`,points}]} guides={[{label:`This record`,value:f.observed*100}]} unit="%" precision={1} height={200}/>{/if}
 <p class="muted small">{side.count} of {f.periods} periods of {daysText(f.days)}{#if periods} in the {month(periods.from)} → {month(periods.through)} backtest{/if}{#if f.independent<f.periods}; they overlap, {f.independent} fit end to end{/if}.{#if f.wins} {winsLine(f)}.{/if}</p>
</section>
<style>.heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.heading h2{margin:0}.small{font-size:11px}p{margin:0}</style>
