import {json} from '@sveltejs/kit';
import {NightLabMissing,NightLabNotFound,respond} from '$lib/server/night-lab';
import {nightLab} from '$lib/server/night-lab-instance';

/**
 *   summary.json                           first paint; names the report version; revalidated
 *   {version}/policy/{epic}/{policy}.json  one day policy: every risk cell and its curves
 *   {version}/ledger/{epic}/{window}.json  baseline-rule trades of one NY window
 *   {version}/stocks.json                  Nasdaq-100 purchase budget
 * Versioned sections never change. A request for an older version gets 410 with the current one.
 */
const SECTION=/^([0-9a-f]{16})\/(?:(stocks)|(policy|ledger)\/([A-Z0-9]+)\/([a-z0-9]+))\.json$/;

export async function GET({params,request}){
  const lab=nightLab();
  try{
    if(params.path==='summary.json')return await respond(request,lab.summary(),'private, no-cache');
    const m=SECTION.exec(params.path);
    if(!m)return json({error:'Unknown Night Lab section'},{status:404});
    const [,version,stocks,kind,a,b]=m;
    if(version!==lab.version)return json({error:'The Night Lab report was republished',version:lab.version},{status:410,headers:{'cache-control':'no-store'}});
    const section=stocks?lab.stocks():kind==='policy'?lab.policy(a!,b!):lab.ledger(a!,b!);
    return await respond(request,section,'private, max-age=31536000, immutable');
  }catch(error){
    if(error instanceof NightLabNotFound)return json({error:error.message},{status:404});
    if(error instanceof NightLabMissing)return json({error:error.message},{status:503,headers:{'cache-control':'no-store'}});
    throw error;
  }
}
