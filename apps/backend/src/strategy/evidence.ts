import type { AgentContext, Bar, OrderOptions, Side } from '../sdk/types';
import { TIMEFRAME_MS } from '../sdk/types';
import { localTime, TZ } from '../sdk/time';
import { nightSessionFeatures, nightCalendarAllows,classifyNightSession } from '../../agents/visar-night-trading';
import { nightSessionFeatures as windowFeatures, classifyNightSession as windowClassify } from '../../agents/visar-night-v2-us500/reference';
import versions from './versions.json';

export type Basis = 'recorded' | 'reconstructed' | 'unavailable';
export interface Gate {
  label:string; value:number|null; limit:number|null; op:'>'|'<'|'>='|'<='|'='; unit:string;
  margin:number|null; state:'pass'|'fail'|'unknown'; note?:string;
}
export interface Plot {t:number;value:number}
export interface Panel {
  title:string; unit:string; note:string; series:{name:string;points:Plot[]}[];
  guides:{label:string;value:number}[]; markers:{t:number;value:number|null;label:string}[];
  candles?:{t:number;open:number;high:number;low:number;close:number}[];
  from?:number;through?:number;
}
export interface StrategyContext {
  schema:1; agentId:string; codeHash:string; at:number; barTime:number; basis:Basis;
  title:string; description:string; note:string; gates:Gate[]; panels:Panel[];
  exitRule:string; protections:{stopLoss:number|null;takeProfit:number|null;closeAt:number|null};
}
export type Inputs=Pick<AgentContext,'bar'|'bars'|'ta'|'tf'|'params'|'state'|'forecast'|'tick'|'time'|'timeframe'|'leverage'|'equity'|'position'>;
export const CONTEXT_BYTES=24*1024, CONTEXT_POINTS=72;
export const supportedVersions=versions as Record<string,{hash:string;timeframe:AgentContext['timeframe'];extra:AgentContext['timeframe'][];description:string}>;
export function beforeEntryState(slug:string,state:Record<string,unknown>):Record<string,unknown> {
  if(slug==='timesfm-band')return {q10:state.q10,q90:state.q90};
  if(slug==='timesfm-vol-breakout'){
    const widths=state.widths as number[]|undefined;
    return {typical:widths&&widths.length>=20?[...widths].sort((a,b)=>a-b)[Math.floor(widths.length/2)]:undefined};
  }
  return {};
}
const finite=(v:unknown):number|null=>typeof v==='number'&&Number.isFinite(v)?v:null;
const last=(xs:readonly number[])=>xs.at(-1)??NaN;
export function atLocal(date:string,zone:string,minute:number):number {
  const [y,m,d]=date.split('-').map(Number),desired=Date.UTC(y!,m!-1,d!,Math.floor(minute/60),minute%60);
  let at=desired;
  for(let i=0;i<3;i++){const l=localTime(at,zone);at+=desired-Date.UTC(l.year,l.month-1,l.day,l.hour,l.minute);}
  return at;
}
export function gate(label:string,value:number|null,op:Gate['op'],limit:number,unit='',note?:string):Gate {
  value=finite(value);
  const known=value!==null&&Number.isFinite(limit);
  const margin=!known?null:op==='<'||op==='<='?limit-value!:op==='='?-Math.abs(value!-limit):value!-limit;
  const pass=value!==null&&(op==='>'?value>limit:op==='>='?value>=limit:op==='<'?value<limit:op==='<='?value<=limit:value===limit);
  return {label,value,op,limit:finite(limit),unit,margin,state:!known?'unknown':pass?'pass':'fail',...(note?{note}:{})};
}
function sampled(bars:readonly Bar[],values:readonly number[],tf:number,fullWindow=false):Plot[]{
  const from=fullWindow?0:Math.max(0,bars.length-120),step=Math.max(1,Math.ceil((bars.length-from)/CONTEXT_POINTS));
  const out:Plot[]=[];
  for(let i=from;i<bars.length;i++)if((i-from)%step===0||i===bars.length-1)if(Number.isFinite(values[i]))out.push({t:bars[i]!.time+tf,value:values[i]!});
  return out;
}
function annual(b:readonly Bar[],n:number):number {
  if(b.length<=n)return NaN;let sum=0;
  for(let i=b.length-n;i<b.length;i++)sum+=Math.log(b[i]!.close/b[i-1]!.close)**2;
  return Math.sqrt(sum*365.25*86400000/(b.at(-1)!.time-b.at(-1-n)!.time))*100;
}

