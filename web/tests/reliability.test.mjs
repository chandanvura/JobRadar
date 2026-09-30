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
