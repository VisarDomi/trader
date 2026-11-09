import {json} from '@sveltejs/kit';
import {arena} from '$lib/server/arena';
import {nightLabForward}from'$lib/server/night-lab-forward';
export async function GET(){
  try {
    return json(await nightLabForward(arena),{headers:{'cache-control':'private, no-store'}});
  }catch{return json({error:'Forward data temporarily unavailable'},{status:503,headers:{'cache-control':'private, no-store'}})}
}
