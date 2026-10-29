import { defineAgent,localTime,TZ,type AgentContext } from '../src/sdk';

const MINUTE_MS=60_000;
const LONG='long',SHORT='short';
interface IntentState {
  day:string;open:number;high:number;low:number;prevRange:number;traded:boolean;
  side:typeof LONG|typeof SHORT|null;reference:number;stop:number;atr:number;expires:number;
}
const params={k:0.5,riskPct:0.5,gated:false,maxSpreadATR:0.10,maxAdverseATR:0.10,waitMinutes:2};
type Context=Pick<AgentContext<typeof params,IntentState>,'state'|'params'|'buy'|'sell'>;
function submit(ctx:Context,side:typeof LONG|typeof SHORT,stop:number,expires:number):void {
  const options={stopLoss:stop,riskPct:ctx.params.riskPct,validUntil:expires,reason:ctx.params.gated?'range breakout; spread/adverse-price gate':'range breakout; immediate control'};
  if(side===LONG)ctx.buy(options);else ctx.sell(options);
  ctx.state.traded=true;ctx.state.side=null;
}

/** Parameters/instruments frozen before testing. Tests execution selection, not a new alpha claim. */
export default defineAgent({
  name:'Quote-aware range breakout',
  description:'Paired 15m range-breakout study: immediate entry versus a two-minute tick gate for spread and adverse price movement. Identical 0.5% planned risk; US indices only.',
  author:'platform research',instruments:['US500','US100'],timeframe:'15m',leverage:[3],intradayOnly:true,warmup:16,
  params,variants:{immediate:{},'spread-gated':{gated:true}},
  init:():IntentState=>({day:'',open:0,high:0,low:0,prevRange:0,traded:false,side:null,reference:0,stop:0,atr:0,expires:0}),
  onBar(ctx){
    const s=ctx.state,ny=localTime(ctx.bar.time+6*3_600_000,TZ.NEW_YORK);
    if(ny.date!==s.day){if(s.day)s.prevRange=s.high-s.low;Object.assign(s,{day:ny.date,open:ctx.bar.open,high:ctx.bar.high,low:ctx.bar.low,traded:false,side:null});}
    else{s.high=Math.max(s.high,ctx.bar.high);s.low=Math.min(s.low,ctx.bar.low);}
    if(ctx.isWarmup||s.traded||ctx.position||s.side||s.prevRange<=0)return;
    const atr=ctx.ta.atr(14);if(!Number.isFinite(atr)||atr<=0)return;
    const side=ctx.bar.close>s.open+ctx.params.k*s.prevRange?LONG:ctx.bar.close<s.open-ctx.params.k*s.prevRange?SHORT:null;
    if(!side)return;
    const expires=ctx.time+ctx.params.waitMinutes*MINUTE_MS;
    if(!ctx.params.gated){submit(ctx,side,s.open,expires);return;}
    Object.assign(s,{side,stop:s.open,atr,expires,reference:ctx.tick?(side===LONG?ctx.tick.ask:ctx.tick.bid):ctx.bar.close});
  },
  onTick(ctx){
    const s=ctx.state;if(!s.side||ctx.isWarmup)return;
    if(ctx.position){s.side=null;return;}
    if(ctx.time>=s.expires){s.side=null;s.traded=true;return;}
    const side=s.side,price=side===LONG?ctx.tick.ask:ctx.tick.bid;
    if((side===LONG&&price<=s.stop)||(side===SHORT&&price>=s.stop)){s.side=null;s.traded=true;return;}
    const spread=ctx.tick.ask-ctx.tick.bid,adverse=(price-s.reference)*(side===LONG?1:-1);
    if(spread>ctx.params.maxSpreadATR*s.atr||adverse>ctx.params.maxAdverseATR*s.atr)return;
    submit(ctx,side,s.stop,s.expires);
  },
});
