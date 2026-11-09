import {json} from '@sveltejs/kit';
import {env} from '$env/dynamic/private';
import {nightGrid,nightGridDir} from '$lib/server/night-grid';
export async function GET(){
  try {
    return json(await nightGrid(nightGridDir(env.NIGHT_GRID_DIR)),{headers:{'cache-control':'private, no-store'}});
  }catch{return json({error:'Paper grid not available yet'},{status:503,headers:{'cache-control':'private, no-store'}})}
}
