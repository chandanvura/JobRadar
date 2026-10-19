import test from 'node:test';
import assert from 'node:assert/strict';
import {readTracking,saveTrackingPatch,persistTracking,mergeTracking,trackingStorageKey,recoveryStorageKey,clearTrackingStorage} from '../lib/tracking-store.ts';
import {trackingIdentity,safeTracking} from '../lib/private-profile.ts';
const job=id=>({title:'Engineer',company:'Acme',normalized_location:'Bengaluru',skills:'[]',role_category:'Software Engineering',ats_provider:'test',external_job_id:String(id),first_seen_at:'2026-10-19T00:00:00Z',application_url:`https://example.test/jobs/${id}`,career_page_url:'https://example.test'});
function setup(){const memory=new Map(),events=[];globalThis.window={location:{search:''},dispatchEvent:event=>events.push(event.type)};globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};return {memory,events};}
test('stale tabs retain different applications and preserve stage transitions after reload',()=>{
 setup();const stale={};
 let first=saveTrackingPatch({},job(1),{status:'Applied'},'2026-10-19T01:00:00Z');
 saveTrackingPatch(stale,job(2),{saved:true},'2026-10-19T02:00:00Z');
 first=saveTrackingPatch(first,job(1),{status:'Interview'},'2026-10-19T03:00:00Z');
 const restored=readTracking();assert.equal(Object.keys(restored).length,2);
 assert.equal(restored[trackingIdentity(job(1))].status,'Interview');
 assert.deepEqual(restored[trackingIdentity(job(1))].history.map(event=>event.status),['New','Applied','Interview']);
 assert.equal(first[trackingIdentity(job(2))].saved,true);
 const combined=mergeTracking(restored,{[trackingIdentity(job(1))]:{...first[trackingIdentity(job(1))],status:'Applied',updated_at:'2026-10-18T00:00:00Z'}});
 assert.equal(combined[trackingIdentity(job(1))].status,'Interview');
});
test('corrupt primary recovers previous good state and a later write does not replace recovery with garbage',()=>{
 const {memory}=setup();saveTrackingPatch({},job(1),{status:'Applied'},'2026-10-19T01:00:00Z');
 saveTrackingPatch(readTracking(),job(1),{status:'Interview'},'2026-10-19T02:00:00Z');
 memory.set(trackingStorageKey,'{broken');assert.equal(readTracking()[trackingIdentity(job(1))].status,'Applied');
 saveTrackingPatch(readTracking(),job(2),{saved:true},'2026-10-19T03:00:00Z');
 assert.equal(Object.keys(readTracking()).length,2);
 assert.equal(JSON.parse(memory.get(recoveryStorageKey))[trackingIdentity(job(1))].status,'Applied');
 assert.equal(clearTrackingStorage(),true);assert.deepEqual(readTracking(),{});
});
test('quota failure reports unsaved changes and leaves the stored application intact',()=>{
 const {events}=setup();saveTrackingPatch({},job(1),{status:'Applied'},'2026-10-19T01:00:00Z');
 localStorage.setItem=()=>{throw Error('QuotaExceededError');};
 assert.equal(persistTracking({}),false);assert.equal(readTracking()[trackingIdentity(job(1))].status,'Applied');assert.deepEqual(events,['jobradar-storage-error']);
});
test('history beyond 5,000 records is not silently truncated during import',()=>{
 const rows=Object.fromEntries(Array.from({length:5001},(_,id)=>[trackingIdentity(job(id)),{saved:true,status:'Applied',job:job(id)}]));
 assert.equal(Object.keys(safeTracking(rows)).length,5001);
});
