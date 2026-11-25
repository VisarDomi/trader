<script lang="ts">
 import type{PortfolioView}from'@trader/shared';
 import{assessPortfolio}from'@trader/shared';
 import{num,pct}from'$lib/format';
 import{portfolioBacktestLine,portfolioBarsLine,portfolioPaceLine,portfolioRuleLine,verdictWord}from'$lib/clock';
 import StatTile from'./StatTile.svelte';
 import TimeChart from'./TimeChart.svelte';
 // A portfolio judged as one record. `detail`: its return and the records it holds, for its own page.
 let{portfolio:p,detail=false}:{portfolio:PortfolioView;detail?:boolean}=$props();
 const a=$derived(assessPortfolio(p)),tone=(v:number|null)=>v==null?'':v>0?'up':v<0?'down':'';
 const curve=$derived(p.since===null?[]:[{t:p.since,value:0},...p.curve.map(x=>({t:x.t,value:x.value*100}))]);
 const utc=(t:number)=>new Date(t).toISOString().slice(0,10);
</script>
<section class="card stack">
 <div class="heading"><h2>{#if detail}{p.name}{:else}<a href="/portfolio/{p.id}">{p.name}</a>{/if}</h2><span class="muted small">{a.reason}</span></div>
 <div class="row"><StatTile label="Verdict" value={verdictWord(a.verdict)}/><StatTile label={`t · ${p.observations} weekdays`} value={num(p.t)} tone={tone(p.t)}/><StatTile label="Return since its first pick" value={pct(p.ret)} tone={tone(p.ret)}/><StatTile label={`Records · ${p.markets} markets`} value={String(p.records)} hint={`${p.agents} agent files`}/><StatTile label="Confirmed at" value={num(p.confirmAt)} hint="One claim made in advance: the always-valid bar for one record on its own"/></div>
 <p class="muted small">{portfolioRuleLine(p)}. {#if p.since}First pick {utc(p.since)}; the days before it do not count.{:else}No records picked yet.{/if}</p>
 <p class="muted small">{[portfolioBarsLine(p),portfolioPaceLine(p),portfolioBacktestLine(p)].filter(Boolean).join('. ')}.</p>
 {#if detail}
  {#if curve.length>2}<TimeChart series={[{name:'Return',points:curve}]} unit="%" height={220}/>{/if}
  {#if p.members.length}
  <div class="table-wrap"><table class="data"><thead><tr><th>Record</th><th>Market</th><th class="num">Leverage</th><th class="num">Share of capital</th><th class="num" title="Sharpe ratio of the same-code backtest's returns, before T-bills: what the record was picked on">Backtest Sharpe</th><th class="num">Return since the pick</th></tr></thead>
   <tbody>{#each p.members as m}<tr><td><a href="/agents/{m.agentId}">{m.name}</a></td><td><a href="/runs/{encodeURIComponent(m.runId)}">{m.epic}</a></td><td class="num">{m.leverage?`1:${m.leverage}`:'—'}</td><td class="num">{num(m.share*100,1)}%</td><td class="num">{num(m.backtestSharpe)}</td><td class="num {tone(m.ret)}">{m.ret==null?'—':pct(m.ret)}</td></tr>{/each}</tbody></table></div>
  {/if}
 {/if}
</section>
<style>.heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.heading h2{margin:0}.small{font-size:11px}p{margin:0}</style>
