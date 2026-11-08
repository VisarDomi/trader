import type { Database } from 'bun:sqlite';
import type { Subject } from './model';
const exits:Record<string,string>={session_end:'Scheduled session close',signal:'Agent close signal',stop_loss:'Stop loss reached',take_profit:'Take profit reached',trailing_stop:'Trailing stop reached',margin_call:'Margin close-out',margin:'Margin close-out',busted:'Account protection',stopped:'Run stopped',reverse:'Direction reversed',deadline:'Scheduled exit'};
export function subject(db:Database,runId:string,key:string,stage:string,now=Date.now()):Subject{
  if(!/^(demo|bt):[A-Za-z0-9_:./@=-]{1,240}$/.test(runId)||!['virtual','backtest','capital'].includes(stage)||!(key==='open'||/^\d{1,9}$/.test(key)))throw Error('Invalid trade selection');
  const run=db.query<any,[string]>('SELECT id,agent_id,code_hash,params,epic,capital,leverage,metrics,snapshot,kind FROM runs WHERE id=?').get(runId);if(!run)throw Error('Run not found');
  if((run.kind==='backtest')!==(stage==='backtest'))throw Error('Invalid trade selection');
  const agent=db.query<any,[string]>('SELECT name,timeframe FROM agents WHERE id=?').get(run.agent_id);
  const base={runId,key,stage:stage as Subject['stage'],name:agent?.name??run.agent_id,epic:run.epic,leverage:run.leverage,agentId:run.agent_id,codeHash:run.code_hash,params:JSON.parse(run.params),timeframe:agent?.timeframe};
  if(stage==='capital'){
    if(key==='open')throw Error('Select a broker deal');
    const d=db.query<any,[number,string]>("SELECT * FROM broker_deals WHERE id=? AND run_id=? AND account LIKE 'Arena%'").get(Number(key),runId);if(!d||d.status==='failed'||d.open_price==null)throw Error('Broker deal not found');
    const intent=d.virtual_fill_time?db.query<any,[string,number,string]>('SELECT entry_reason,exit_note,exit_reason,exit_time FROM trades WHERE run_id=? AND entry_time=? AND side=? ORDER BY idx LIMIT 1').get(runId,d.virtual_fill_time,d.side):null;
    const pos=run.snapshot?JSON.parse(run.snapshot).position:null;
    const entryReason=intent?.entry_reason??(pos?.entryTime===d.virtual_fill_time?pos.entryReason:null);
    const linkedExit=intent&&d.close_requested_time&&Math.abs(d.close_requested_time-intent.exit_time)<60000;
    const timeline=[['Signal',d.decision_time],['Virtual fill',d.virtual_fill_time],['Sent to Capital',d.sent_time],['Accepted',d.accepted_time],['Confirmed entry',d.confirmed_time],['Close requested',d.close_requested_time],['Closed',d.close_time]].filter(([,t])=>typeof t==='number').map(([label,t])=>({label:String(label),t:Number(t)}));
    return {...base,side:d.side,size:d.size,entryTime:d.confirmed_time??d.open_time,exitTime:d.status==='closed'?d.close_time:null,entryPrice:d.open_price,exitPrice:d.close_price,
      pnl:d.pnl,funding:null,entryEquity:null,entryReason:entryReason??null,exitReason:linkedExit?(intent.exit_note||exits[intent.exit_reason]||intent.exit_reason):(d.note||null),exitCode:linkedExit?intent.exit_reason:null,timeline,intentEntryTime:d.virtual_fill_time??undefined,decisionTime:d.decision_time??undefined};
  }
  const p=key==='open'?(run.snapshot?JSON.parse(run.snapshot).position:null):null;
  if(key==='open'){
    if(!p)throw Error('No open position');
    return {...base,side:p.side,size:p.size,entryTime:p.entryTime,exitTime:null,entryPrice:p.entryPrice,exitPrice:null,pnl:null,funding:p.funding??null,
      entryEquity:null,entryReason:p.entryReason??null,exitReason:null,exitCode:null,stopLoss:p.stopLoss,takeProfit:p.takeProfit,timeline:[{label:'Opened',t:p.entryTime}]};
  }
  const t=db.query<any,[string,number]>('SELECT * FROM trades WHERE run_id=? AND idx=?').get(runId,Number(key));if(!t)throw Error('Trade not found');
  const totals=db.query<any,[number,string]>('SELECT COUNT(*) n,MIN(idx) first,MAX(idx) last,COALESCE(SUM(CASE WHEN idx<? THEN pnl ELSE 0 END),0) prior FROM trades WHERE run_id=?').get(Number(key),runId);
  const m=run.metrics?JSON.parse(run.metrics):null;
  const decision=db.query<any,[string,number]>("SELECT decision_time FROM broker_deals WHERE run_id=? AND virtual_fill_time=? AND account LIKE 'Arena%' AND decision_time IS NOT NULL ORDER BY id LIMIT 1").get(runId,t.entry_time);
  const complete=totals.first===0&&totals.last+1===totals.n&&totals.n>=(m?.trades??totals.n);
  return {...base,side:t.side,size:t.size,entryTime:t.entry_time,exitTime:t.exit_time,entryPrice:t.entry_price,exitPrice:t.exit_price,pnl:t.pnl,funding:t.funding,
    entryEquity:complete?run.capital+totals.prior:null,entryReason:t.entry_reason,exitReason:t.exit_note||exits[t.exit_reason]||t.exit_reason,exitCode:t.exit_reason,
    ...(t.execution?{execution:JSON.parse(t.execution)}:{}),decisionTime:decision?.decision_time??undefined,timeline:[{label:'Opened',t:t.entry_time},{label:'Closed',t:t.exit_time}]};
}
