import{json}from'@sveltejs/kit';
import{inspection}from'$lib/server/inspection';
import type{RequestHandler}from'./$types';
export const GET:RequestHandler=async({url})=>{
 const id=url.searchParams.get('id')??'',trade=url.searchParams.get('trade')??'',stage=url.searchParams.get('stage')??'virtual';
 if(!/^(demo|bt):[A-Za-z0-9_:./@=-]{1,240}$/.test(id)||!/^(open|\d{1,9})$/.test(trade)||!['virtual','capital','backtest'].includes(stage))return json({error:'Invalid selection'},{status:400});
 try{return json(await inspection.trade(id,trade,stage),{headers:{'Cache-Control':'private, no-store'}})}catch{return json({error:'Trade detail unavailable'},{status:503})}
};
