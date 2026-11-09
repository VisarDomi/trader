import{expect,test}from'bun:test';
import{readLeaderboardState,leaderboardURL,matchesAgentQuery}from'./leaderboard-state';
test('rankings survive a detail/back/forward URL round trip without losing the cohort or page',()=>{
 const original=new URL('https://trader.invalid/?view=demo&scenario=standard');
 const state={...readLeaderboardState(original),query:'visar',epic:'US500',leverage:'20',group:'agent' as const,sortKey:'trades',sortDesc:false,pageNumber:3,hideControls:false,evidenceFilter:'user-experiment'};
 const saved=leaderboardURL(original,state);
 expect(readLeaderboardState(new URL(saved.href))).toEqual(state);
 expect(saved.searchParams.get('view')).toBe('demo');expect(saved.searchParams.get('scenario')).toBe('standard');
 const next=new URL(saved);next.searchParams.set('view','virtual');expect(readLeaderboardState(next)).toEqual(state);
});
test('invalid page and encoded search cannot rewrite navigation parameters',()=>{
 const u=new URL('https://trader.invalid/?page=-3');const s=readLeaderboardState(u);expect(s.pageNumber).toBe(1);
 s.query='visar&view=backtest#';const saved=leaderboardURL(u,s);expect(saved.searchParams.get('q')).toBe(s.query);expect(saved.searchParams.has('view')).toBe(false);
});
test('visar finds both experiment instruments and the original while old risk twin remains independently searchable',()=>{
 expect(matchesAgentQuery('visar-night-trading','Original',' VISAR ')).toBe(true);
 expect(matchesAgentQuery('visar-night-lab/body-20x','Body','visar')).toBe(true);
 expect(matchesAgentQuery('visar-night-us100/body-20x','Body','visar')).toBe(true);
 expect(matchesAgentQuery('night-risk-twin','Visar night small-risk twin','visar')).toBe(false);
 expect(matchesAgentQuery('night-risk-twin','Visar night small-risk twin','small-risk')).toBe(true);
});
