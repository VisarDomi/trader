import { readFileSync } from 'node:fs';

/** Missing legacy service lists and malformed holds fail closed. Scoped resumes survive reboot. */
export function resourceHold(unit:string,path:string):{paused_at?:unknown}|null {
  try {
    const value=JSON.parse(readFileSync(path,'utf8'));
    if(value&&typeof value==='object'&&Array.isArray(value.services)&&value.services.every((s:unknown)=>typeof s==='string')&&!value.services.includes(unit))return null;
    return value&&typeof value==='object'?value:{};
  } catch(error) {
    return (error as NodeJS.ErrnoException).code==='ENOENT'?null:{};
  }
}
