import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSearchProcessor} from '../lib/job-search-worker.ts';
import {createJobSearchIndex} from '../lib/job-search.ts';
const jobs=[
 {title:'Cloud Developer',company:'HPE',skills:'["Java"]',role_category:'Cloud',description:'Required: Java and AWS. Preferred: Terraform.',normalized_location:'Bengaluru'},
 {title:'Java Engineer',company:'Example',skills:'[]',role_category:'Java / Backend',description:'Java and SQL required.',normalized_location:'Hyderabad'},
];
test('worker search preserves ranking, employer constraints, aliases and quoted phrases',()=>{
 const process=createSearchProcessor();assert.equal(process({type:'index',jobs}),null);
 for(const [id,query] of ['java','cloud engineer HPE','aws bengaluru','"Java Engineer"','no-such-term'].entries()){
   const expected=[...createJobSearchIndex(jobs).search(query)].map(([job,score])=>[jobs.indexOf(job),score]);
   assert.deepEqual(process({type:'query',id,query}),{id,results:expected});
 }
});
test('new catalog replaces the index and precomputed requirement evidence survives transport',()=>{
 const process=createSearchProcessor();process({type:'index',jobs});
 const replacement=[{...jobs[0],description:'Short excerpt.',requirement_skills:'Kubernetes'}];
 process({type:'index',jobs:replacement});
 assert.equal(process({type:'query',id:1,query:'kubernetes'}).results.length,1);
 assert.deepEqual(process({type:'query',id:2,query:'Example'}).results,[]);
});
