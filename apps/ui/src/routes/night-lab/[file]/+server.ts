import {json} from '@sveltejs/kit';
import {NightLabMissing,NightLabNotFound} from '$lib/server/night-lab';
import {nightLab} from '$lib/server/night-lab-instance';

/** The study's downloads (report.json and the CSVs) at their published URLs, from the lab's database. */
export async function GET({params,request}){
  try{return await nightLab().respondExport(request,params.file)}
  catch(error){
    if(error instanceof NightLabNotFound)return json({error:'Not found'},{status:404});
    if(error instanceof NightLabMissing)return json({error:error.message},{status:503,headers:{'cache-control':'no-store'}});
    throw error;
  }
}
