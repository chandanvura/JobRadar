import test from 'node:test';
import assert from 'node:assert/strict';
import {defaultFreshness,matchesCareerView} from '../lib/job-view.ts';
import {fresherRole} from '../lib/job-sections.ts';
const job=(changes={})=>({title:'Cloud Developer',is_active:1,is_eligible:0,experience_min:0,experience_max:2,eligibility_reason:'Posting date not verified within 24 hours',employment_type:'Full-time',...changes});
test('dashboard keeps older 0–3 roles visible; recommendation remains strict',()=>{
 assert.equal(defaultFreshness('Dashboard'),'Any date');
 assert.equal(matchesCareerView(job(),'Dashboard',0,3,false),true);
 assert.equal(matchesCareerView(job(),'Recommended',0,3,false),false);
 assert.equal(matchesCareerView(job({is_eligible:1}),'Recommended',0,3,true),true);
});
test('unknown requirements remain reviewable without admitting unknown senior roles',()=>{
 const unknown=job({experience_min:null,experience_max:null,eligibility_reason:'Experience not stated — verify'});
 assert.equal(matchesCareerView(unknown,'Dashboard',0,3,false),true);
 assert.equal(matchesCareerView({...unknown,title:'Senior Cloud Developer'},'Dashboard',0,3,false),false);
 assert.equal(matchesCareerView({...unknown,title:'Member of Technical Staff'},'Dashboard',0,3,false),true);
 assert.equal(matchesCareerView({...unknown,title:'Principal Member of Technical Staff'},'Dashboard',0,3,false),false);
});
test('range overlap and 3+ are leads to review, not automatically confirmed matches',()=>{
 assert.equal(matchesCareerView(job({experience_min:2,experience_max:5}),'Dashboard',0,3,false),true);
 assert.equal(matchesCareerView(job({experience_min:3,experience_max:null}),'Dashboard',0,3,false),true);
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
