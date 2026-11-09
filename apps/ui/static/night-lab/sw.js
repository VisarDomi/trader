const STUDY='night-lab-study-7f679234ff5f',LIVE='night-lab-forward-v2';
const FILES=['./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./report.json','./us500-gap-risk-grid.csv','./us100-gap-risk-grid.csv','./trades.csv','./risk-grid.csv','./us100-risk-grid.csv'];
self.addEventListener('install',event=>event.waitUntil((async()=>{await (await caches.open(STUDY)).addAll(FILES);await self.skipWaiting()})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if((key.startsWith('night-lab-study-')&&key!==STUDY)||(key.startsWith('night-lab-forward-')&&key!==LIVE))await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith('/night-lab/'))return;
 const key=new Request(url.origin+url.pathname);
 if(url.pathname==='/night-lab/forward.json'){
  event.respondWith((async()=>{const cache=await caches.open(LIVE);try{const r=await fetch(event.request);if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw Error('Unavailable');const data=await r.clone().json();if(data.schema!==2||data.rows?.length!==20)throw Error('Incomplete cohort');await cache.put(key,r.clone());return r}catch{const old=await cache.match(key);if(!old)return new Response('{"error":"Offline"}',{status:503,headers:{'content-type':'application/json'}});const data=await old.json();return new Response(JSON.stringify({...data,offline:true}),{headers:{'content-type':'application/json'}})}})());return;
 }
 if(!FILES.some(p=>new URL(p,self.registration.scope).pathname===url.pathname))return;
 event.respondWith((async()=>{const cache=await caches.open(STUDY);try{const r=await fetch(event.request);if(r.ok&&r.url.startsWith(self.registration.scope)){await cache.put(key,r.clone());return r}throw Error('Unavailable')}catch{return (await cache.match(key))??new Response('Report unavailable offline',{status:503})}})());
});
