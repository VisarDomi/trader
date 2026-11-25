import{env}from'$env/dynamic/private';
import type{Inspection}from'../../../../backend/src/inspection/model';
export type{Inspection};
async function read<T>(path:string):Promise<T>{
 const response=await fetch((env.INSPECTION_URL??'http://127.0.0.1:4140')+path,{signal:AbortSignal.timeout(path.startsWith('/preview')||path.startsWith('/sparks')?5000:30000)});
 if(!response.ok)throw Error('Trade detail is temporarily unavailable');return response.json();
}
export const inspection={
 trade:(id:string,trade:string,stage:string)=>read<Inspection>('/inspection?'+new URLSearchParams({id,trade,stage})),
 preview:(id:string,stage:string)=>read<Inspection[]>('/preview?'+new URLSearchParams({id,stage})),
 sparks:(id:string,limit?:number)=>read<import('./native/screens').Sparks>('/sparks?'+new URLSearchParams({id,...(limit!==undefined?{limit:String(limit)}:{})})),
 sparksBatch:(ids:readonly string[],limit=60)=>ids.length?read<Record<string,import('./native/screens').Sparks>>('/sparks?'+new URLSearchParams({ids:ids.join(','),limit:String(limit)})):Promise.resolve({}),
};
