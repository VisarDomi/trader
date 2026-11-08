<script lang="ts">
 let {items,unit='%',height=undefined}:{items:{label:string;value:number;href?:string;note?:string}[];unit?:string;height?:number}=$props();
 const maximum=$derived(Math.max(.0001,...items.map(i=>Math.abs(i.value))));
 const format=(v:number)=>`${v>0?'+':''}${v.toLocaleString(undefined,{maximumFractionDigits:2})}${unit}`;
</script>
<div class="bars" style:max-height={height?`${height}px`:undefined}>
 {#each items as item}
  <div class="bar-row"><div class="bar-label">{#if item.href}<a href={item.href}>{item.label}</a>{:else}{item.label}{/if}{#if item.note}<small>{item.note}</small>{/if}</div><div class="bar-track"><div class:negative={item.value<0} style:left={item.value<0?`${50-Math.abs(item.value)/maximum*50}%`:'50%'} style:width={`${Math.abs(item.value)/maximum*50}%`}></div></div><strong class={item.value<0?'down':'up'}>{format(item.value)}</strong></div>
 {/each}
</div>
<style>.bars{display:grid;gap:12px;overflow:auto}.bar-row{display:grid;grid-template-columns:minmax(100px,1fr) minmax(60px,1.2fr) 80px;align-items:center;gap:12px;font-size:12px}.bar-label{min-width:0;overflow-wrap:anywhere}.bar-label a{text-decoration:none}.bar-label small{display:block;color:var(--ink-muted);font-size:10px}.bar-track{position:relative;height:15px;background:var(--surface-2);border-radius:2px}.bar-track:before{content:'';position:absolute;left:50%;height:100%;border-left:1px solid var(--baseline)}.bar-track div{position:absolute;top:3px;height:9px;background:var(--series-1);border-radius:1px}.bar-track div.negative{background:var(--down)}strong{font-variant-numeric:tabular-nums;text-align:right;font-weight:500}@media(max-width:520px){.bar-row{grid-template-columns:minmax(90px,1fr) minmax(45px,.7fr) 68px;gap:6px;font-size:11px}}</style>
