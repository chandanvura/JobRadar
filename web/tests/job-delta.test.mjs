import {test} from 'node:test';
import assert from 'node:assert/strict';
import {jobDelta,JOB_INSERT_COLUMNS} from '../worker/job-delta.ts';
const row=()=>({...Object.fromEntries(JOB_INSERT_COLUMNS.map(column=>[column,null])),is_active:1,last_seen_at:'old',company:'Example',posted_at:'original',relevance_score:50,city:'Bengaluru'});
test('unchanged sightings and immutable fields consume no update',()=>{
  const old=row();assert.deepEqual(jobDelta(old,{...old,company:'example',first_seen_at:'new',last_seen_at:'new',posted_at:'rolling'}),{});
});
test('only changed columns are written; unrelated indexes are untouched',()=>{
  const old=row();assert.deepEqual(jobDelta(old,{...old,description:'updated',last_seen_at:'new'}),{description:'updated',last_seen_at:'new'});
  assert.deepEqual(jobDelta(old,{...old,relevance_score:25}),{relevance_score:25});
});
test('reappearing jobs reactivate and eligibility transitions are saved',()=>{
  const old={...row(),is_active:0};assert.deepEqual(jobDelta(old,{...old,is_eligible:1,last_seen_at:'new'}),{is_eligible:1,is_active:1,last_seen_at:'new'});
});
test('a newly verified posting date is stored',()=>{
  const old={...row(),posted_at:null};assert.deepEqual(jobDelta(old,{...old,posted_at:'verified'}),{posted_at:'verified'});
});
