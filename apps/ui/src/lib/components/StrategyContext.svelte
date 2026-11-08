<script lang="ts">
 import type{StrategyContext}from'../../../../backend/src/strategy/evidence';
 import TimeChart from'./TimeChart.svelte';
 let {context:d}:{context:StrategyContext}=$props();
 function number(v:number|null,unit:string):string{
  if(v===null)return 'Unknown';if(unit==='yes/no')return v?'Yes':'No';if(unit==='direction')return v>0?'Bullish':v<0?'Bearish':'Unqualified';
  if(unit==='minute of day')return `${String(Math.floor(v/60)).padStart(2,'0')}:${String(v%60).padStart(2,'0')}`;
  if(unit==='Sunday = 0')return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][Math.max(0,Math.min(6,v))];
  if(unit==='fraction')return number(v*100,'%');
  return v.toLocaleString(undefined,{maximumFractionDigits:unit==='Price'?5:Math.abs(v)>0&&Math.abs(v)<.01?6:3})+(unit==='%'?'%':unit&&unit!=='Price'?` ${unit}`:'');
 }
 function headroom(g:StrategyContext['gates'][number]):string{
  if(g.margin===null)return 'Headroom unknown';if(g.op==='=')return 'Exact match required';
  return `${g.margin>=0?'+':''}${number(g.unit==='fraction'?g.margin*100:g.margin,g.unit==='%'||g.unit==='fraction'?'pp':g.unit==='minute of day'?'minutes':g.unit)}${g.unit==='Price'?' points':''} headroom`;
 }
 function geometry(g:StrategyContext['gates'][number]){
  const limit=g.limit??0,span=Math.max(Math.abs(limit)*(g.unit==='Price'?.001:.5),Math.abs((g.value??limit)-limit)*1.6,limit===0?1:.000001),low=limit-span,high=limit+span;
  return {limit:50,value:((g.value??limit)-low)/(high-low)*100,above:g.op==='>'||g.op==='>='};
 }
</script>
<section class="stack strategy-context">
 {#each d.panels as panel,i}<section class="context-panel"><div class="row"><h3>{panel.title.replace('Previous New York session','Previous NY session').replace(' reference → 03:27 decision',' → 03:27')}</h3>{#if i===0&&d.basis==='reconstructed'}<span class="badge">Recomputed</span>{/if}</div>{#if panel.series.some(s=>s.points.length)}<TimeChart series={panel.series} guides={panel.guides} markers={panel.markers} candles={panel.candles??[]} from={panel.from} through={panel.through} unit={panel.unit} height={220}/>{:else}{#each panel.guides as guide}<div class="row"><span>{guide.label}</span><strong>{number(guide.value,panel.unit)}</strong></div>{/each}{/if}</section>{/each}
 {#if d.basis==='unavailable'&&!d.panels.length}<span class="muted">Setup data —</span>{/if}
 {#if d.gates.length}<section><h3>Entry limits</h3><div class="gates">{#each d.gates.filter(g=>!(g.state==='pass'&&['15-minute checkpoints','Session direction','Calendar allows entry','Entry clock','Weekday entry','Reference belongs to previous day'].includes(g.label))) as g}{@const geo=geometry(g)}{@const unit=g.label==='Session direction'?'direction':g.unit}<div class="gate"><div class="row"><strong>{g.label}</strong>{#if g.state==='fail'}<span class="down">Outside</span>{/if}</div><div class="numbers"><span>{number(g.value,unit)} {g.op} {number(g.limit,unit)}</span>{#if g.op!=='='}<span class:up={g.margin!==null&&g.state==='pass'} class:down={g.state==='fail'}>Δ {g.margin===null?'—':headroom(g).replace(' headroom','')}</span>{/if}</div>{#if g.op!=='='&&g.value!==null&&g.limit!==null}<div class="gauge" role="img" aria-label={`${g.label}: ${number(g.value,unit)}, rule ${g.op} ${number(g.limit,unit)}`}><div class="allowed" style:left={geo.above?'50%':'0'}></div><i class="limit"></i><i class="value" style:left={`${Math.max(0,Math.min(100,geo.value))}%`}></i></div>{/if}</div>{/each}</div></section>{/if}
 {#if d.protections.stopLoss!==null||d.protections.takeProfit!==null}<div class="row small">{#if d.protections.stopLoss!==null}<span>Initial stop <strong>{number(d.protections.stopLoss,'Price')}</strong></span>{/if}{#if d.protections.takeProfit!==null}<span>Target <strong>{number(d.protections.takeProfit,'Price')}</strong></span>{/if}</div>{/if}
</section>
<style>
 .row{justify-content:space-between;gap:10px;flex-wrap:wrap}.small{font-size:12px}.context-panel h3{margin:0}.context-panel>.row{margin-bottom:10px}.gates{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.gate{padding:10px;border-bottom:1px solid var(--grid);min-width:0}.gate strong{font-size:12px}.numbers{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;font-size:12px;font-variant-numeric:tabular-nums;margin:7px 0}.gauge{height:6px;position:relative;background:var(--surface-2);border-radius:2px;margin:9px 3px 4px}.allowed{position:absolute;inset-block:0;width:50%;background:var(--good);opacity:.15}.limit{position:absolute;left:50%;top:-3px;height:12px;border-left:1px dashed var(--ink-muted)}.value{position:absolute;top:-2px;width:3px;height:10px;background:var(--ink);transform:translateX(-50%)}@media(max-width:650px){.gates{grid-template-columns:1fr}}
</style>
