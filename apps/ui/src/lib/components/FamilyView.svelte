<script lang="ts">
 import type{FamilyView}from'@trader/shared';
 import{assessFamily}from'@trader/shared';
 import{num}from'$lib/format';
 import{familyAgreementLine,familyBarsLine,standingLine,standingTitle,verdictWord}from'$lib/clock';
 import StatTile from'./StatTile.svelte';
 // What the family says about one or more records of the same family; it changes nothing in their own verdicts.
 let{views}:{views:{label:string;family:FamilyView}[]}=$props();
 const f=$derived(views[0]!.family),a=$derived(assessFamily(f)),tone=(v:number)=>v>0?'up':v<0?'down':'';
</script>
<section class="card stack">
 <div class="heading"><h2>Family {f.name}</h2><span class="muted small">{a.reason}</span></div>
 <div class="row"><StatTile label="Family verdict" value={verdictWord(a.verdict)}/><StatTile label={`Family t · ${f.observations} weekdays`} value={num(f.t)} tone={tone(f.t)}/><StatTile label={`Records · ${f.markets} markets`} value={String(f.records)} hint={`${f.everRecords} ever ran in it`}/><StatTile label={`Confirmed at · ${f.trials} families tried`} value={num(f.confirmAt)} hint={`${num(f.aloneAt)} for one family on its own`}/></div>
 {#if views.some(v=>v.family.member)}
 <div class="table-wrap"><table class="data"><thead><tr><th>Record</th><th>Standing</th><th class="num">Own daily t</th><th class="num" title="The record's t with the luck taken out: the members' average plus the share of its lead that the spread between members supports">Family's estimate</th><th class="num">Average member</th></tr></thead>
  <tbody>{#each views as v}{#if v.family.member}<tr><td>{v.label||'This record'}</td><td>{standingTitle(v.family)}</td><td class="num {tone(v.family.member.t)}">{num(v.family.member.t)}</td><td class="num {tone(v.family.member.estimate)}">{num(v.family.member.estimate)}</td><td class="num">{num(v.family.member.average)}</td></tr>{/if}{/each}</tbody></table></div>
 <p class="muted small">{standingLine(views.find(v=>v.family.member)!.family)}.</p>
 {/if}
 <p class="muted small">{familyBarsLine(f)}. {familyAgreementLine(f)}. Each weekday the family is worth the average of its records, each at equal risk; retired records count on the days they ran. The family changes nothing in a record's own verdict.</p>
</section>
<style>.heading{display:flex;align-items:baseline;justify-content:space-between;gap:12px;flex-wrap:wrap}.heading h2{margin:0}.small{font-size:11px}p{margin:0}</style>