/** Pure read-only adapter. Pin every adapter to the reviewed strategy source version. */
export function explain(agentId:string,hash:string,c:Inputs,side:Side,opts:OrderOptions={},basis:Basis='recorded',before:Record<string,any>={}):StrategyContext {
  const slug=agentId.split('/')[0]!,meta=supportedVersions[slug],p=c.params as Record<string,any>,s=c.state as Record<string,any>;
  const out:StrategyContext={schema:1,agentId,codeHash:hash,at:c.time,barTime:c.bar.time,basis,title:'Strategy setup',description:meta?.description??agentId,
    note:basis==='recorded'?'Inputs retained when the entry was requested.':'Recomputed from closed archive candles; original decision inputs were not retained. Stateful and recursive indicators may differ from the live decision.',gates:[],panels:[],exitRule:'Recorded exit reason and order protections determine the close.',
    protections:{stopLoss:finite(opts.stopLoss),takeProfit:finite(opts.takeProfit),closeAt:finite(opts.closeAt)}};
  if(!meta||meta.hash!==hash){out.basis='unavailable';out.note='This source version has no reviewed explanation adapter. Its recorded reason remains available.';return out;}
  const g=(label:string,value:number,op:Gate['op'],limit:number,unit='',note?:string)=>out.gates.push(gate(label,finite(value),op,limit,unit,note));
  const b=c.bars,ta=c.ta,price=c.bar.close,dir=side==='long'?1:-1,tf=TIMEFRAME_MS[c.timeframe];
  const panel=(title:string,series:Record<string,readonly number[]>,unit='Price',guides:Panel['guides']=[],bars=b)=>{
    const pts=Object.entries(series).map(([name,v])=>({name,points:sampled(bars,v,bars===b?tf:14400000)}));
    out.panels.push({title,unit,note:'Closed bars ending at the signal; no later prices.',series:pts,guides,markers:[{t:c.bar.time+tf,value:unit==='Price'?price:null,label:'SIGNAL'}]});
  };
  const priceSeries=()=>b.map(x=>x.close);
  const threshold=(label:string,value:number,limit:number,unit='Price')=>g(label,value,dir>0?'>':'<',limit,unit);
  const cross=(label:string,a:readonly number[],z:readonly number[]|number)=>{
    const previous=a.at(-2)!,now=last(a),old=typeof z==='number'?z:z.at(-2)!,current=typeof z==='number'?z:last(z);
    g(label+' · now',dir*(now-current),'>',0,'points');g(label+' · previous',dir*(previous-old),'<=',0,'points');
  };
  if(slug==='visar-night-trading'||slug==='night-risk-twin'||slug==='visar-night-lab'||slug==='visar-night-us100'||slug.startsWith('visar-night-v2-')){
    out.title='Directional New York day → overnight pullback';
    const startMinute=p.sessionStart??570,endMinute=p.sessionEnd??960,minutes=endMinute-startMinute;
    const day=s.session,f=day?.points?.length?(slug.startsWith('visar-night-v2-')?windowFeatures(day,minutes):nightSessionFeatures(day)):null;
    const specs:[string,number,Gate['op'],number,string][]=[['Directional move',f?.movePct??NaN,'>=',p.trendPct,'%'],['Path efficiency',(f?.efficiency??NaN)*100,'>=',p.minEfficiency*100,'%'],['Agreeing 15-minute steps',(f?.directionalShare??NaN)*100,'>=',p.minDirectionalShare*100,'%'],['Largest counter-move / range',(f?.retraceShare??NaN)*100,'<=',p.maxRetraceShare*100,'%'],['Session range',f?.rangePct??NaN,'<=',p.maxRangePct,'%'],['Net move / range',(f?.bodyShare??NaN)*100,'>=',p.minBodyShare*100,'%'],['Observed minutes',f?.minutes??NaN,'>=',Math.ceil(minutes*p.minCoverage),'minutes'],['15-minute checkpoints',f?.checkpoints??NaN,'=',minutes/15+1,'points']];
    for(const x of specs)g(...x);
    if(day?.date&&f){
      const start=atLocal(day.date,TZ.NEW_YORK,startMinute),points=day.points.map((value:number,i:number)=>({t:start+i*900000,value})),classified=slug.startsWith('visar-night-v2-')?windowClassify(f,p as any,minutes):classifyNightSession(f,p as any);
      out.panels.push({title:`Previous New York session · ${classified>0?'bullish':classified<0?'bearish':'did not qualify'}`,unit:'Price',note:`${startMinute===630?'10:30–15:30; first hour and last half-hour ignored':'09:30–16:00'} New York · 15-minute decision checkpoints. Intraminute retraces use conservative high/low excursions.`,series:[{name:'Session path',points}],guides:[{label:'Recognition open',value:day.open},{label:'Minimum bullish close',value:day.open*(1+p.trendPct/100)},{label:'Maximum bearish close',value:day.open*(1-p.trendPct/100)}],markers:[],from:start,through:start+minutes*60000});
      const entry=localTime(c.time,p.timeZone),yesterday=new Date(Date.UTC(entry.year,entry.month-1,entry.day)-86400000).toISOString().slice(0,10);
      g('Session direction',classified,'=',dir,'');g('Calendar allows entry',nightCalendarAllows(yesterday,entry.date)?1:0,'=',1,'yes/no');
      g('Entry clock',entry.minuteOfDay,'=',207,'minute of day');
      g('Weekday entry',entry.weekday>=1&&entry.weekday<=5?1:0,'=',1,'yes/no');
      g('Reference belongs to previous day',s.referenceDate===yesterday?1:0,'=',1,'yes/no');
      if(s.reference>0){g(side==='long'?'Dip below 22:00 reference':'Bounce above 22:00 reference',price,side==='long'?'<':'>',s.reference,'Price');
        const minimum=p.minPullbackBp??0;
        if(slug.startsWith('visar-night-v2-'))g('Minimum opposite-side bid gap',dir*(s.reference-price)/s.reference*10000,'>=',minimum,'bp');
        const at=atLocal(yesterday,p.timeZone,1320),candles=b.filter(x=>x.time+tf>=at);
        out.panels.push({title:'22:00 reference → 03:27 decision',unit:'Price',note:`${p.timeZone} · last closed bid prices, before execution spread. Minimum counter-move ${minimum}bp.`,series:[{name:'Overnight price',points:sampled(candles,candles.map(x=>x.close),tf,true)}],guides:[{label:'22:00 reference',value:s.reference},...(minimum>0?[{label:`${minimum}bp entry boundary`,value:s.reference*(1-dir*minimum/10000)}]:[])],markers:[{t:c.bar.time+tf,value:price,label:'SIGNAL'}],from:at,through:c.bar.time+tf});
      }else g('22:00 reference',NaN,'>',0,'Price');
    }
    out.exitRule=`${p.profitPct?`Profit target +${p.profitPct}% of this trade's entry capital, or `:''}08:27 ${p.timeZone}; protective loss budget ${p.lossPct}% of entry capital. Targets are rebased to actual fill/rounded size. Opening/reference candles, coverage and policy-event filters must qualify.`;
  }else if(['ema-cross','timesfm-trend'].includes(slug)){
    const a=ta.series.ema(p.fast),z=ta.series.ema(p.slow);panel('Price and trend averages',{Price:priceSeries(),[`EMA ${p.fast}`]:a,[`EMA ${p.slow}`]:z});
    if(slug==='ema-cross')cross('EMA crossover',a,z);else g('Fast vs slow EMA',last(a),dir>0?'>':'<=',last(z),'Price');
    out.exitRule='Opposite crossover / forecast disagreement, or the recorded protective stop.';
  }else if(slug==='macd-trend'){
    const m=ta.series.macd(12,26,9),trend=ta.series.ema(p.trend);panel('Price and trend EMA',{Price:priceSeries(),[`EMA ${p.trend}`]:trend});panel('MACD crossover',{MACD:m.macd,Signal:m.signal},'points');cross('MACD cross',m.macd,m.signal);threshold('Price vs trend EMA',price,last(trend));out.exitRule='Opposite MACD cross, stop or profit target.';
  }else if(slug==='adx-dmi'){
    const d=ta.series.adx(p.period);panel('Directional strength',{ADX:d.adx,'+DI':d.plusDI,'−DI':d.minusDI},'index',[{label:'Entry ADX',value:p.adxMin},{label:'Exit ADX',value:p.adxExit}]);g('Trend strength ADX',last(d.adx),'>',p.adxMin);cross('Directional crossover',d.plusDI,d.minusDI);out.exitRule='ADX below exit threshold or opposite DI cross; protective stop also applies.';
  }else if(slug==='hma-slope'){
    const h=ta.series.hma(p.period);panel('Hull moving average turn',{Price:priceSeries(),HMA:h});g('Current slope',dir*(last(h)-h.at(-2)!),'>',0,'points');g('Previous slope',dir*(h.at(-2)!-h.at(-3)!),'<=',0,'points');out.exitRule='Opposite Hull slope turn or protective stop.';
  }else if(slug==='rsi2-reversion'){
    const r=ta.series.rsi(2),trend=ta.series.sma(p.trend);panel('Trend filter',{Price:priceSeries(),[`SMA ${p.trend}`]:trend,[`Exit SMA ${p.exitMa}`]:ta.series.sma(p.exitMa)});panel('RSI(2) extreme',{RSI:r},'RSI',[{label:'Long entry',value:p.low},{label:'Short entry',value:p.high}]);g('RSI extreme',last(r),dir>0?'<':'>',dir>0?p.low:p.high,'RSI');threshold('Trend direction',price,last(trend));out.exitRule=`Bounce through SMA ${p.exitMa}, RSI beyond ${dir>0?70:30}, ${p.maxBars} bars, or stop.`;
  }else if(slug==='stoch-range'){
    const st=ta.series.stoch(p.k,p.d),adx=ta.series.adx(14);panel('Stochastic turn',{'%K':st.k,'%D':st.d},'index',[{label:'Oversold',value:p.low},{label:'Overbought',value:p.high}]);panel('Range filter',{ADX:adx.adx},'ADX',[{label:'Maximum ADX',value:p.adxMax}]);cross('Stochastic crossover',st.k,st.d);g('Stochastic extreme',last(st.k),dir>0?'<':'>',dir>0?p.low:p.high);g('Range ADX',last(adx.adx),'<',p.adxMax);out.exitRule='Recorded ATR stop or reward/risk target.';
  }else if(slug==='zscore-fade'){
    const z=ta.series.zscore(p.period);panel('Distance from rolling mean',{Z:z},'standard deviations',[{label:'Long entry',value:-p.entryZ},{label:'Short entry',value:p.entryZ},{label:'Exit mean',value:0}]);g('Stretched price',last(z),dir>0?'<':'>',dir>0?-p.entryZ:p.entryZ,'σ');out.exitRule=`Z returns to ${p.exitZ}; ${p.maxBars} bars; or protective stop.`;
  }else if(['bollinger-fade','keltner-trend','squeeze-breakout'].includes(slug)){
    const bb=ta.series.bollinger(p.period,p.mult??2),kc=ta.series.keltner(p.period,slug==='squeeze-breakout'?1.5:p.mult??2),bands=slug==='keltner-trend'?kc:bb;
    panel('Price and decision bands',{Price:priceSeries(),Upper:bands.upper,Middle:bands.middle,Lower:bands.lower});
    const fade=slug==='bollinger-fade';g('Band boundary',price,(dir>0)!==fade?'>':'<',(dir>0)!==fade?last(bands.upper):last(bands.lower),'Price');
    if(fade){g('Range ADX',ta.adx(14).adx,'<',p.adxMax);g('RSI filter',ta.rsi(14),dir>0?'<':'>',dir>0?30:70,'RSI');}
    if(slug==='squeeze-breakout'){let n=0;for(let i=2;i<=p.minSqueezeBars+1;i++){if(bb.upper.at(-i)!<kc.upper.at(-i)!&&bb.lower.at(-i)!>kc.lower.at(-i)!)n++;else break;}g('Prior squeeze bars',n,'>=',p.minSqueezeBars,'bars');panel('Compression widths',{'Bollinger width':bb.upper.map((v,i)=>v-bb.lower[i]!),'Keltner width':kc.upper.map((v,i)=>v-kc.lower[i]!)},'points');}
    out.exitRule=slug==='squeeze-breakout'?'ATR trailing protection or session close.':'Return to the middle band or protective stop.';
  }else if(['donchian-breakout','timesfm-vol-breakout','donchian-ensemble'].includes(slug)){
    const periods=slug==='donchian-ensemble'?[10,20,55,100,200]:[p.entry??p.channel];
    for(const n of periods){const d=ta.series.donchian(n),high=[NaN,...d.upper.slice(0,-1)],low=[NaN,...d.lower.slice(0,-1)];if(n===periods[0]||n===periods.at(-1))panel(`${n}-bar previous channel`,{Price:priceSeries(),High:high,Low:low});if(slug!=='donchian-ensemble')threshold('Previous channel break',price,dir>0?last(high):last(low));}
    if(slug==='donchian-ensemble'){g('Systems long',s.systemsLongCount??(Array.isArray(s.long)?s.long.filter(Boolean).length:NaN),'>',0,'of 5',s.systemsLongCount!==undefined?'Count retained in the entry reason; individual system membership was not recorded.':undefined);out.exitRule='Shorter channel exits alter the five-system allocation; resize only beyond the stated band.';}else out.exitRule='Opposite shorter channel, trailing protection or stop.';
  }else if(slug==='supertrend'){
    const st=ta.series.supertrend(p.period,p.mult);panel('SuperTrend line and flip',{Price:priceSeries(),SuperTrend:st.value});g('New direction',last(st.direction),'=',dir);g('Previous direction',st.direction.at(-2)!,'=',-dir);out.exitRule='SuperTrend flips against the position or its trailing line is reached.';
  }else if(slug==='mtf-pullback'){
    const h=c.tf('4h'),a=h.ta.series.ema(p.fast),z=h.ta.series.ema(p.slow),r=ta.series.rsi(14);panel('4-hour trend',{'Fast EMA':a,'Slow EMA':z},'Price',[],h.bars);threshold('4h fast vs slow EMA',last(a),last(z));panel('1-hour pullback reversal',{RSI:r},'RSI',[{label:'RSI trigger',value:dir>0?p.rsiLevel:100-p.rsiLevel}]);cross('RSI recovery',r,dir>0?p.rsiLevel:100-p.rsiLevel);out.exitRule='Recorded swing stop or reward/risk target.';
  }else if(['tsmom','leverage-ladder','bold-play','lrs-sma200','tsmom-12m'].includes(slug)){
    if(slug==='lrs-sma200'){const avg=ta.series.sma(p.trendDays);panel('Long-term trend filter',{Price:priceSeries(),[`SMA ${p.trendDays}`]:avg});g('Close above average',price,'>',last(avg),'Price');out.exitRule='Close below the long-term average.';}
    else if(slug==='leverage-ladder'&&p.mode==='hold'){panel('Passive holding',{Price:priceSeries()});out.note+=' This control buys and holds; there is no directional entry filter.';}
    else {const n=p.lookback??p.lookbackBars,roc=slug==='tsmom-12m'?b.map((x,i)=>{let j=i;while(j>=0&&b[j]!.time>x.time-p.lookbackDays*86400000)j--;return j<0?NaN:(x.close/b[j]!.close-1)*100;}):ta.series.roc(n);const limit=slug==='tsmom'?p.deadband*ta.atr(20)/price*100:0;panel('Trailing return signal',{Return:roc},'%', [{label:'Long boundary',value:limit},{label:'Short boundary',value:-limit}]);g('Directional return',dir*last(roc),slug==='bold-play'?'>=':'>',limit,'%');out.exitRule=slug==='tsmom-12m'?'Monthly rebalance / changed annual return direction.':'Direction reversal or recorded protection.';}
  }else if(['volatility-breakout','quote-breakout','orb-ny','london-breakout','inside-bar','swing-reversal','noise-area-momentum'].includes(slug)){
    let high=NaN,low=NaN;
    if(slug==='inside-bar'){high=s.motherHigh||NaN;low=s.motherLow||NaN;g('Setup age',s.age,'<=',p.maxAgeBars,'bars');}
    else if(slug==='swing-reversal'){high=s.swingHigh;low=s.swingLow;const up=(price-low)/low*100,down=(high-price)/high*100;g('Reversal away from swing',dir>0?up:down,'>=',p.trendPct,'%');g('Opposing reversal',dir>0?down:up,'<',p.trendPct,'%');high=high*(1-p.trendPct/100);low=low*(1+p.trendPct/100);}
    else if(slug==='volatility-breakout'||slug==='quote-breakout'){high=s.open+p.k*s.prevRange;low=s.open-p.k*s.prevRange;g('Prior session range',s.prevRange,'>',0,'points');if(slug==='quote-breakout'&&p.gated){g('Spread / setup ATR',c.tick&&s.atr>0?(c.tick.ask-c.tick.bid)/s.atr:NaN,'<=',p.maxSpreadATR,'ATR');g('Adverse move / setup ATR',c.tick&&s.atr>0?dir*((dir>0?c.tick.ask:c.tick.bid)-s.reference)/s.atr:NaN,'<=',p.maxAdverseATR,'ATR');}}
    else if(slug==='noise-area-momentum'){const now=localTime(c.time,TZ.NEW_YORK),history=s.noise?.[String(now.minuteOfDay)]??[],sigma=history.length>=p.lookbackDays?history.reduce((a:number,v:number)=>a+v,0)/history.length:NaN,vwap=s.vol>0?s.pv/s.vol:price;high=Math.max(s.open,s.prevClose)*(1+sigma);low=Math.min(s.open,s.prevClose)*(1-sigma);g('Noise history',history.length,'>=',p.lookbackDays,'sessions');threshold('VWAP confirmation',price,vwap);out.panels.push({title:'Session VWAP and noise limits',unit:'Price',note:'Limits at the decision; the historical curve is the price lead-up.',series:[{name:'Price',points:sampled(b,priceSeries(),tf)}],guides:[{label:'Upper noise',value:high},{label:'Lower noise',value:low},{label:'VWAP',value:vwap}].filter(x=>Number.isFinite(x.value)),markers:[]});}
    else {high=s.high;low=s.low;const l=localTime(c.bar.time,slug==='orb-ny'?TZ.NEW_YORK:TZ.LONDON);g('Entry before cutoff',l.hour,'<',p.lastEntryHour,'hour');g('Opening range complete',l.minuteOfDay,'>=',slug==='orb-ny'?570+p.rangeMinutes:p.rangeEndHour*60,'minute of day');}
    if(slug!=='swing-reversal')threshold('Breakout boundary',price,dir>0?high:low);
    panel(slug==='swing-reversal'?'Swing reversal trigger':'Setup range and breakout',{Price:priceSeries()},'Price',[{label:slug==='swing-reversal'?'Short trigger':'Upper boundary',value:high},{label:slug==='swing-reversal'?'Long trigger':'Lower boundary',value:low}].filter(x=>Number.isFinite(x.value)));
    if(slug==='inside-bar')out.panels.at(-1)!.candles=b.slice(-12).map(x=>({t:x.time+tf,open:x.open,high:x.high,low:x.low,close:x.close}));
    out.exitRule='Opposite range / swing protection, profit target or scheduled session close, as defined by this source.';
  }else if(slug==='ibs-dip'){
    const ibs=s.high>s.low?(price-s.low)/(s.high-s.low):NaN,h=c.tf('1d');g('Close above daily trend',price,'>',h.ta.sma(p.trendDays),'Price');
    if(p.rule==='composite'){
      const closes=s.closes as number[]|undefined;let rsi=NaN,three=false;
      if(closes){let gain=0,loss=0;for(let i=1;i<closes.length;i++){const d=closes[i]!-closes[i-1]!,up=Math.max(d,0),down=Math.max(-d,0);if(i<=2){gain+=up/2;loss+=down/2;}else{gain=(gain+up)/2;loss=(loss+down)/2;}}rsi=closes.length<3?50:loss===0?100:100-100/(1+gain/loss);three=closes.length>=4&&closes.at(-1)!<closes.at(-2)!&&closes.at(-2)!<closes.at(-3)!&&closes.at(-3)!<closes.at(-4)!;}
      g('At least one dip condition',closes&&Number.isFinite(ibs)?Number(ibs<p.ibsMax||rsi<p.rsiMax||three):NaN,'=',1,'yes/no',`Alternatives: IBS < ${p.ibsMax}, RSI(2) < ${p.rsiMax}, or three lower closes. Session RSI ${Number.isFinite(rsi)?rsi.toFixed(2):'not retained'}; three lower closes ${closes?(three?'yes':'no'):'not retained'}.`);
    }else g('Session IBS',ibs,'<',p.ibsMax,'fraction');
    panel('Cash-session range location',{Price:priceSeries()},'Price',[{label:'Session high',value:s.high},{label:'IBS boundary',value:s.low+p.ibsMax*(s.high-s.low)},{label:'Session low',value:s.low}].filter(x=>Number.isFinite(x.value)));out.exitRule=p.rule==='pagonidis'?'Next 16:00 New York close.':`Above ${p.exitAvg}-session mean, ${p.maxSessions} sessions, or protective stop.`;
  }else if(['vol-target','vol-managed-hold','constant-leverage','shannon-demon'].includes(slug)){
    const recent=annual(b,p.lookback??p.shortBars??21),normal=annual(b,p.longBars??252);panel('Price before allocation',{Price:priceSeries()});
    if(slug.startsWith('vol-')){const target=slug==='vol-target'?Math.min(p.maxExposure,p.targetVol/recent):p.maxExposure*Math.min(1,normal/recent);g('Realized volatility',recent,'>',0,'%');if(slug==='vol-managed-hold'&&c.position)g('Change from existing exposure',Math.abs(target-c.position.size*price/c.equity),'>=',p.minChange,'×');out.panels.push({title:'Volatility and allocation at decision',unit:'%',note:`Target exposure ${Number.isFinite(target)?target.toFixed(2)+'×':'unavailable'}. Annualized by elapsed calendar time.`,series:[],guides:[{label:'Recent volatility',value:recent},{label:slug==='vol-target'?'Volatility target':'Long-run volatility',value:slug==='vol-target'?p.targetVol:normal}].filter(x=>Number.isFinite(x.value)),markers:[]});}
    else {const target=slug==='shannon-demon'?p.target:p.leverageShare*c.leverage;if(c.position){const actual=c.position.size*price/c.equity;g('Allocation drift',slug==='shannon-demon'?Math.abs(actual-target):Math.abs(actual/target-1),'>',p.band,'×');}else out.note+=' Initial allocation has no existing weight to rebalance.';}
    out.exitRule='Resize / rebalance when the allocation or calendar rule calls for it.';
  }else if(['gold-session','overnight-drift','crypto-sunday-asia','turn-of-month'].includes(slug)){
    const zone=slug==='gold-session'?TZ.LONDON:TZ.NEW_YORK,l=localTime(c.time,zone);let minute=slug==='gold-session'?(dir>0?900:630):slug==='overnight-drift'?960:slug==='crypto-sunday-asia'?p.hour*60:960;
    panel('Price into scheduled entry',{Price:priceSeries()});g('Scheduled entry clock',l.minuteOfDay,'=',minute,'minute of day');
    if(slug==='crypto-sunday-asia')g('Entry weekday',l.weekday,'=',0,'Sunday = 0');
    if(slug==='turn-of-month'){let left=0;for(let d=l.day+1;d<=new Date(Date.UTC(l.year,l.month,0)).getUTCDate();d++)if(![0,6].includes(new Date(Date.UTC(l.year,l.month-1,d)).getUTCDay()))left++;g('Weekdays remaining after entry',left,'=',1,'days');}
    out.exitRule=slug==='gold-session'?'Next London 10:30 / 15:00 fix for the selected variant.':slug==='overnight-drift'?'Next 09:30 New York cash open or crash stop.':slug==='crypto-sunday-asia'?'Monday at the same New York hour.':`Close of trading day ${p.daysAfter} of the new month.`;
    out.note+=` Calendar strategy in ${zone}; price direction is not an entry requirement.`;
  }else if(['random-baseline','skew-monkey','martingale-monkey'].includes(slug)){
    panel('Control entry and price context',{Price:priceSeries()});out.note+=' Random control: the price path did not select the direction. Historical random draws are not reconstructed.';
    if(slug==='martingale-monkey')g('Risk ceiling',s.riskPct,'<=',p.maxRiskPct,'%');out.exitRule='Control stop/target; martingale risk changes after a loss.';
  }else if(slug==='buy-hold'){
    panel('Passive benchmark entry',{Price:priceSeries()});out.note+=' Passive control: opens when flat; there is no bullish/bearish signal filter.';out.exitRule='Hold until stopped or the test ends.';
  }
  if(slug.startsWith('timesfm-')){
    const f=c.forecast,step=p.step??(p.horizon??p.lookahead)-1;
    if(f){
      const median=f.median[step]!,q10=f.quantile(.1,step),q90=f.quantile(.9,step),sigma=(q90-q10)/2.56;
      if(slug==='timesfm-drift'||slug==='timesfm-trend')g('Forecast direction / uncertainty',dir*(median-price)/sigma,'>',p.entryZ??p.minZ,'σ');
      if(slug==='timesfm-swing')g('Inner forecast band clears price',dir>0?f.quantile(.3,step):f.quantile(.7,step),dir>0?'>':'<',price,'Price');
      if(slug==='timesfm-vol-breakout')g('Forecast width expansion',(q90-q10)/price,'>',p.expansion*before.typical,'fraction');
      if(slug==='timesfm-band'){
        g('Forecast retrace clears spread',dir*(median-price),'>',2*c.bar.spread,'points');
        g('Previous forecast surprise',price,dir>0?'<':'>',dir>0?before.q10:before.q90,'Price');
        panel('Close against the previous forecast band',{Price:priceSeries()},'Price',[{label:'Previous 10%',value:before.q10},{label:'Previous 90%',value:before.q90}].filter(x=>Number.isFinite(x.value)));
      }
      const times=f.median.map((_,i)=>c.bar.time+tf*(i+2));
      out.panels.push({title:'Forecast available at the decision',unit:'Price',note:'Archived decision forecast; future observations are not inputs.',series:[{name:'Median',points:f.median.map((value,i)=>({t:times[i]!,value}))},{name:'10%',points:f.median.map((_,i)=>({t:times[i]!,value:f.quantile(.1,i)}))},{name:'90%',points:f.median.map((_,i)=>({t:times[i]!,value:f.quantile(.9,i)}))}],guides:[{label:'Signal price',value:price}],markers:[]});
    }else{g('Historical model forecast',NaN,'>',0,'');out.note+=' Forecast payload was not retained; no new forecast is generated to explain an old trade.';if(!out.panels.length)panel('Price context only',{Price:priceSeries()});}
  }
  if(!out.panels.length)panel('Price before the signal',{Price:priceSeries()});
  out.gates=out.gates.slice(0,16);out.panels=out.panels.slice(0,4);
  return out;
}
