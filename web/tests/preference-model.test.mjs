import test from 'node:test';
import assert from 'node:assert/strict';
import {fitPreferenceModel} from '../lib/preference-model.ts';
import {matchesCareerView} from '../lib/job-view.ts';
const prefs={titles:[],skills:[],experienceMin:0,experienceMax:3,locations:['Bengaluru']};
const job=(family,id,changes={})=>({title:`${family} Engineer ${id}`,role_category:family,skills:family==='Cloud'?'["AWS","Terraform"]':'["SQL","ETL"]',experience_min:0,experience_max:2,is_eligible:1,is_active:1,relevance_score:80,posted_at:null,posted_label:null,reported_age_hours:null,normalized_location:'Bengaluru',application_url:`https://example.com/jobs/${id}`,eligibility_reason:'Eligible',...changes});
const history=()=>Array.from({length:12},(_,i)=>({saved:i<6,status:i<6?'New':'Ignored',job:job(i<6?'Cloud':'Data Engineering',i)}));
test('cold start and one-class histories do not pretend to have a trained model',()=>{
 assert.equal(fitPreferenceModel([],prefs).trained,false);
 const repeated=Array(100).fill(history()[0]);
 const model=fitPreferenceModel(repeated,prefs);assert.equal(model.samples,1);assert.equal(model.trained,false);assert.equal(model.boost(job('Cloud','new')),0);
 assert.equal(fitPreferenceModel(history().map(row=>({...row,saved:true,status:'Applied'})),prefs).trained,false);
});
test('learned preference generalizes to held-out titles and skills with bounded influence',()=>{
 const model=fitPreferenceModel(history(),prefs);
 assert.equal(model.trained,true);assert.equal(model.samples,12);
 const cloud=job('Cloud','heldout',{title:'Cloud Developer Virtualization'}),data=job('Data Engineering','unseen',{title:'Data Pipeline Developer'});
 assert.ok(model.boost(cloud)>0);assert.ok(model.boost(data)<0);
 assert.ok(Math.abs(model.boost(cloud))<=5);assert.ok(Math.abs(model.boost(data))<=5);
 assert.deepEqual(fitPreferenceModel(history(),prefs).boost(cloud),model.boost(cloud));
});
test('rejections and passive views are not preference labels; Ignored beats Saved',()=>{
 const model=fitPreferenceModel([...history(),{saved:true,status:'Rejected',job:job('Cloud','rejected')},{saved:false,status:'Viewed',job:job('Cloud','viewed')},{saved:true,status:'Ignored',job:job('Cloud','ignored')}],prefs);
 assert.equal(model.samples,13);assert.equal(model.negatives,7);
});
test('learning cannot bypass experience, activation or freshness constraints',()=>{
 const model=fitPreferenceModel(history(),prefs);
 for(const change of [{experience_min:5,experience_max:8},{is_active:0},{is_eligible:0}]) {
   const candidate=job('Cloud','blocked',change);model.boost(candidate);
   assert.equal(matchesCareerView(candidate,'Recommended',0,3,true),false);
 }
 const old=job('Cloud','old');assert.equal(matchesCareerView(old,'Recommended',0,3,false),false);
});
