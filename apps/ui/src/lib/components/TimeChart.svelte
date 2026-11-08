<script lang="ts">
 type Point={t:number;value:number};type Series={name:string;points:Point[]};type Marker={t:number;value:number|null;label:string};type Candle={t:number;open:number;high:number;low:number;close:number};
 let {series,markers=[],candles=[],gaps=[],height=260,unit='USD',precision=2,from=undefined,through=undefined}:{series:Series[];markers?:Marker[];candles?:Candle[];gaps?:{from:number;through:number}[];height?:number;unit?:string;precision?:number;from?:number;through?:number}=$props();
 const points=$derived(series.flatMap(s=>s.points)),times=$derived([...points.map(p=>p.t),...candles.map(c=>c.t)]);
 const start=$derived(from??(times.length?Math.min(...times):Math.min(...markers.map(m=>m.t)))),end=$derived(through??(times.length?Math.max(...times):Math.max(...markers.map(m=>m.t))));
 const values=$derived([...points.map(p=>p.value),...candles.flatMap(c=>[c.low,c.high]),...markers.filter(m=>m.t>=start&&m.t<=end).flatMap(m=>m.value===null?[]:[m.value])]);
 const low=$derived(values.length?Math.min(...values):0),high=$derived(values.length?Math.max(...values):1),pad=$derived(Math.max((high-low)*.08,Math.abs(high)*.00001,.000001));
 const x=(t:number)=>(t-start)/Math.max(1,end-start)*1000,y=(v:number)=>240-(v-low+pad)/(high-low+pad*2)*240;
 const path=(ps:Point[])=>ps.map((p,i)=>`${i===0||gaps.some(g=>g.from<p.t&&g.through>(ps[i-1]?.t??p.t))?'M':'L'}${x(p.t).toFixed(2)},${y(p.value).toFixed(2)}`).join(' ');
 const fmt=(n:number)=>n.toLocaleString(undefined,{maximumFractionDigits:precision,minimumFractionDigits:Math.min(precision,2)});
 const time=(t:number)=>new Date(t).toLocaleString([],{timeZone:'UTC',...(end-start>172800000?{month:'short' as const,day:'numeric' as const}:{hour:'2-digit' as const,minute:'2-digit' as const})});
 let hover=$state<number|null>(null);
 const at=$derived(hover===null?null:start+hover*(end-start));
 const inGap=$derived(at!==null&&gaps.some(g=>g.from<=at!&&g.through>=at!));
 const nearest=$derived(at===null||inGap?[]:series.map(s=>({name:s.name,p:s.points.reduce<Point|null>((a,p)=>!a||Math.abs(p.t-at!)<Math.abs(a.t-at!)?p:a,null)})));
 function move(e:PointerEvent){const r=e.currentTarget as HTMLElement;const box=r.getBoundingClientRect();hover=Math.max(0,Math.min(1,(e.clientX-box.left)/box.width));}
