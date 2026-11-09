const STUDY='night-lab-study-__VERSION__',LIVE='night-lab-forward-v3-__COHORT_VERSION__';
const MEMBERS=/*__COHORT_MEMBERS__*/[];
const GRID='night-lab-grid-v1';
function gridComplete(data){return data.schema===1&&data.epics?.length===2&&data.epics.every(e=>e.cells?.length===336)}
function complete(data){return MEMBERS.length===20&&data.schema===3&&data.rows?.length===MEMBERS.length&&new Set(data.rows.map(r=>r.agentId)).size===MEMBERS.length&&data.rows.every(r=>MEMBERS.some(m=>m.id===r.agentId&&m.codeHash===r.codeHash&&m.epic===r.epic&&m.leverage===r.leverage))}
const FILES=['./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./report.json','./us500-exit-risk-grid.csv','./us100-exit-risk-grid.csv','./us500-gap-risk-grid.csv','./us100-gap-risk-grid.csv','./trades.csv','./risk-grid.csv','./us100-risk-grid.csv'];
self.addEventListener('install',event=>event.waitUntil((async()=>{await (await caches.open(STUDY)).addAll(FILES);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('night-lab-study-')&&key!==STUDY)||(key.startsWith('night-lab-forward-')&&key!==LIVE)||(key.startsWith('night-lab-grid-')&&key!==GRID))await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/night-lab/'))return;
 const key=new Request(url.origin+url.pathname);
 if(url.pathname==='/night-lab/forward.json'){
  event.respondWith((async()=>{const cache=await caches.open(LIVE);try{const r=await fetch(event.request);if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Unavailable');const data=await r.clone().json();if(!complete(data))throw Error('Incomplete or mismatched cohort');await cache.put(key,r.clone());return r}catch{const old=await cache.match(key);if(!old)return new Response('{"error":"Offline"}',{status:503,headers:{'content-type':'application/json'}});const data=await old.json();if(!complete(data))return new Response('{"error":"Outdated saved cohort"}',{status:503,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({...data,offline:true}),{headers:{'content-type':'application/json'}})}})());return;
 }
 if(url.pathname==='/night-lab/grid.json'){
  event.respondWith((async()=>{const cache=await caches.open(GRID);try{const r=await fetch(event.request);if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Unavailable');const data=await r.clone().json();if(!gridComplete(data))throw Error('Incomplete grid');await cache.put(key,r.clone());return r}catch{const old=await cache.match(key);if(!old)return new Response('{"error":"Offline"}',{status:503,headers:{'content-type':'application/json'}});const data=await old.json();if(!gridComplete(data))return new Response('{"error":"Outdated saved grid"}',{status:503,headers:{'content-type':'application/json'}});return new Response(JSON.stringify({...data,offline:true}),{headers:{'content-type':'application/json'}})}})());return;
 }
 if(!FILES.some(p=>new URL(p,self.registration.scope).pathname===url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(STUDY);try{const r=await fetch(event.request);if(r.ok&&r.url.startsWith(self.registration.scope)){await cache.put(key,r.clone());return r}throw Error('Unavailable')}catch{return (await cache.match(key))??new Response('Report unavailable offline',{status:503})}})());
});
