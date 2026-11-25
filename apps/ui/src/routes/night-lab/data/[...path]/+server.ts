import {json} from '@sveltejs/kit';
import {nightLabSummary,respond} from '$lib/server/night-lab';

export async function GET({params,request}){
  if(params.path==='summary.json')return await respond(request,nightLabSummary(),'private, no-cache');
  return json({error:'Unknown Night Lab section'},{status:404});
}
