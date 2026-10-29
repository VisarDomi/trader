import { expect,test } from 'bun:test';
import { LeaderboardPages } from './leaderboard-page';
import type { LeaderboardRow,EvidenceOverview } from '@trader/shared';
const row={runId:'fixture',epic:'US500'}as LeaderboardRow;
const url=(query='')=>new URL('https://trader.invalid/'+query);
function fixture(){
 let failRows=false,failScenarios=false,failEvidence=false,now=1000;
 const pages=new LeaderboardPages({leaderboard:async()=>{if(failRows)throw Error('timed out');return [row]},
  scenarios:async()=>{if(failScenarios)throw Error('counts down');return [{name:'standard',count:1}]},
  evidence:async()=>{if(failEvidence)throw Error('summary down');return {}as EvidenceOverview}},()=>now);
 return {pages,fail(){failRows=true},partial(){failScenarios=failEvidence=true},advance(){now+=11*60_000}};
}
test('supporting outages do not discard a successful leaderboard',async()=>{
 const f=fixture();f.partial();const d=await f.pages.load(url());
 expect(d.demo).toEqual([row]);expect(d.error).toBeNull();expect(d.warnings).toHaveLength(2);expect(d.evidence).toBeNull();
});
test('a transient row failure retains a labeled last success and expires after ten minutes',async()=>{
 const f=fixture();await f.pages.load(url());f.fail();const d=await f.pages.load(url());
 expect(d.demo).toEqual([row]);expect(d.savedAt).toBe(1000);expect(d.error).toBe('timed out');
 f.advance();const expired=await f.pages.load(url());expect(expired.demo).toEqual([]);expect(expired.savedAt).toBeNull();
});
test('saved rows never cross stages or execution scenarios',async()=>{
 const f=fixture();await f.pages.load(url());f.fail();
 for(const query of ['?view=demo','?view=backtest','?scenario=all','?retired=1']){
  const d=await f.pages.load(url(query));expect([...d.demo,...d.capital,...d.backtest]).toEqual([]);
 }
});
test('the fallback cache is bounded and empty successful results replace old rows',async()=>{
 let rows=[row],fail=false;
 const pages=new LeaderboardPages({leaderboard:async()=>{if(fail)throw Error('down');return rows},scenarios:async()=>[],evidence:async()=>({}as EvidenceOverview)});
 for(let i=0;i<7;i++)await pages.load(url('?scenario='+i));
 fail=true;expect((await pages.load(url('?scenario=0'))).demo).toEqual([]);
 fail=false;rows=[];await pages.load(url('?scenario=6'));fail=true;expect((await pages.load(url('?scenario=6'))).demo).toEqual([]);
});
