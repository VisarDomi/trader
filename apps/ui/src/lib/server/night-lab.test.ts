import{expect,test}from'bun:test';
import{brotliDecompressSync}from'node:zlib';
import{NIGHT_LAB_SCHEMA,encoding,nightLabSummary,prepare,respond}from'./night-lab';

test('summary prepares the 20-member NY-clock cohort and benchmarks once',()=>{
 const first=nightLabSummary(),second=nightLabSummary();
 expect(first).toBe(second);
 const data=JSON.parse(first.body.toString());
 expect(data.schema).toBe(NIGHT_LAB_SCHEMA);
 expect(data.cohort).toHaveLength(20);
 expect(Object.keys(data.benchmarks).sort()).toEqual(['US100','US500']);
});

test('responses are compressed once, negotiated per client, and revalidate with 304',async()=>{
 const p=prepare({a:'x'.repeat(5000)},'v1'),req=(h:Record<string,string>)=>new Request('https://t/x',{headers:h});
 expect(encoding('gzip, deflate, br')).toBe('br');expect(encoding('gzip;q=1, br;q=0')).toBe('gzip');expect(encoding('identity')).toBeNull();expect(encoding(null)).toBeNull();
 const br=await respond(req({'accept-encoding':'br'}),p,'private, no-cache');
 expect(br.headers.get('content-encoding')).toBe('br');expect(JSON.parse(brotliDecompressSync(Buffer.from(await br.arrayBuffer())).toString()).a).toHaveLength(5000);
 const again=await respond(req({'accept-encoding':'br'}),p,'private, no-cache');expect((await again.arrayBuffer()).byteLength).toBeLessThan(200);
 const plain=await respond(req({}),p,'private, no-cache');expect(plain.headers.get('content-encoding')).toBeNull();expect((await plain.json()).a).toHaveLength(5000);
 expect((await respond(req({'if-none-match':p.etag}),p,'private, no-cache')).status).toBe(304);
});
