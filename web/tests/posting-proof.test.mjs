import test from 'node:test';
import assert from 'node:assert/strict';
import {currentPosting,postingAge} from '../lib/job-time.ts';
const now=Date.parse('2026-10-19T10:00:00Z'),base={posted_at:null,posted_label:null,posted_precision:'unknown',reported_age_hours:null,last_seen_at:'2026-10-19T09:00:00Z'};
test('contradictory labels, negative/nonfinite ages and future timestamps never certify freshness',()=>{
 for(const patch of [{posted_at:'2026-10-19T11:00:00Z',posted_label:'Posted today',posted_precision:'day'},{posted_at:'bad',posted_label:'Posted today',posted_precision:'day'},...[-1,Infinity,NaN].map(reported_age_hours=>({reported_age_hours}))]){
 const job={...base,...patch};assert.equal(currentPosting(job,now),false);assert.equal(postingAge(job,now),null);
 }
 assert.equal(currentPosting({...base,posted_label:'not posted today',posted_precision:'day'},now),false);
 assert.equal(currentPosting({...base,posted_label:'Posted today',posted_precision:'unknown'},now),false);
});
test('date-only proof expires at India midnight, relative proof at 24 hours since observation',()=>{
 const day={...base,posted_at:'2026-10-18T00:00:00Z',posted_precision:'day'};
 assert.equal(currentPosting(day,Date.parse('2026-10-18T18:29:59Z')),true);
 assert.equal(currentPosting(day,Date.parse('2026-10-18T18:30:00Z')),false);
 const relative={...base,reported_age_hours:2,last_seen_at:'2026-10-18T12:00:00Z'};
 assert.equal(currentPosting(relative,now),true);assert.equal(currentPosting(relative,now+1),false);
});

test('visible posting labels advance instead of repeating a stale employer relative label',async()=>{
 const {postingText}=await import('../lib/job-time.ts');
 const relative={...base,reported_age_hours:2,posted_label:'2 hours ago',last_seen_at:'2026-10-18T12:00:00Z'};
 assert.match(postingText(relative,now),/24h ago/);
 assert.match(postingText({...base,posted_label:'Posted today',posted_precision:'day',last_seen_at:'2026-10-18T10:00:00Z'},now),/18 Oct 2026/);
 assert.match(postingText({...base,posted_at:'2099-01-01T00:00:00Z'},now),/unverified/);
});
