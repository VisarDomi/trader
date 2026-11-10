import {json} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {cachedNightGrid,nightGridDir} from '$lib/server/night-grid';
import {respond} from '$lib/server/night-lab';
const grid=cachedNightGrid(()=>nightGridDir(env.NIGHT_GRID_DIR));
export async function GET({request}){
  try {
    return await respond(request,await grid(),'private, no-cache');
  }catch{return json({error:'Paper grid not available yet'},{status:503,headers:{'cache-control':'private, no-store'}})}
}
