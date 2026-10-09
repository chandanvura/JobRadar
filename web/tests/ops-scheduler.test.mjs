import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAndRecover,needsScan} from '../ops-scheduler/index.ts';

const run=(status,conclusion=null)=>({id:7,status,conclusion,updated_at:'2026-09-26T10:00:00Z'});

test('external scheduler suppresses duplicate active scans',()=>{
  for(const status of ['queued','in_progress','pending','requested','waiting']){
    assert.equal(needsScan(null,[run(status)]),false);
  }
  assert.equal(needsScan('not-a-date',[],0),true);
  assert.equal(needsScan('2026-09-26T15:00:00Z',[],Date.parse('2026-09-26T14:00:00Z')),false);
  assert.equal(needsScan('2026-09-26T10:00:00Z',[],Date.parse('2026-09-26T12:29:59Z')),false);
  assert.equal(needsScan('2026-09-26T10:00:00Z',[],Date.parse('2026-09-26T12:30:00Z')),true);
});

test('external scheduler dispatches after health is blocked and a finalizer is stale',async()=>{
  const original=globalThis.fetch;const seen=[];
  globalThis.fetch=async(url,options={})=>{
    seen.push([url,options.method||'GET']);
    if(url.endsWith('/actions/workflows/scrape.yml'))return Response.json({state:'disabled_inactivity'});
    if(url.endsWith('/actions/workflows/scrape.yml/enable'))return new Response(null,{status:204});
    if(url.includes('/workflows/scrape.yml/runs?'))return Response.json({workflow_runs:[run('completed','success')]});
    if(url.includes('/actions/runs/7/jobs?'))return Response.json({jobs:[{name:'finalize',conclusion:'success',completed_at:'2020-01-01T00:00:00Z'}]});
    if(url.includes('/api/health'))return new Response('blocked',{status:403});
    if(url.includes('/dispatches'))return new Response(null,{status:204});
    throw new Error(`Unexpected URL ${url}`);
  };
  try{
    assert.equal(await checkAndRecover({GITHUB_DISPATCH_TOKEN:'test-token'}),'dispatched');
    assert.equal(seen.filter(([url,method])=>url.endsWith('/enable')&&method==='PUT').length,1);
    assert.equal(seen.filter(([url])=>url.includes('/dispatches')).length,1);
  }finally{globalThis.fetch=original}
});

test('chaos: a manually disabled workflow stays disabled',async()=>{
  const original=globalThis.fetch;const seen=[];
  globalThis.fetch=async(url)=>{seen.push(url);return Response.json({state:'disabled_manually'});};
  try{assert.equal(await checkAndRecover({GITHUB_DISPATCH_TOKEN:'test-token'}),'disabled');assert.equal(seen.length,1);}finally{globalThis.fetch=original}
});

test('chaos: a queued scan prevents recovery even with broken health',async()=>{
  const original=globalThis.fetch;const seen=[];
  globalThis.fetch=async(url)=>{
    seen.push(url);
    if(url.endsWith('/actions/workflows/scrape.yml'))return Response.json({state:'active'});
    if(url.includes('/workflows/scrape.yml/runs?'))return Response.json({workflow_runs:[run('queued')]});
    throw new Error(`Unexpected request ${url}`);
  };
  try{assert.equal(await checkAndRecover({GITHUB_DISPATCH_TOKEN:'test-token'}),'active');assert.equal(seen.length,2);}finally{globalThis.fetch=original}
});

test('chaos: GitHub authorization failure cannot dispatch another scan',async()=>{
  const original=globalThis.fetch;const seen=[];
  globalThis.fetch=async(url)=>{seen.push(url);return new Response('unauthorized',{status:401});};
  try{await assert.rejects(checkAndRecover({GITHUB_DISPATCH_TOKEN:'expired'}),/HTTP 401/);assert.equal(seen.length,1);}finally{globalThis.fetch=original}
});

test('D1 quota 503 suppresses repeated recovery dispatch and applies request deadlines',async()=>{
  const original=globalThis.fetch;let dispatched=false;
  globalThis.fetch=async(url,options={})=>{
    assert.ok(options.signal);
    if(url.endsWith('/actions/workflows/scrape.yml'))return Response.json({state:'active'});
    if(url.includes('/workflows/scrape.yml/runs?'))return Response.json({workflow_runs:[]});
    if(url.includes('/api/health'))return Response.json({ok:false,quota_exhausted:true,retry_at:'2026-10-01T00:00:00.000Z'},{status:503});
    dispatched=true;throw Error('must not dispatch');
  };
  try{assert.equal(await checkAndRecover({GITHUB_DISPATCH_TOKEN:'test-token'}),'quota');assert.equal(dispatched,false);}finally{globalThis.fetch=original}
});

test('stale non-quota 503 can recover instead of being mistaken for quota exhaustion',async()=>{
  const original=globalThis.fetch;let dispatches=0;
  globalThis.fetch=async(url,options={})=>{
    assert.ok(options.signal);
    if(url.endsWith('/actions/workflows/scrape.yml'))return Response.json({state:'active'});
    if(url.includes('/workflows/scrape.yml/runs?'))return Response.json({workflow_runs:[]});
    if(url.includes('/api/health'))return Response.json({ok:false,quota_exhausted:false,stale:true,latest_run:{finished_at:'2020-01-01T00:00:00Z'}},{status:503});
    if(url.includes('/dispatches')){dispatches++;return new Response(null,{status:204});}
    throw new Error(`Unexpected URL ${url}`);
  };
  try{assert.equal(await checkAndRecover({GITHUB_DISPATCH_TOKEN:'test-token'}),'dispatched');assert.equal(dispatches,1);}finally{globalThis.fetch=original}
});

test('availability probe checks the HTML and D1-independent backup with bounded requests',async()=>{
  const {probeAvailability}=await import('../ops-scheduler/index.ts');const original=globalThis.fetch;
  try{
    globalThis.fetch=async(url,options)=>{assert.ok(options.signal);return new Response('fixture',{headers:{'Content-Type':url.endsWith('/')?'text/html':'application/json'}})};
    assert.equal((await probeAvailability()).ok,true);
    globalThis.fetch=async()=>new Response('outage',{status:503});
    const failure=await probeAvailability();assert.equal(failure.ok,false);assert.equal(failure.root_status,503);
  }finally{globalThis.fetch=original}
});

test('inactive operational schedules recover while intentionally disabled workflows stay disabled',async()=>{
  const {restoreInactiveSchedules}=await import('../ops-scheduler/index.ts');const original=globalThis.fetch;const enabled=[];
  globalThis.fetch=async(url,options)=>{
    if(url.endsWith('/actions/workflows?per_page=100'))return Response.json({workflows:[{path:'.github/workflows/deploy-cloudflare.yml',state:'disabled_inactivity'},{path:'.github/workflows/backup-d1.yml',state:'disabled_manually'},{path:'.github/workflows/unrelated.yml',state:'disabled_inactivity'}]});
    assert.equal(options.method,'PUT');enabled.push(url);return new Response(null,{status:204});
  };
  try{assert.equal(await restoreInactiveSchedules({GITHUB_DISPATCH_TOKEN:'test-token'}),1);assert.equal(enabled.length,1);assert.match(enabled[0],/deploy-cloudflare.yml\/enable$/)}finally{globalThis.fetch=original}
});
