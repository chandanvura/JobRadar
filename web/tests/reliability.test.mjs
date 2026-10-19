import test from 'node:test';
import assert from 'node:assert/strict';
import {loadPublicCatalog} from '../lib/public-catalog.ts';
import {apiFailure} from '../worker/api-failure.ts';
const live={jobs:Array.from({length:100},(_,i)=>({id:i+1})),companies:[]};
const saved={jobs:[{id:900}],companies:[],data_mode:'backup',snapshot_at:'2026-09-30T00:00:00Z'};
test('browser survives Worker failure by reading static backup directly',async()=>{
  const seen=[];const result=await loadPublicCatalog(()=>{},async path=>{seen.push(path);return path.startsWith('/api/')?new Response('',{status:500}):Response.json(saved)});
  assert.deepEqual(result,saved);assert.deepEqual(seen,['/api/dashboard','/backup/catalog.json']);
});
test('pagination failure replaces the entire catalog without mixing live jobs',async()=>{
  const first=[];
  const result=await loadPublicCatalog(data=>first.push(data),async path=>path==='/api/dashboard'?Response.json(live):path==='/backup/catalog.json'?Response.json(saved):new Response('',{status:503}));
  assert.equal(first[0].jobs.length,100);assert.deepEqual(result.jobs,[{id:900}]);assert.equal(result.data_mode,'backup');
});
test('all pages load and duplicate initial rows merge before completing',async()=>{
  const result=await loadPublicCatalog(()=>{},async path=>path==='/api/dashboard'?Response.json(live):path.endsWith('after=0')?Response.json({jobs:live.jobs,next_cursor:100}):Response.json({jobs:[{id:101}],next_cursor:null}));
  assert.equal(result.jobs.length,101);assert.equal(result.data_mode,undefined);
});
test('malformed cursor and network failure both recover to static catalog',async()=>{
  for(const network of [false,true]){
    const result=await loadPublicCatalog(()=>{},async path=>{if(path==='/api/dashboard')return Response.json(live);if(path==='/backup/catalog.json')return Response.json(saved);if(network)throw Error('network down');return Response.json({jobs:[],next_cursor:0});});
    assert.deepEqual(result,saved);
  }
});
test('cancelled refresh cannot publish data or request a stale backup',async()=>{
  const controller=new AbortController();let calls=0;
  await assert.rejects(loadPublicCatalog(()=>assert.fail('must not publish'),async()=>{calls++;controller.abort();throw Error('cancelled')},controller.signal),{name:'AbortError'});
  assert.equal(calls,1);
});
test('missing or malformed backup remains a visible failure',async()=>{
  await assert.rejects(loadPublicCatalog(()=>{},async()=>new Response('',{status:500})));
  await assert.rejects(loadPublicCatalog(()=>{},async path=>path.startsWith('/api/')?new Response('',{status:503}):Response.json({jobs:[],companies:[]})),/Invalid backup/);
});
test('health exposes daily quota and reset without leaking database errors',async()=>{
  const response=apiFailure(Error("D1_ERROR: Your account has exceeded D1's free tier daily row read limit. secret-query"),'/api/health',{},Date.parse('2026-09-30T23:59:00Z'));
  assert.equal(response.status,503);assert.equal(response.headers.get('Retry-After'),'60');
  const body=await response.json();assert.equal(body.quota_exhausted,true);assert.equal(body.retry_at,'2026-10-01T00:00:00.000Z');assert.ok(!JSON.stringify(body).includes('secret-query'));
  assert.equal(apiFailure(Error('database temporarily unavailable'),'/api/ingest',{}).status,500);
});

test('7,000 live jobs load in 14 bounded pages and wait for initial preparation',async()=>{
  const jobs=Array.from({length:7000},(_,index)=>({id:index+1}));let pages=0,prepared=false;
  const result=await loadPublicCatalog(async()=>{await Promise.resolve();prepared=true;},async path=>{
    if(path==='/api/dashboard')return Response.json({...live,jobs:jobs.slice(0,100)});
    assert.equal(prepared,true);const url=new URL(path,'https://example.test');
    assert.equal(url.searchParams.get('limit'),'500');pages++;
    const after=Number(url.searchParams.get('after'));const batch=jobs.filter(job=>job.id>after).slice(0,500);
    return Response.json({jobs:batch,next_cursor:batch.at(-1).id===7000?null:batch.at(-1).id});
  });
  assert.equal(pages,14);assert.equal(result.jobs.length,7000);assert.equal(result.jobs.at(-1).id,7000);
});

test('hung response bodies and ignored abort signals still fall back within the request budget',async()=>{
 const keepAlive=setInterval(()=>{},100);
 try{
  for(const body of [false,true]){
   const result=await loadPublicCatalog(()=>{},async path=>path==='/backup/catalog.json'?Response.json(saved):body?{ok:true,json:()=>new Promise(()=>{})}:new Promise(()=>{}),undefined,{requestMs:20,liveMs:100});
   assert.equal(result.data_mode,'backup');
  }
 }finally{clearInterval(keepAlive);}
});
test('overall live budget stops a long chain of otherwise healthy pages',async()=>{
 let pages=0;const keepAlive=setInterval(()=>{},100);
 try{
 const result=await loadPublicCatalog(()=>{},async path=>{
  if(path==='/api/dashboard')return Response.json(live);
  if(path==='/backup/catalog.json')return Response.json(saved);
  await new Promise(resolve=>setTimeout(resolve,12));pages++;return Response.json({jobs:[{id:pages*1000}],next_cursor:pages*1000});
 },undefined,{requestMs:100,liveMs:30});
 assert.equal(result.data_mode,'backup');assert.ok(pages<10);
 }finally{clearInterval(keepAlive);}
});
