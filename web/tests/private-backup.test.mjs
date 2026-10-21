import test from 'node:test';
import assert from 'node:assert/strict';
import {exportPrivateBackup,parsePrivateBackup,restorePrivateBackup,privateBackupKeys,maxPrivateBackupBytes} from '../lib/private-backup.ts';
import {privateKey,trackingIdentity} from '../lib/private-profile.ts';
import {readTracking,trackingStorageKey} from '../lib/tracking-store.ts';
const job=id=>({title:'Engineer',company:'Acme',normalized_location:'Bengaluru',skills:'[]',role_category:'Software',ats_provider:'test',external_job_id:String(id),first_seen_at:'2026-10-21T00:00:00Z',application_url:'https://example.test/job',career_page_url:'https://example.test'});
const tracking=id=>({[trackingIdentity(job(id))]:{job:job(id),status:'Applied',saved:true}});
function setup(){const memory=new Map();globalThis.window={location:{search:'?profile=private-test'},dispatchEvent(){}};globalThis.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};return memory;}
const file=data=>JSON.stringify({version:1,data});
test('private export round trip restores all exported fields and merges rather than replaces history',()=>{
 const memory=setup();
 const resume={name:'Person',experience:'Real experience'};
 const data={
  [privateBackupKeys[0]]:{locations:['Hyderabad'],titles:['Java']},[trackingStorageKey]:tracking(1),
  [privateBackupKeys[2]]:resume,[privateBackupKeys[3]]:{key:'job',source:'original',jd:'Java',resume},
  [privateBackupKeys[4]]:{key:'job',title:'Engineer',company:'Acme',jd:'Java'},[privateBackupKeys[5]]:true,
 };
 for(const [key,value] of Object.entries(data))memory.set(privateKey(key),JSON.stringify(value));
 const exported=exportPrivateBackup();memory.clear();memory.set(privateKey(trackingStorageKey),JSON.stringify(tracking(2)));
 restorePrivateBackup(parsePrivateBackup(exported));
 assert.equal(Object.keys(readTracking()).length,2);
 for(const key of privateBackupKeys)assert.ok(memory.has(privateKey(key)),key);
 assert.equal(JSON.parse(memory.get(privateKey(privateBackupKeys[3]))).resume.name,'Person');
 assert.equal(memory.has(trackingStorageKey),false,'restore must stay in the selected workspace');
});
test('blocked primary history stops restore before changing preferences or resume',()=>{
 const memory=setup();memory.set(privateKey(trackingStorageKey),JSON.stringify(tracking(1)));
 localStorage.setItem=()=>{throw Error('QuotaExceededError');};
 const updates=parsePrivateBackup(file({[trackingStorageKey]:tracking(2),[privateBackupKeys[2]]:{name:'New'}}));
 assert.throws(()=>restorePrivateBackup(updates),/Restore incomplete.*history/);
 assert.equal(Object.keys(readTracking()).length,1);
 assert.equal(memory.has(privateKey(privateBackupKeys[2])),false);
});
test('malformed rows and backup schemas are rejected before writes',()=>{
 const memory=setup();
 for(const data of [[],{[trackingStorageKey]:{...tracking(1),bad:{job:{}}}},{[privateBackupKeys[2]]:[]},{[privateBackupKeys[3]]:{key:'job'}}]){
  assert.throws(()=>parsePrivateBackup(file(data)));assert.equal(memory.size,0);
 }
 assert.throws(()=>parsePrivateBackup('null'));
});
test('inaccessible or corrupt private records cannot produce a silently empty export',()=>{
 const memory=setup();localStorage.getItem=()=>{throw Error('SecurityError');};
 assert.throws(()=>exportPrivateBackup(),/could not read/);
 localStorage.getItem=key=>memory.get(key)??null;
 memory.set(privateKey(trackingStorageKey),'{broken');
 assert.throws(()=>exportPrivateBackup(),/could not read/);
 memory.set(privateKey(trackingStorageKey),JSON.stringify({...tracking(1),bad:{job:{}}}));
 assert.throws(()=>exportPrivateBackup(),/could not read/);
});
test('large valid exports above the old 5 MB import limit are accepted; the shared limit stays bounded',()=>{
 setup();const rows=tracking(1);Object.values(rows)[0].job.description='a'.repeat(5_000_001);
 const text=file({[trackingStorageKey]:rows});assert.ok(text.length>5_000_000);
 assert.equal(Object.keys(parsePrivateBackup(text)[trackingStorageKey]).length,1);
 assert.throws(()=>parsePrivateBackup(' '.repeat(maxPrivateBackupBytes+1)),/larger than 25 MB/);
});

test('unreadable current history is never treated as empty during restore',()=>{
 const memory=setup(),key=privateKey(trackingStorageKey),prior=JSON.stringify(tracking(1));memory.set(key,prior);
 localStorage.getItem=()=>{throw Error('SecurityError');};
 assert.throws(()=>restorePrivateBackup(parsePrivateBackup(file({[trackingStorageKey]:tracking(2)}))),/history could not be read/);
 assert.equal(memory.get(key),prior);
});
