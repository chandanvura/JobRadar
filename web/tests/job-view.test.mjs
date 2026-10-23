import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFreshness,matchesCareerView} from '../lib/job-view.ts';
import {fresherRole} from '../lib/job-sections.ts';
const job=(changes={})=>({title:'Cloud Developer',is_active:1,is_eligible:0,experience_min:0,experience_max:2,eligibility_reason:'Posting date not verified within 24 hours',employment_type:'Full-time',...changes});
test('dashboard and recommendation both require verified current in-range matches',()=>{
 assert.equal(defaultFreshness('Dashboard'),'24 hours');
 assert.equal(matchesCareerView(job(),'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView(job(),'Recommended',0,3,false),false);
 assert.equal(matchesCareerView(job({is_eligible:1}),'Recommended',0,3,true),true);
});
test('unknown requirements remain reviewable without admitting unknown senior roles',()=>{
 const unknown=job({experience_min:null,experience_max:null,eligibility_reason:'Experience not stated — verify'});
 assert.equal(matchesCareerView(unknown,'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView({...unknown,title:'Senior Cloud Developer'},'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView({...unknown,title:'Member of Technical Staff'},'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView({...unknown,title:'Principal Member of Technical Staff'},'Dashboard',0,3,false),false);
});
test('range overlap and 3+ are leads to review, not automatically confirmed matches',()=>{
 assert.equal(matchesCareerView(job({experience_min:2,experience_max:5}),'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView(job({experience_min:3,experience_max:null}),'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView(job({experience_min:4,experience_max:8}),'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView(job({is_active:0}),'Dashboard',0,3,false),false);
});
test('review retains unknown requirements but excludes eligible, inactive and internship jobs',()=>{
 const unknown=job({experience_min:null,experience_max:null,eligibility_reason:'Experience not stated — verify'});
 assert.equal(matchesCareerView(unknown,'Needs Review',0,3,false),true);
 assert.equal(matchesCareerView(job({is_eligible:1}),'Needs Review',0,3,true),false);
 assert.equal(matchesCareerView({...unknown,is_active:0},'Needs Review',0,3,false),false);
 assert.equal(matchesCareerView({...unknown,title:'Cloud Developer Intern'},'Needs Review',0,3,false),false);
 assert.equal(matchesCareerView(unknown,'Recommended',0,3,true),false);
 assert.equal(matchesCareerView(unknown,'Ultra Fresh',0,3,true),false);
});
test('fresher labels distinguish inferred associate ranges from employer zero-experience evidence',()=>{
 assert.equal(fresherRole(job({title:'Associate Software Engineer',experience_label:'Entry-level title'})),false);
 assert.equal(fresherRole(job({title:'Graduate Software Engineer',experience_label:'Entry-level title'})),true);
 assert.equal(fresherRole(job({title:'Member of Technical Staff',experience_min:0})),true);
});

test('an eligible scan record moves out of verified views when its posting proof expires',()=>{
 const job={title:'Java Developer',is_active:1,is_eligible:1,experience_min:0,experience_max:2,experience_label:'0–2',eligibility_reason:'Eligible'};
 assert.equal(matchesCareerView(job,'Recommended',0,3,false),false);
 assert.equal(matchesCareerView(job,'Needs Review',0,3,false),true);
 assert.equal(matchesCareerView(job,'Saved',0,3,false),true);
});


test('early-career shortlists reject senior titles despite low stored years, preserving general browsing and history',()=>{
 for(const title of ['Senior Data Engineer','Sr. Engineer','Research Scientist III']) {
  const row=job({title,is_eligible:1,experience_min:2,experience_max:3});
  assert.equal(matchesCareerView(row,'Dashboard',0,3,true),false);
  assert.equal(matchesCareerView(row,'Recommended',0,3,true),false);
  assert.equal(matchesCareerView(row,'All Jobs',0,3,true),true);
  assert.equal(matchesCareerView(row,'Saved',0,3,true),true);
 }
 assert.equal(matchesCareerView(job({title:'Java Engineer',is_eligible:1,experience_min:2,experience_max:null}),'Dashboard',0,3,true),true);
});

test('review keeps out-of-range and unknown senior evidence, while All Jobs keeps the full active catalogue',()=>{
 for(const changes of [{experience_min:5,experience_max:8},{title:'Senior Cloud Engineer',experience_min:null,experience_max:null}]){
  const row=job(changes);assert.equal(matchesCareerView(row,'Needs Review',0,3,false),true);assert.equal(matchesCareerView(row,'All Jobs',0,3,false),true);assert.equal(matchesCareerView(row,'Dashboard',0,3,false),false);
 }
});
