import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalApplyUrl,groupDuplicateJobs,diversifyFeed} from '../lib/job-feed.ts';
import {personalMatch,opportunityPriority,freshnessScore,feedbackBoost} from '../lib/job-match.ts';
const now=Date.parse('2026-10-05T12:00:00Z');
const prefs={titles:['DevOps Engineer'],skills:['AWS','k8s','Java'],experienceMin:0,experienceMax:3,locations:['Bengaluru']};
const job=(changes={})=>({company:'Example',title:'DevOps Engineer',role_category:'DevOps',normalized_location:'Bengaluru',ats_provider:'lever',external_job_id:'1',application_url:'https://jobs.lever.co/example/1',skills:'["AWS","Kubernetes","JavaScript"]',experience_min:1,experience_max:2,is_eligible:1,is_active:1,relevance_score:99,posted_at:'2026-10-05T11:00:00Z',posted_label:null,reported_age_hours:null,last_seen_at:'2026-10-05T11:30:00Z',first_seen_at:'2026-10-05T11:30:00Z',...changes});
test('match ignores freshness, eligibility and legacy relevance; priority decays smoothly',()=>{
 const fresh=job(),old=job({posted_at:'2026-10-01T11:00:00Z',is_eligible:0,relevance_score:0});
 assert.equal(personalMatch(fresh,prefs).score,personalMatch(old,prefs).score);
 assert.ok(opportunityPriority(fresh,prefs,now).score>opportunityPriority(old,prefs,now).score);
 assert.equal(opportunityPriority(job({is_active:0}),prefs,now).score,0);
});
test('skill aliases match exactly; Java does not match JavaScript',()=>{
 const match=personalMatch(job(),prefs);
 assert.deepEqual(match.matchedSkills,['aws','kubernetes']);
 assert.deepEqual(match.missingSkills,['javascript']);
 assert.ok(Math.abs(match.components.skills-200/3)<1e-10);
});
test('unknown dates use discounted discovery priority and never invented posting evidence',()=>{
 const match=freshnessScore(job({posted_at:null}),now);
 assert.equal(match.basis,'discovered');assert.ok(match.score<50);
 assert.equal(freshnessScore(job({posted_at:null,first_seen_at:'bad'}),now).score,0);
 assert.equal(freshnessScore(job({posted_at:null,reported_age_hours:2}),now).basis,'posted');
 assert.ok(freshnessScore(job({posted_at:null,reported_age_hours:2}),now).score>50);
});
test('feedback stays small and never learns from rejection',()=>{
 assert.equal(feedbackBoost(job(),Array(50).fill({saved:true,job:job()})),5);
 assert.equal(feedbackBoost(job(),[{status:'Rejected',job:job()}]),0);
});
test('canonical URLs remove trackers but preserve requisition identifiers',()=>{
 assert.equal(canonicalApplyUrl('https://EXAMPLE.com/apply?utm_source=x&jobId=1&ref=y#top'),'https://example.com/apply?jobId=1');
 assert.notEqual(canonicalApplyUrl('https://example.com/apply?jobId=1'),canonicalApplyUrl('https://example.com/apply?jobId=2'));
 assert.equal(canonicalApplyUrl('javascript:alert(1)'),null);
 assert.equal(canonicalApplyUrl('https://user:pass@example.com'),null);
});
test('deduplication namespaces IDs and keeps different requisitions with identical titles',()=>{
 assert.equal(groupDuplicateJobs([job(),job({company:'Other',application_url:'https://example.com/2'})]).length,2);
 assert.equal(groupDuplicateJobs([job(),job({external_job_id:'2',application_url:'https://jobs.lever.co/example/2'})]).length,2);
 const groups=groupDuplicateJobs([job(),job({ats_provider:'custom',application_url:job().application_url+'?utm_source=x'})]);
 assert.equal(groups.length,1);assert.equal(groups[0].sources.length,2);
});
test('fuzzy grouping needs long matching descriptions and cross-source evidence',()=>{
 const description='Build reliable payment services with the engineering team using Java Kubernetes AWS and PostgreSQL. '.repeat(4);
 assert.equal(groupDuplicateJobs([job({description}),job({description,ats_provider:'custom',external_job_id:'2',application_url:'https://example.com/jobs/2'})]).length,1);
 assert.equal(groupDuplicateJobs([job({description}),job({description,external_job_id:'2',application_url:'https://example.com/jobs/2'})]).length,2);
});
test('diversity interleaves near-equal companies/families without jumping score gaps',()=>{
 const jobs=[job({score:99}),job({score:98,external_job_id:'2'}),job({score:97,company:'Other',role_category:'SRE'}),job({score:70,company:'Third'})];
 const result=diversifyFeed(jobs,j=>j.score);
 assert.deepEqual(result.map(j=>j.score),[99,97,98,70]);
});
test('ranking 100 representative fixtures keeps unsuitable and stale jobs below strong matches',()=>{
 const fixtures=Array.from({length:100},(_,i)=>job({external_job_id:String(i),...(i<20?{}:i<60?{title:'Senior Engineer',role_category:'Other',skills:'["JavaScript","React"]',experience_min:6,experience_max:10}:{posted_at:'2026-09-01T12:00:00Z',skills:'[]'})}));
 fixtures.sort((a,b)=>opportunityPriority(b,prefs,now).score-opportunityPriority(a,prefs,now).score);
 assert.equal(fixtures.slice(0,20).filter(j=>Number(j.external_job_id)<20).length,20);
 // Synthetic regression evidence only; not a labeled real-world precision metric.
});
