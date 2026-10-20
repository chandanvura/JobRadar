import test from 'node:test';
import assert from 'node:assert/strict';
import {cachedCatalog} from '../worker/catalog-cache.ts';

function fixture(){
  const memory=new Map(),pending=[];
  return {memory,cache:{match:async key=>memory.get(key.url)?.clone(),put:async(key,value)=>{memory.set(key.url,value.clone());}},ctx:{waitUntil:p=>pending.push(p)},flush:async()=>Promise.all(pending)};
}
const req=(path,options)=>new Request(`https://example.test${path}`,options);
test('repeat public reads use one live query; browser response stays no-store',async()=>{
  const f=fixture();let reads=0;
  const read=async()=>{reads++;return Response.json({posted_at:'2026-10-19T12:00:00Z'},{headers:{'Cache-Control':'no-store','X-Frame-Options':'DENY'}});};
  await cachedCatalog(req('/api/dashboard?profile=one'),read,f.cache,f.ctx);await f.flush();
  const second=await cachedCatalog(req('/api/dashboard?profile=two'),read,f.cache,f.ctx);
  assert.equal(reads,1);assert.equal(second.headers.get('X-JobRadar-Catalog-Cache'),'hit');
  assert.equal(second.headers.get('Cache-Control'),'no-store');assert.equal(second.headers.get('X-Frame-Options'),'DENY');
  assert.equal((await second.json()).posted_at,'2026-10-19T12:00:00Z');
  for(const value of f.memory.values())value.headers.set('X-JobRadar-Cache-Until',String(Date.now()-1));
  await cachedCatalog(req('/api/dashboard'),read,f.cache,f.ctx);assert.equal(reads,2);
});
test('page size and cursor remain distinct; irrelevant parameters cannot create extra entries',async()=>{
  const f=fixture();let reads=0;const read=async()=>Response.json({read:++reads});
  for(const path of ['/api/jobs?limit=100&after=0','/api/jobs?after=100&limit=100','/api/jobs?after=0&limit=500','/api/jobs?limit=100&after=0&noise=one']){
    await cachedCatalog(req(path),read,f.cache,f.ctx);await f.flush();
  }
  assert.equal(reads,3);assert.equal(f.memory.size,3);
});
test('health, writes, forced backup and credentials never use shared catalog cache',async()=>{
  const cache={match:()=>assert.fail('must not use shared cache'),put:()=>assert.fail('must not cache')},ctx={waitUntil:()=>assert.fail('must not cache')};
  for(const request of [req('/api/health'),req('/api/ingest',{method:'POST'}),req('/api/dashboard?source=backup'),req('/api/dashboard',{headers:{Cookie:'private=example'}}),req('/api/jobs',{headers:{Authorization:'Bearer example'}})]){
    assert.equal((await cachedCatalog(request,async()=>Response.json({live:true}),cache,ctx)).status,200);
  }
});
test('errors, static backup, cookies and invalid input cannot poison live cache',async()=>{
  const f=fixture();
  for(const response of [new Response('error',{status:503}),Response.json({data_mode:'backup'},{headers:{'X-JobRadar-Data-Mode':'backup'}}),Response.json({private:true},{headers:{'Set-Cookie':'example=1'}}),new Response('<html>error</html>')]){
    await cachedCatalog(req('/api/dashboard'),async()=>response,f.cache,f.ctx);await f.flush();
  }
  await cachedCatalog(req('/api/jobs?after=-1'),async()=>Response.json({error:'invalid'},{status:400}),f.cache,f.ctx);
  assert.equal(f.memory.size,0);
});
test('cache faults preserve successful live reads',async()=>{
  const pending=[];const cache={match:async()=>{throw Error('unavailable')},put:async()=>{throw Error('full')}};
  const response=await cachedCatalog(req('/api/dashboard'),async()=>Response.json({live:true}),cache,{waitUntil:p=>pending.push(p)});
  assert.deepEqual(await response.json(),{live:true});await Promise.all(pending);
});

test('bounded ranges have separate cache entries and invalid bounds stay uncached',async()=>{
 const f=fixture();let reads=0;const read=async()=>Response.json({read:++reads});
 for(const path of ['/api/jobs?after=0&through=500','/api/jobs?after=0&through=1000','/api/jobs?after=0&through=0500']){
  await cachedCatalog(req(path),read,f.cache,f.ctx);await f.flush();
 }
 assert.equal(reads,2);assert.equal(f.memory.size,2);
 await cachedCatalog(req('/api/jobs?after=500&through=400'),read,f.cache,f.ctx);await f.flush();assert.equal(f.memory.size,2);
});
