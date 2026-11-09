export interface LeaderboardState {
  group:'run'|'agent'|'family';epic:string;timeframe:string;leverage:string;query:string;
  evidenceFilter:string;pageNumber:number;hideControls:boolean;sortKey:string;sortDesc:boolean;
}
export function readLeaderboardState(url:URL):LeaderboardState {
  const p=url.searchParams,n=Number(p.get('page')??1);
  return {group:p.get('group')==='family'?'family':p.get('group')==='agent'?'agent':'run',
    epic:p.get('epic')??'',timeframe:p.get('timeframe')??'',leverage:p.get('leverage')??'',query:p.get('q')??'',
    evidenceFilter:p.get('evidence')??'all',pageNumber:Number.isSafeInteger(n)&&n>0?n:1,
    hideControls:p.get('controls')!=='1',sortKey:p.get('sort')??'totalReturn',sortDesc:p.get('asc')!=='1'};
}
export function leaderboardURL(url:URL,s:LeaderboardState):URL {
  const out=new URL(url);
  const values:Record<string,string>={group:s.group==='run'?'':s.group,epic:s.epic,timeframe:s.timeframe,leverage:s.leverage,q:s.query,
    evidence:s.evidenceFilter==='all'?'':s.evidenceFilter,page:s.pageNumber===1?'':String(s.pageNumber),controls:s.hideControls?'':'1',sort:s.sortKey==='totalReturn'?'':s.sortKey,asc:s.sortDesc?'':'1'};
  for(const [k,v]of Object.entries(values)){if(v)out.searchParams.set(k,v);else out.searchParams.delete(k)}return out;
}
export function isVisarCohort(id:string):boolean{return id.startsWith('visar-night-')}
export function matchesAgentQuery(id:string,name:string,query:string):boolean {
  if(query.trim().toLowerCase()==='visar')return isVisarCohort(id);
  return `${name} ${id}`.toLowerCase().includes(query.toLowerCase());
}
