import test from 'node:test';
import assert from 'node:assert/strict';
import {publicRead} from '../worker/public-backup.ts';
import {captureCatalog} from '../scripts/capture-public-backup.mjs';

const catalog = {version:1,data_mode:'backup',snapshot_at:'2026-09-30T10:00:00Z',jobs:Array.from({length:501},(_,i)=>({id:i+1,title:'Public job'})),companies:[],configured:true};
const assets = {fetch:async()=>Response.json(catalog)};
const req = path=>new Request(`https://example.test${path}`);
const failure = async()=>{throw Error('D1 daily quota exceeded')};
test('quota failure serves full backup to a cold client; recovery prefers live again',async()=>{
  const response=await publicRead(req('/api/dashboard'),assets,failure,{});
  const body=await response.json();
  assert.equal(body.jobs.length,501);assert.equal(body.data_mode,'backup');assert.equal(body.snapshot_at,catalog.snapshot_at);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.deepEqual(await (await publicRead(req('/api/dashboard'),assets,async()=>Response.json({live:true}),{})).json(),{live:true});
});
test('mid-pagination outage tells the client to reload the whole backup',async()=>{
  const body=await (await publicRead(req('/api/jobs?after=500'),assets,failure,{})).json();
  assert.deepEqual(body,{jobs:[],next_cursor:null,data_mode:'backup'});
  assert.equal((await publicRead(req('/api/jobs?after=-1'),assets,failure,{})).status,400);
});
test('forced backup never calls D1; writes and health never receive stale success',async()=>{
  await publicRead(req('/api/dashboard?source=backup'),assets,async()=>{assert.fail('must not query D1')},{});
  await assert.rejects(publicRead(new Request('https://example.test/api/ingest',{method:'POST'}),assets,failure,{}));
  await assert.rejects(publicRead(req('/api/health'),assets,failure,{}));
});
test('missing backup and non-JSON asset fail visibly',async()=>{
  await assert.rejects(publicRead(req('/api/dashboard'),{fetch:async()=>new Response('',{status:404})},failure,{}));
  await assert.rejects(publicRead(req('/api/dashboard'),{fetch:async()=>new Response('<html>not a catalog</html>',{headers:{'Content-Type':'text/html'}})},failure,{}));
});
test('deployment capture paginates all jobs and preserves prior snapshot on outage',async()=>{
  const captured=await captureCatalog('https://example.test',async (url, options)=>{assert.equal(options.headers['Accept-Encoding'],'identity');return url.pathname==='/api/dashboard'?Response.json({...catalog,data_mode:undefined}):Response.json({jobs:[{id:7}],next_cursor:null})});
  assert.deepEqual(captured.jobs,[{id:7}]);assert.equal(captured.version,1);
  const prior=await captureCatalog('https://example.test',async url=>url.pathname==='/backup/catalog.json'?Response.json(catalog):new Response('',{status:500}));
  assert.deepEqual(prior,catalog);
  await assert.rejects(captureCatalog('https://example.test',async()=>new Response('',{status:500})));
});
test('capture retries transient server failure with a strict attempt bound',async()=>{
  let attempts=0;
  const result=await captureCatalog('https://example.test',async url=>{
    if(url.pathname==='/api/dashboard') return ++attempts===1?new Response('',{status:503}):Response.json({...catalog,data_mode:undefined});
    return Response.json({jobs:[{id:9}],next_cursor:null});
  });
  assert.equal(attempts,3);assert.equal(result.jobs[0].id,9);
  let failures=0;
  await assert.rejects(captureCatalog('https://example.test',async()=>{failures++;return new Response('',{status:503})}));
  assert.equal(failures,6);
});
test('first deployment can bootstrap an explicitly partial snapshot from a valid dashboard',async()=>{
  const result=await captureCatalog('https://example.test',async url=>url.pathname==='/api/dashboard'?Response.json({...catalog,data_mode:undefined}):new Response('',{status:404}));
  assert.equal(result.coverage,'partial');assert.deepEqual(result.jobs,catalog.jobs);
});
test('quota deployment gate blocks schema changes and unrelated migration failures',async()=>{
  const {verifyQuotaDeployment}=await import('../scripts/verify-quota-deployment.mjs');
  const {readFile,readdir}=await import('node:fs/promises');const {createHash}=await import('node:crypto');
  const hashes={};const dir=new URL('../drizzle/',import.meta.url);
  for(const path of (await readdir(dir)).filter(p=>p.endsWith('.sql')))hashes[path]=createHash('sha256').update(await readFile(new URL(path,dir))).digest('hex');
  const quota="Your account has exceeded D1's free tier daily row read limit. [code: 7500]";
  const {appliedMigrationHashes}=await import('../scripts/verify-quota-deployment.mjs');
  assert.doesNotThrow(()=>verifyQuotaDeployment(quota,{...appliedMigrationHashes}));
  if(Object.keys(hashes).length!==Object.keys(appliedMigrationHashes).length)assert.throws(()=>verifyQuotaDeployment(quota,hashes));
  else assert.doesNotThrow(()=>verifyQuotaDeployment(quota,hashes));
  assert.throws(()=>verifyQuotaDeployment('Unauthorized [code: 10000]',hashes));
  assert.throws(()=>verifyQuotaDeployment(quota,{...hashes,'new.sql':'new'}));
  assert.throws(()=>verifyQuotaDeployment(quota,{...hashes,'0000_nice_greymalkin.sql':'modified'}));
});
test('production config patch retains static directory and supplies the fallback binding',async()=>{
  const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
  const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
  const dir=await mkdtemp(`${tmpdir()}/jobradar-config-`);
  try {
    await mkdir(`${dir}/dist/server`,{recursive:true});
    await writeFile(`${dir}/dist/server/wrangler.json`,JSON.stringify({assets:{directory:'../client'}}));
    await promisify(execFile)(process.execPath,[new URL('../scripts/prepare-cloudflare.mjs',import.meta.url).pathname,'--patch-build'],{cwd:dir,env:{...process.env,CLOUDFLARE_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000000'}});
    const config=JSON.parse(await readFile(`${dir}/dist/server/wrangler.json`));
    assert.deepEqual(config.assets,{directory:'../client',binding:'ASSETS'});
  } finally {await rm(dir,{recursive:true,force:true});}
});

test('optional custom domain preserves existing routes and workers.dev; rejects URLs',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');
 const {execFile}=await import('node:child_process');const {promisify}=await import('node:util');
 const dir=await mkdtemp(`${tmpdir()}/jobradar-domain-`);
 const script=new URL('../scripts/prepare-cloudflare.mjs',import.meta.url).pathname;
 const env={...process.env,CLOUDFLARE_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000000'};
 try{
  await mkdir(`${dir}/dist/server`,{recursive:true});
  await writeFile(`${dir}/dist/server/wrangler.json`,JSON.stringify({assets:{directory:'../client'},routes:[{pattern:'existing.example.com',custom_domain:true}]}));
  await promisify(execFile)(process.execPath,[script,'--patch-build'],{cwd:dir,env:{...env,JOBRADAR_CUSTOM_DOMAIN:'jobs.example.com'}});
  const config=JSON.parse(await readFile(`${dir}/dist/server/wrangler.json`));
  assert.equal(config.workers_dev,true);assert.equal(config.routes.length,2);assert.deepEqual(config.routes[1],{pattern:'jobs.example.com',custom_domain:true});
  await assert.rejects(promisify(execFile)(process.execPath,[script,'--patch-build'],{cwd:dir,env:{...env,JOBRADAR_CUSTOM_DOMAIN:'https://example.com/path'}}));
 }finally{await rm(dir,{recursive:true,force:true});}
});


test('explicit read 5xx falls back; client errors and health retain original status',async()=>{
  for(const status of [500,502,503,504]){
    const response=await publicRead(req('/api/dashboard'),assets,async()=>new Response('outage',{status}),{});
    assert.equal(response.status,200);assert.equal(response.headers.get('X-JobRadar-Data-Mode'),'backup');
    assert.equal((await response.json()).data_mode,'backup');
  }
  for(const status of [400,401,403,404]){
    const response=await publicRead(req('/api/dashboard'),assets,async()=>new Response('original',{status}),{});
    assert.equal(response.status,status);assert.equal(await response.text(),'original');
  }
  const health=await publicRead(req('/api/health'),assets,async()=>new Response('degraded',{status:503}),{});
  assert.equal(health.status,503);assert.equal(await health.text(),'degraded');
});
