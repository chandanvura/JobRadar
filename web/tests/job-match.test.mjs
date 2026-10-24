import test from 'node:test';
import assert from 'node:assert/strict';
import {personalMatch,experienceCompatible,feedbackByFamily} from '../lib/job-match.ts';
const prefs={titles:['DevOps Engineer','Java Developer'],skills:['AWS','Kubernetes'],experienceMin:0,experienceMax:3};
const job=(changes={})=>({title:'Platform DevOps Engineer',role_category:'DevOps',skills:'["AWS","Docker"]',experience_min:1,experience_max:2,is_eligible:1,relevance_score:80,posted_at:null,posted_label:'Posted today',reported_age_hours:null,...changes});
test('current title classification overrides an obsolete scan category',()=>{
 const row=job({title:'Java Backend Developer',role_category:'Software Engineering'});
 assert.equal(personalMatch(row,{...prefs,titles:['Java Developer']}).roleFamilyMatch,true);
 assert.equal(personalMatch(row,{...prefs,titles:['Software Engineer']}).roleFamilyMatch,false);
});
test('stored low experience cannot claim overlap against higher or uncertain JD evidence',()=>{
 assert.equal(experienceCompatible(job({description:'Required experience: 5-7 years.'}),prefs),false);
 assert.equal(experienceCompatible(job({description:'Required: Java and Linux.'}),prefs),null);
 assert.equal(experienceCompatible(job({experience_min:5,experience_max:3}),prefs),null);
});
test('personal ranking rewards title, skill, experience and verified evidence',()=>{const strong=personalMatch(job(),prefs),weak=personalMatch(job({title:'Software Engineer',skills:'[]',is_eligible:0,experience_min:null,experience_max:null,relevance_score:40}),prefs);assert.ok(strong.score>weak.score);assert.equal(strong.titleMatch,true);assert.equal(strong.skillMatch,true);assert.equal(strong.experienceMatch,true)});
test('missing skills remain reviewable while incompatible experience is identified',()=>{assert.ok(personalMatch(job({skills:'[]'}),prefs).score>0);assert.equal(experienceCompatible(job({experience_min:null,experience_max:null}),prefs),null);assert.equal(personalMatch(job({experience_min:4,experience_max:6}),prefs).experienceMatch,false)});
test('private feedback improves similar jobs without unbounded ranking changes',()=>{
 const target=job(),saved={saved:true,status:'New',job:job({title:'Junior DevOps Engineer'})};
 const ignored={saved:false,status:'Ignored',job:job({title:'Platform DevOps Engineer'})};
 assert.ok(feedbackByFamily([saved]).get(target.role_category)>0);
 assert.ok(feedbackByFamily([ignored]).get(target.role_category)<0);
 assert.ok(feedbackByFamily(Array(20).fill(saved)).get(target.role_category)<=20);
});

test('recommendations respect chosen role families even when other components produce a high score',async()=>{
 const {recommendedPreferenceMatch,personalMatch}=await import('../lib/job-match.ts');
 const job={title:'VLSI Engineer',role_category:'Embedded / Hardware',skills:'["Java","AWS"]',experience_min:0,experience_max:2,is_eligible:1,relevance_score:80,posted_at:null,posted_label:null,reported_age_hours:null,normalized_location:'Bengaluru'};
 const preferences={titles:['Java Developer'],skills:['Java','AWS'],experienceMin:0,experienceMax:3,locations:['Bengaluru']};
 assert.ok(personalMatch(job,preferences).score>=30);
 assert.equal(recommendedPreferenceMatch(job,preferences),false);
 assert.equal(recommendedPreferenceMatch({...job,title:'Java Backend Developer',role_category:'Java / Backend'},preferences),true);
 assert.equal(recommendedPreferenceMatch(job,{...preferences,titles:[]}),true);
});

test('a preferred technical family does not admit business or procurement merely for title overlap',async()=>{
 const {personalMatch,recommendedPreferenceMatch}=await import('../lib/job-match.ts');
 const preferences={titles:['Java Developer','DevOps Engineer'],skills:['Java','Docker'],experienceMin:0,experienceMax:3,locations:['Bengaluru']};
 for(const [title,role_category] of [['Business Analyst','Business Analyst'],['Procurement Engineer','Other']]) {
  const row={title,role_category,skills:'["Java","Docker"]',experience_min:1,experience_max:2,is_eligible:1,relevance_score:70,posted_at:null,posted_label:null,reported_age_hours:null,normalized_location:'Bengaluru'};
  assert.equal(personalMatch(row,preferences).roleFamilyMatch,false);
  assert.equal(recommendedPreferenceMatch(row,preferences),false);
 }
});

test('unverified high minimum cannot report overlap and unset profile skills are not called missing',async()=>{
 const {experienceCompatible,skillReviewLabel}=await import('../lib/job-match.ts');
 assert.equal(experienceCompatible({experience_min:5,experience_max:null,experience_label:'Unknown'},{experienceMin:0,experienceMax:3}),false);
 assert.equal(skillReviewLabel({skills:[]},{missingRequiredSkills:['java'],missingSkills:['java']}),'Skills to check');
 assert.equal(skillReviewLabel({skills:['Python']},{missingRequiredSkills:['java'],missingSkills:['java']}),'Required skills missing from profile');
});
