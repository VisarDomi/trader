import type { EvidenceOverview, LeaderboardRow, RunKind } from '@trader/shared';

interface Reader {
  leaderboard(kind:RunKind,retired?:boolean,stage?:string,scenario?:string):Promise<LeaderboardRow[]>;
  scenarios():Promise<{name:string;count:number}[]>;
  evidence():Promise<EvidenceOverview>;
}
const MAX_SAVED_PAGES=6,MAX_SAVED_BYTES=16*1024*1024,MAX_SAVED_AGE_MS=10*60_000;
interface Saved {rows:LeaderboardRow[];at:number;bytes:number}

/** Bounded last-success summaries only. No orders, credentials, recovery state or tick tape. */
export class LeaderboardPages {
  private saved=new Map<string,Saved>();
  constructor(private reader:Reader,private now=Date.now) {}
  async load(url:URL) {
    const requested=url.searchParams.get('view');
    const view=requested==='backtest'||requested==='demo'||requested==='overfit'?requested:'virtual';
    const retired=url.searchParams.get('retired')==='1',scenario=url.searchParams.get('scenario')||'standard';
    const kind=view==='backtest'?'backtest':'demo';
    const key=JSON.stringify([view==='overfit'?'virtual':view,retired,scenario]);
    const [result,scenarios,evidence]=await Promise.allSettled([
      this.reader.leaderboard(kind,view==='demo'||(view!=='backtest'&&retired),view==='demo'?'demo':'',view==='backtest'||view==='demo'?'':scenario),
      this.reader.scenarios(),this.reader.evidence(),
    ]);
    const warnings:string[]=[];
    if(scenarios.status==='rejected')warnings.push('Execution scenario counts are temporarily unavailable.');
    if(evidence.status==='rejected')warnings.push('The evidence summary is temporarily unavailable.');
    let rows:LeaderboardRow[],savedAt:number|null=null,error:string|null=null;
    if(result.status==='fulfilled') {
      rows=result.value;
      const bytes=new TextEncoder().encode(JSON.stringify(rows)).byteLength;
      this.saved.delete(key);
      if(bytes<=MAX_SAVED_BYTES)this.saved.set(key,{rows,bytes,at:this.now()});
      while(this.saved.size>MAX_SAVED_PAGES||[...this.saved.values()].reduce((n,v)=>n+v.bytes,0)>MAX_SAVED_BYTES)
        this.saved.delete(this.saved.keys().next().value!);
    } else {
      error=result.reason instanceof Error?result.reason.message:'The leaderboard is temporarily unavailable.';
      const saved=this.saved.get(key);
      if(saved&&this.now()-saved.at<=MAX_SAVED_AGE_MS){rows=saved.rows;savedAt=saved.at;}
      else {rows=[];this.saved.delete(key);}
    }
    return {demo:view==='virtual'||view==='overfit'?rows:[],backtest:view==='backtest'?rows:[],
      capital:view==='demo'?rows:[],scenarios:scenarios.status==='fulfilled'?scenarios.value:[],
      evidence:evidence.status==='fulfilled'?evidence.value:null,error,warnings,savedAt};
  }
}
