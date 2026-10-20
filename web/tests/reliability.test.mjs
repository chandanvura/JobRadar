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

test('range manifest loads 7,000 records with at most four concurrent requests',async()=>{
 const jobs=Array.from({length:7000},(_,i)=>({id:i+1}));
 const catalog_ranges=Array.from({length:14},(_,i)=>({after:i*500,through:(i+1)*500}));
 let active=0,peak=0,calls=0;
 const started=performance.now();
 const result=await loadPublicCatalog(()=>{},async path=>{
  if(path==='/api/dashboard')return Response.json({...live,catalog_ranges});
  const u=new URL(path,'https://test.invalid'),after=Number(u.searchParams.get('after')),through=Number(u.searchParams.get('through'));
  calls++;active++;peak=Math.max(peak,active);
  await new Promise(resolve=>setTimeout(resolve,20+(after===0?10:0)));active--;
  return Response.json({jobs:jobs.filter(j=>j.id>after&&j.id<=through),next_cursor:null});
 });
 assert.equal(calls,14);assert.equal(peak,4);assert.deepEqual(result.jobs,jobs);
 console.log(`HARNESS PERF: 7,000 jobs, 14 requests, 4 concurrent, ${Math.round(performance.now()-started)} ms with simulated network latency`);
});
test('range refresh discards retired preview rows and rejects out-of-range or malformed manifests',async()=>{
 const ranges=[{after:0,through:200}];
 const result=await loadPublicCatalog(()=>{},async path=>path==='/api/dashboard'?Response.json({...live,catalog_ranges:ranges}):Response.json({jobs:[{id:200}],next_cursor:null}));
 assert.deepEqual(result.jobs,[{id:200}]);
 for(const catalog_ranges of [[{after:1,through:200}],[{after:0,through:200},{after:100,through:300}],ranges]){
  const result=await loadPublicCatalog(()=>{},async path=>path==='/api/dashboard'?Response.json({...live,catalog_ranges}):path==='/backup/catalog.json'?Response.json(saved):Response.json({jobs:[{id:201}],next_cursor:null}));
  assert.equal(result.data_mode,'backup');
 }
});
test('a failed parallel page cancels siblings before recovering to a complete backup',async()=>{
 let aborted=false;const keepAlive=setInterval(()=>{},100);
 try{
 const result=await loadPublicCatalog(()=>{},async(path,options)=>{
  if(path==='/api/dashboard')return Response.json({...live,catalog_ranges:[{after:0,through:500},{after:500,through:1000}]});
  if(path==='/backup/catalog.json')return Response.json(saved);
  if(path.includes('after=0')){await new Promise(resolve=>setTimeout(resolve,5));throw Error('failed');}
  return new Promise((_,reject)=>options.signal.addEventListener('abort',()=>{aborted=true;reject(options.signal.reason);},{once:true}));
 });assert.equal(aborted,true);assert.deepEqual(result,saved);
 }finally{clearInterval(keepAlive);}
});

test('slow network publishes the preview first, keeps the event loop responsive and completes all ranges',async()=>{
 const ranges=Array.from({length:8},(_,i)=>({after:i*500,through:(i+1)*500}));
 let preview=false,complete=false,beats=0;const timer=setInterval(()=>beats++,10),started=performance.now();
 try{
 const pending=loadPublicCatalog(data=>{assert.equal(data.jobs.length,100);preview=true;},async path=>{
  if(path==='/api/dashboard')return Response.json({...live,catalog_ranges:ranges});
  assert.equal(preview,true);await new Promise(resolve=>setTimeout(resolve,100));
  const u=new URL(path,'https://test.invalid'),after=Number(u.searchParams.get('after'));
  return Response.json({jobs:Array.from({length:500},(_,i)=>({id:after+i+1})),next_cursor:null});
 }).then(value=>{complete=true;return value;});
 await new Promise(resolve=>setTimeout(resolve,30));assert.equal(preview,true);assert.equal(complete,false);assert.ok(beats>0);
 const result=await pending;assert.equal(result.jobs.length,4000);assert.ok(beats>=5);
 assert.ok(performance.now()-started<2000,'slow-network completion exceeded the release regression budget');
 }finally{clearInterval(timer);}
});
