<script lang="ts">
 import type{LeaderboardRow}from'@trader/shared';
 import{assess,LIFECYCLE,VERDICT}from'@trader/shared';
 import{num}from'$lib/format';
 import{agreementLine,barsLine,verdictWord}from'$lib/clock';
 import StatTile from'./StatTile.svelte';
 // The run with the fields the shared verdict reads (status, slug, agent, start, evidence.clock).
 let{row}:{row:Record<string,unknown>}=$props();
 const r=$derived(row as unknown as LeaderboardRow),c=$derived(r.evidence!.clock!),a=$derived(assess(r));
</script>
{#if a.verdict!==VERDICT.CONTROL&&a.verdict!==VERDICT.RETIRED}
<section class="card stack">
 <div class="heading"><h2>Edge or luck</h2><span class="muted small">{a.reason}</span></div>
 <div class="row"><StatTile label="Verdict" value={verdictWord(a.verdict)}/><StatTile label={`Daily t · ${c.observations} weekdays`} value={num(c.t)} tone={c.t>0?'up':c.t<0?'down':''}/><StatTile label="Candidate at" value={num(LIFECYCLE.CANDIDATE_TSTAT)}/><StatTile label={`Confirmed at · ${c.trials} tried`} value={num(c.confirmAt)} hint={`${num(c.aloneAt)} for one record on its own`}/></div>
 <p class="muted small">{barsLine(c)}. {agreementLine(c)}.{#if c.since>r.startedAt+60_000} Judged since its demotion from Capital demo; whole record t {num(c.life.t)} over {c.life.observations} weekdays.{/if}</p>
</section>
{/if}
<style>.heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.heading h2{margin:0}.small{font-size:11px}p{margin:0}</style>
