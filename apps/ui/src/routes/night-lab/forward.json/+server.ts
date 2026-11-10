import {json} from '@sveltejs/kit';
import {arena} from '$lib/server/arena';
import {nightLabForward,sharedForward}from'$lib/server/night-lab-forward';
const forward=sharedForward(()=>nightLabForward(arena));
export async function GET(){
  try {
    return json(await forward(),{headers:{'cache-control':'private, no-store'}});
  }catch{return json({error:'Forward data temporarily unavailable'},{status:503,headers:{'cache-control':'private, no-store'}})}
}
