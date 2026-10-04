import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../lib/job-search-strategy.ts',import.meta.url),'utf8');
const { stripTypeScriptTypes }=await import('node:module');
const strategy=await import('data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64'));
test('ATS searches use correct time windows, role and city aliases',()=>{
  for(const period of ['day','week']){
    const links=strategy.atsSearches('Java Developer','Bengaluru',period);
    assert.equal(links.length,7);
    for(const link of links){const url=new URL(link.url);assert.equal(url.protocol,'https:');assert.equal(url.searchParams.get('tbs'),period==='day'?'qdr:d':'qdr:w');assert.match(url.searchParams.get('q'),/"Java Developer"/);assert.match(url.searchParams.get('q'),/"Bangalore"/);}
  }
  assert.equal(strategy.atsSearches('DevOps Engineer','Hyderabad','day').length,7);
});
test('invalid searches and query literal characters are bounded',()=>{
  for(const args of [['','Hyderabad','day'],['Java','Pune','day'],['Java','Hyderabad','year']])assert.deepEqual(strategy.atsSearches(...args),[]);
  const url=new URL(strategy.atsSearches('Java"\nsite:evil.example','Hyderabad','day')[0].url);
  assert.match(url.searchParams.get('q'),/"Java  site:evil.example"/);
});
test('manager drafts require truthful personalization rather than invented wins',()=>{
  const text=strategy.hiringManagerDraft('Example','Cloud Engineer','https://example.test/job');
  assert.match(text,/https:\/\/example.test\/job/);assert.match(text,/truthful, verifiable result/);assert.match(text,/\[portfolio link\]/);
  assert.equal(strategy.hiringSignalSearches('SRE','Hyderabad').length,3);
});
