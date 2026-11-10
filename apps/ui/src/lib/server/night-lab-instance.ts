import {env} from '$env/dynamic/private';
import {NightLab,nightLabDbPath} from './night-lab';

let shared:NightLab|undefined;
/** One read-only connection per server process; it follows the lab's atomic republishes. */
export function nightLab():NightLab{return shared??=new NightLab(nightLabDbPath(env.NIGHT_LAB_DB))}
