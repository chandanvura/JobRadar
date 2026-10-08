import test from 'node:test';
import assert from 'node:assert/strict';
import {extractRequirements,normalizeExperience} from '../lib/job-requirements.ts';
import {matchesCareerView} from '../lib/job-view.ts';
import {personalMatch} from '../lib/job-match.ts';
import {groupDuplicateJobs} from '../lib/job-feed.ts';
import {boardAttribution} from '../lib/source-ownership.ts';
test('required, preferred and unclassified skills retain clause evidence and omit company boilerplate',()=>{
 const r=extractRequirements('Who We Are: Our company uses Azure and SQL. Requirements: Must know Java and Python. Bachelor’s degree or equivalent experience. Graduating batch 2025 or 2026. Preferred Skills: AWS is a plus. Responsibilities: Maintain Kubernetes services.','Bengaluru · Hybrid');
 assert.deepEqual(r.requiredSkills.map(x=>x.value).sort(),['Java','Python']);
 assert.deepEqual(r.preferredSkills.map(x=>x.value),['AWS']);
 assert.deepEqual(r.mentionedSkills.map(x=>x.value),['Kubernetes']);
 assert.ok(r.education.some(x=>/bachelor/i.test(x.value)));
 assert.deepEqual(r.batches.map(x=>x.value),['2025','2026']);
 assert.equal(r.workMode,'Hybrid');assert.ok(r.requiredSkills[0].evidence.includes('Must know'));
});
test('missing, negative and conflicting requirements stay uncertain',()=>{
 assert.equal(extractRequirements('Benefits: Remote learning and Java workshops.').workMode,'Unknown');
 assert.equal(extractRequirements('Requirements: Must be able to debug services.').education.length,0);
 assert.equal(extractRequirements('Not remote. Onsite position.').workMode,'Onsite');
 const r=extractRequirements('Required Skills: Java. Preferred Skills: Java. Remote or onsite position.');
 assert.deepEqual(r.skillConflicts,['Java']);assert.equal(r.requiredSkills.length,0);
 assert.equal(r.workMode,'Conflicting');
});
test('legacy title-inferred experience never enters verified views or gets numeric match credit',()=>{
 const j={title:'Associate Software Engineer',experience_min:0,experience_max:3,experience_label:'Entry-level title',is_eligible:1,is_active:1,eligibility_reason:'Eligible',employment_type:'Full-time'};
 assert.equal(matchesCareerView(j,'Recommended',0,3,true),false);
 assert.equal(matchesCareerView(j,'Dashboard',0,3,true),true);
 const fixed=normalizeExperience(j);assert.equal(fixed.experience_min,null);assert.equal(fixed.is_eligible,0);
});
test('shared board aliases group exact requisitions while preserving separate IDs and sources',()=>{
 const base={title:'Cloud Developer',normalized_location:'Bengaluru',ats_provider:'workday',external_job_id:'1211072',application_url:'https://hpe.wd5.myworkdayjobs.com/Jobsathpe/job/Bengaluru/Cloud-Developer_1211072-2',is_active:1,is_eligible:0,role_category:'Cloud'};
 const hpe={...base,company:'HPE'},juniper={...base,company:'Juniper Networks'};
 const groups=groupDuplicateJobs([juniper,hpe]);assert.equal(groups.length,1);assert.equal(groups[0].job,hpe);assert.equal(groups[0].sources.length,2);
 assert.equal(boardAttribution(juniper).employer,'HPE');
 assert.equal(groupDuplicateJobs([hpe,{...juniper,external_job_id:'2',application_url:base.application_url.replace('1211072','1219999')}]).length,2);
 const generic={...base,application_url:'https://example.com/apply'};
 assert.equal(groupDuplicateJobs([{...generic,company:'A'},{...generic,company:'B'}]).length,2);
});
test('explicit required skills carry more rank weight than preferences',()=>{
 const j={title:'Java Developer',role_category:'Java / Backend',skills:'["Java","AWS"]',experience_min:1,experience_max:2,is_eligible:1,relevance_score:80,posted_at:null,posted_label:null,reported_age_hours:null,description:'Requirements: Java. Preferred Skills: AWS.'};
 const p={titles:[],skills:['Java'],experienceMin:0,experienceMax:3};
 assert.ok(personalMatch(j,p).components.skills > personalMatch(j,{...p,skills:['AWS']}).components.skills);
});

test('actual HPE education abbreviations and preferred-experience headings are extracted',()=>{
 const r=extractRequirements('What you need to bring: Education: BE or MS in Computer Science, or equivalent technical degree. Proficiency in Python, Go, or other languages. Preferred Experience: Familiarity with Docker. Experience with Kubernetes. What We Can Offer You: Learn Java.');
 assert.deepEqual(r.education.map(x=>x.value),['BE','MS']);
 assert.deepEqual(r.requiredSkills.map(x=>x.value).sort(),['Go','Python']);
 assert.deepEqual(r.preferredSkills.map(x=>x.value).sort(),['Docker','Kubernetes']);
 assert.ok(![...r.requiredSkills,...r.preferredSkills,...r.mentionedSkills].some(x=>x.value==='Java'));
});

test('empty Dashboard never bypasses filters and Recommended review fallback deduplicates sources',async()=>{
 const {visibleCareerJobs}=await import('../lib/job-view.ts');
 const base={title:'Cloud Developer',normalized_location:'Bengaluru',ats_provider:'workday',external_job_id:'1',application_url:'https://hpe.wd5.myworkdayjobs.com/Jobsathpe/job/Bengaluru/Cloud-Developer_1',is_active:1,is_eligible:0,role_category:'Cloud',company:'HPE'};
 const alias={...base,company:'Juniper Networks'};
 assert.deepEqual(visibleCareerJobs('Dashboard',[],[base,alias]),[]);
 assert.equal(visibleCareerJobs('Recommended',[],[base,alias]).length,1);
 assert.deepEqual(visibleCareerJobs('Recommended',[base],[alias]),[base]);
});
