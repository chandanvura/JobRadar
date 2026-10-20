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

test('explicit fit feedback teaches ranking; experience reports never penalize an entire role family',async()=>{
 const {learningLabel,hideRecommendation,preferenceTime}=await import('../lib/recommendation-feedback.ts');
 const {feedbackByFamily}=await import('../lib/job-match.ts');
 assert.equal(learningLabel({saved:true,status:'Ignored'}),0);
 assert.equal(learningLabel({feedback:'good'}),1);
 for(const reason of ['experience','location']){
  assert.equal(learningLabel({feedback:reason,saved:true}),null);
  assert.equal(hideRecommendation({feedback:reason}),true);
  assert.equal(feedbackByFamily([{job:job('Cloud','x'),feedback:reason}]).size,0);
 }
 assert.equal(hideRecommendation({feedback:'good',status:'Ignored'}),false);
 assert.equal(feedbackByFamily([{job:job('Cloud','x'),saved:true,status:'Ignored'}]).get('Cloud'),-1);
 assert.equal(preferenceTime({preference_at:'original'}, {status:'Viewed'},'now'),'original');
 assert.equal(preferenceTime({preference_at:'original'}, {feedback:'experience'},'now'),'now');
 const explicit=history().map((row,i)=>({...row,saved:false,status:'New',feedback:i<6?'good':'skills'}));
 assert.equal(fitPreferenceModel(explicit,prefs).trained,true);
});
test('recent choices outweigh stale opposite choices and duplicate trackers do not inflate learning',()=>{
 const now=Date.parse('2026-10-18T00:00:00Z'),old='2025-01-01T00:00:00Z',recent='2026-10-17T00:00:00Z';
 const rows=Array.from({length:24},(_,i)=>({job:job(i%2?'Cloud':'Data Engineering',`recent-${i}`),feedback:i<12?(i%2?'good':'role'):(i%2?'role':'good'),preference_at:i<12?old:recent}));
 const model=fitPreferenceModel(rows,prefs,now);assert.equal(model.trained,true);
 assert.ok(model.boost(job('Cloud','new'))<0);assert.ok(model.boost(job('Data Engineering','new'))>0);
 const repeated=Array.from({length:20},(_,i)=>({feedback:'good',job:job('Cloud','same',{application_url:`https://example.com/jobs/same?utm_source=${i}`})}));
 assert.equal(fitPreferenceModel(repeated,prefs).samples,1);
});

test('skill-only feedback does not penalise an entire role family before training',async()=>{
 const {feedbackByFamily}=await import('../lib/job-match.ts');
 assert.equal(feedbackByFamily([{job:job('Cloud','skills'),feedback:'skills'}]).size,0);
 assert.equal(feedbackByFamily([{job:job('Cloud','role'),feedback:'role'}]).get('Cloud'),-1);
});
test('prepared matching components preserve the trained score and latest corrections replace earlier feedback',async()=>{
 const {personalMatch}=await import('../lib/job-match.ts');
 const rows=history().map((row,i)=>({...row,feedback:i<6?'good':'role',preference_at:'2026-10-19T00:00:00Z'}));
 const model=fitPreferenceModel(rows,prefs,Date.parse('2026-10-20T00:00:00Z')),candidate=job('Cloud','prepared');
 assert.equal(model.boost(candidate),model.boost(candidate,personalMatch(candidate,prefs).components));
 const corrected=fitPreferenceModel([...rows,{...rows[0],feedback:'role',preference_at:'2026-10-20T00:00:00Z'}],prefs);
 assert.equal(corrected.samples,12);assert.equal(corrected.positives,5);assert.equal(corrected.negatives,7);
});
