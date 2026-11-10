// Night Lab offline support. The page shell is cached on install; the report summary and each
// section are cached as they are viewed. Sections are immutable per report version, so they are
// served from the cache first; a newer summary removes sections of older versions. Downloads
// (report.json, CSVs) are never stored on the device. Earlier workers' caches, including the
// full-report copy they kept, are removed on activation.
const SHELL='night-lab-shell-v1',DATA='night-lab-data-v1',LIVE='night-lab-forward-v4',GRID='night-lab-grid-v2';
const KEEP=new Set([SHELL,DATA,LIVE,GRID]);
const FILES=['./index.html','./night-lab.js','./manifest.webmanifest','./icon-192.png','./icon-512.png'];
const SECTION=/\/night-lab\/data\/([0-9a-f]{16})\//;
const scoped=path=>new URL(path,self.registration.scope);
function gridComplete(data){return data.schema===1&&data.epics?.length===2&&data.epics.every(e=>e.cells?.length===336)}
async function cohort(){
 const saved=await (await caches.open(DATA)).match(scoped('./data/summary.json').href);
 try{return saved?(await saved.json()).cohort:null}catch{return null}
}
// The forward rows must be the complete cohort of the saved report: unique, same code, index and tier.
async function complete(data){
 const members=await cohort();
 if(data.schema!==3||!Array.isArray(data.rows)||!data.rows.length||new Set(data.rows.map(r=>r.agentId)).size!==data.rows.length)return false;
 return !members||(data.rows.length===members.length&&data.rows.every(r=>members.some(m=>m.id===r.agentId&&m.codeHash===r.codeHash&&m.epic===r.epic&&m.leverage===r.leverage)));
}
const offline=(error,status=503)=>new Response(JSON.stringify({error}),{status,headers:{'content-type':'application/json'}});
self.addEventListener('install',event=>event.waitUntil((async()=>{await (await caches.open(SHELL)).addAll(FILES);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('night-lab-')&&!KEEP.has(key))await caches.delete(key);await self.clients.claim()})()));
// Live data: the network when it is complete, else the last complete copy marked offline.
function live(event,name,valid){
 const key=new Request(new URL(event.request.url).origin+new URL(event.request.url).pathname);
 event.respondWith((async()=>{const cache=await caches.open(name);try{const r=await fetch(event.request);if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Unavailable');const data=await r.clone().json();if(!await valid(data))throw Error('Incomplete');await cache.put(key,r.clone());return r}catch{const old=await cache.match(key);if(!old)return offline('Offline');const data=await old.json();if(!await valid(data))return offline('Outdated saved copy');return new Response(JSON.stringify({...data,offline:true}),{headers:{'content-type':'application/json'}})}})());
}
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/night-lab/'))return;
 if(url.pathname==='/night-lab/forward.json')return live(event,LIVE,complete);
 if(url.pathname==='/night-lab/grid.json')return live(event,GRID,gridComplete);
 if(url.pathname==='/night-lab/data/summary.json'){
  event.respondWith((async()=>{const cache=await caches.open(DATA);try{const r=await fetch(event.request);if(!r.ok)throw Error('Unavailable');const version=(await r.clone().json()).version;await cache.put(url.href,r.clone());
   for(const old of await cache.keys()){const v=SECTION.exec(new URL(old.url).pathname)?.[1];if(v&&v!==version)await cache.delete(old)}return r}
   catch{return (await cache.match(url.href))??offline('Report unavailable offline')}})());return;
 }
 if(SECTION.test(url.pathname)){
  event.respondWith((async()=>{const cache=await caches.open(DATA),saved=await cache.match(url.href);if(saved)return saved;try{const r=await fetch(event.request);if(r.ok&&r.headers.get('content-type')?.includes('application/json'))await cache.put(url.href,r.clone());return r}catch{return offline('This section was not saved for offline use')}})());return;
 }
 if(!FILES.some(p=>scoped(p).pathname===url.pathname))return;
 // The shell is revalidated on every online load (the server sends no cache lifetime for it).
 const key=new Request(url.origin+url.pathname);
 event.respondWith((async()=>{const cache=await caches.open(SHELL);try{const r=await fetch(url.href,{cache:'no-cache'});if(r.ok&&r.url.startsWith(self.registration.scope)){await cache.put(key,r.clone());return r}throw Error('Unavailable')}catch{return (await cache.match(key))??new Response('Night Lab unavailable offline',{status:503})}})());
});
