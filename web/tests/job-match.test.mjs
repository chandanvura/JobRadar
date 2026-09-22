import test from 'node:test';
import assert from 'node:assert/strict';
import {personalMatch,experienceCompatible,feedbackBoost} from '../lib/job-match.ts';
const prefs={titles:['DevOps Engineer','Java Developer'],skills:['AWS','Kubernetes'],experienceMin:0,experienceMax:3};
const job=(changes={})=>({title:'Platform DevOps Engineer',role_category:'DevOps',skills:'["AWS","Docker"]',experience_min:1,experience_max:2,is_eligible:1,relevance_score:80,posted_at:null,posted_label:'Posted today',reported_age_hours:null,...changes});
test('personal ranking rewards title, skill, experience and verified evidence',()=>{const strong=personalMatch(job(),prefs),weak=personalMatch(job({title:'Software Engineer',skills:'[]',is_eligible:0,experience_min:null,experience_max:null,relevance_score:40}),prefs);assert.ok(strong.score>weak.score);assert.equal(strong.titleMatch,true);assert.equal(strong.skillMatch,true);assert.equal(strong.experienceMatch,true)});
test('missing skills remain reviewable while incompatible experience is identified',()=>{assert.ok(personalMatch(job({skills:'[]'}),prefs).score>0);assert.equal(experienceCompatible(job({experience_min:null,experience_max:null}),prefs),null);assert.equal(personalMatch(job({experience_min:4,experience_max:6}),prefs).experienceMatch,false)});
test('private feedback improves similar jobs without unbounded ranking changes',()=>{
 const target=job(),saved={saved:true,status:'New',job:job({title:'Junior DevOps Engineer'})};
 const ignored={saved:false,status:'Ignored',job:job({title:'Platform DevOps Engineer'})};
 assert.ok(feedbackBoost(target,[saved])>0);
 assert.ok(feedbackBoost(target,[ignored])<0);
 assert.ok(feedbackBoost(target,Array(20).fill(saved))<=20);
});
