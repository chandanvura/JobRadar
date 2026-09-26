import test from 'node:test';
import assert from 'node:assert/strict';
import {checkAndRecover,needsScan} from '../ops-scheduler/index.ts';

const run=(status,conclusion=null)=>({id:7,status,conclusion,updated_at:'2026-09-26T10:00:00Z'});

test('external scheduler suppresses duplicate active scans',()=>{
  assert.equal(needsScan(null,[run('queued')]),false);
  assert.equal(needsScan('2026-09-26T10:00:00Z',[],Date.parse('2026-09-26T11:14:00Z')),false);
  assert.equal(needsScan('2026-09-26T10:00:00Z',[],Date.parse('2026-09-26T11:16:00Z')),true);
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