</script>
{#if !points.length&&!candles.length&&!markers.length}<div class="chart-empty">No recorded series</div>{:else}
<div class="plot" style:--chart-height={`${height}px`}>
 <div class="plot-head"><span class="muted">{unit} · UTC</span>{#if at!==null}<strong>{new Date(at).toLocaleString([],{timeZone:'UTC'})}{#if inGap} · No recorded quotes{/if}{#each nearest as n}<span> · {n.name} {n.p?fmt(n.p.value):'—'}</span>{/each}</strong>{/if}</div>
 <div class="plot-grid">
  <div class="axis-y">{#each [high+pad,(high+low)/2,low-pad] as v}<span>{fmt(v)}</span>{/each}</div>
  <div class="canvas" onpointermove={move} onpointerleave={()=>hover=null} role="img" aria-label={`${series.map(s=>s.name).join(', ')} from ${new Date(start).toLocaleString()} to ${new Date(end).toLocaleString()}`}>
   <svg viewBox="0 0 1000 240" preserveAspectRatio="none">
    {#each [0,60,120,180,240] as v}<line x1="0" x2="1000" y1={v} y2={v} class="grid"/>{/each}
    {#each gaps as g}<rect x={Math.max(0,x(g.from))} y="0" width={Math.max(0,Math.min(1000,x(g.through))-Math.max(0,x(g.from)))} height="240" class="gap"/>{/each}
    {#each candles as c}<line x1={x(c.t)} x2={x(c.t)} y1={y(c.high)} y2={y(c.low)} class="candle"/><line x1={x(c.t)-1} x2={x(c.t)+1} y1={y(c.open)} y2={y(c.close)} class="candle"/>{/each}
    {#each series as s,i}<path d={path(s.points)} fill="none" style:stroke={i===0?'var(--series-1)':i===1?'var(--series-2)':'var(--good)'} class="line"/>{/each}
    {#each markers.filter(m=>m.t>=start&&m.t<=end) as m}<line x1={x(m.t)} x2={x(m.t)} y1="0" y2="240" class="marker"/>{#if m.value!==null}<circle cx={x(m.t)} cy={y(m.value)} r="4" class="fill"/>{/if}{/each}
    {#if hover!==null}<line x1={hover*1000} x2={hover*1000} y1="0" y2="240" class="crosshair"/>{/if}
   </svg>
   <div class="marker-labels">{#each markers.filter(m=>m.t>=start&&m.t<=end) as m}<span style:left={`clamp(72px, ${x(m.t)/10}%, calc(100% - 72px))`}>{m.label} {m.value===null?'price unknown':fmt(m.value)}</span>{/each}</div>
  </div>
  <div></div><div class="axis-x"><span>{time(start)}</span><span>{time((start+end)/2)}</span><span>{time(end)}</span></div>
 </div>
 <div class="legend">{#each series.filter(s=>s.points.length) as s,i}<span><i style:background={i===0?'var(--series-1)':i===1?'var(--series-2)':'var(--good)'}></i>{s.name}</span>{/each}{#if candles.length}<span><i class="candle-key"></i>Minute candles</span>{/if}{#if gaps.length}<span><i class="gap-key"></i>Tick gap</span>{/if}</div>
</div>
{/if}
<style>
 .chart-empty{min-height:100px;display:grid;place-items:center;color:var(--ink-muted);border:1px dashed var(--grid);border-radius:6px}.plot{min-width:0}.plot-head{display:flex;justify-content:space-between;gap:12px;min-height:24px;font-size:11px;flex-wrap:wrap}.plot-head strong{font-weight:500;font-variant-numeric:tabular-nums}.plot-grid{display:grid;grid-template-columns:66px minmax(0,1fr);gap:6px}.axis-y{display:flex;flex-direction:column;justify-content:space-between;text-align:right;font-size:11px;color:var(--ink-muted);font-variant-numeric:tabular-nums}.canvas{position:relative;height:var(--chart-height);min-width:0;touch-action:pan-y}.canvas svg{height:100%;width:100%;overflow:visible}.grid{stroke:var(--grid);stroke-width:1;vector-effect:non-scaling-stroke}.line{stroke-width:1.6;vector-effect:non-scaling-stroke}.gap{fill:var(--surface-2)}.candle{stroke:var(--ink-muted);stroke-width:1;vector-effect:non-scaling-stroke}.marker{stroke:var(--ink-muted);stroke-dasharray:4 4;stroke-width:1;vector-effect:non-scaling-stroke}.fill{fill:var(--series-2)}.crosshair{stroke:var(--ink);stroke-width:1;vector-effect:non-scaling-stroke}.axis-x{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-muted)}.marker-labels{position:absolute;inset:0;pointer-events:none}.marker-labels span{position:absolute;top:4px;transform:translateX(-50%);font-size:10px;font-weight:600;background:var(--surface);padding:1px 4px;white-space:nowrap}.legend{display:flex;flex-wrap:wrap;gap:16px;margin:12px 0 0 72px;font-size:11px;color:var(--ink-2)}.legend i{display:inline-block;width:10px;height:3px;vertical-align:middle;margin-right:5px}.candle-key{background:var(--ink-muted)}.gap-key{background:var(--baseline)}
 @media(max-width:520px){.plot-grid{grid-template-columns:48px minmax(0,1fr)}.axis-y{font-size:10px}.legend{margin-left:54px}.canvas{height:min(var(--chart-height),220px)}}
</style>
