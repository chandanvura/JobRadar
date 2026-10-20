import {learningLabel} from './recommendation-feedback.ts';
import {canonicalApplyUrl} from './job-feed.ts';
import {createPersonalMatcher, normalizeSkill} from './job-match.ts';
import type {LearningRecord, MatchJob, MatchPreferences} from './job-match.ts';
import {ROLE_FAMILIES} from './role-taxonomy.ts';

// Small regularized logistic model, fitted locally from explicit preferences.
// Its output is an uncalibrated preference signal, never hiring probability.
const roleOffset=4+ROLE_FAMILIES.length,skillOffset=roleOffset+16,dimensions=skillOffset+32;
const bucket=(value:string,size:number)=>{let hash=2166136261;for(const character of value)hash=Math.imul(hash^character.charCodeAt(0),16777619);return(hash>>>0)%size;};
const sigmoid=(value:number)=>1/(1+Math.exp(-Math.max(-25,Math.min(25,value))));
type Components={title:number;skills:number;experience:number;location:number};
function features(job:MatchJob, fit:Components):number[] {
  const vector=new Array<number>(dimensions).fill(0);
  [fit.title,fit.skills,fit.experience,fit.location].forEach((v,i)=>{vector[i]=Number.isFinite(v)?(v-50)/50:0;});
  const family=ROLE_FAMILIES.indexOf(job.role_category);
  if(family>=0)vector[4+family]=1;else vector[roleOffset+bucket(job.role_category,16)]=1;
  let skills:string[]=[];
  try {const parsed:unknown=JSON.parse(job.skills);if(Array.isArray(parsed))skills=[...new Set(parsed.filter((s):s is string=>typeof s==='string').map(normalizeSkill))].slice(0,32);}catch{/* Missing skills remain neutral. */}
  for(const skill of skills) {
    let hash=2166136261;
    for(const character of skill)hash=Math.imul(hash^character.charCodeAt(0),16777619);
    vector[skillOffset+(hash>>>0)%32]+=1/Math.sqrt(Math.max(1,skills.length));
  }
  return vector;
}
export function fitPreferenceModel(history:LearningRecord[], preferences:MatchPreferences,now=Date.now()) {
  const match=createPersonalMatcher(preferences);
  const examples=new Map<string,{job:MatchJob;label:number;weight:number;feedback?:string}>();
  const recent=[...history].sort((a,b)=>(Date.parse(a.preference_at||a.updated_at||'')||0)-(Date.parse(b.preference_at||b.updated_at||'')||0)).slice(-500);
  for(const record of recent) {
    const label=learningLabel(record);
    if(label===null)continue;
    const job=record.job;
    const key=(job.application_url&&canonicalApplyUrl(job.application_url))||[job.title,job.role_category,job.skills].join('\u001f');
    const age=(now-Date.parse(record.preference_at||record.updated_at||''))/86400000;
    const weight=Number.isFinite(age)&&age>=0?Math.max(.25,Math.pow(.5,age/90)):1;
    const confidence=record.feedback?1:record.status==='Ignored' ? .35:record.saved ? .6 : .8;
    examples.set(key,{job,label,weight:weight*confidence,feedback:record.feedback});
  }
  const rows=[...examples.values()];
  const positives=rows.filter(row=>row.label===1).length, negatives=rows.length-positives;
  const prepared=rows.map(row=>({...row,x:features(row.job,match(row.job).components)}));
  const models=['role','skills'].flatMap(kind=>{
    const included=prepared.filter(row=>row.label===1||!['role','skills'].includes(row.feedback||'')||row.feedback===kind);
    const positive=included.filter(row=>row.label===1),negative=included.filter(row=>row.label===0);
    if(included.length<12||positive.length<4||negative.length<4)return [];
    const indices=Array.from({length:dimensions},(_,i)=>i).filter(i=>kind==='role'?i===0||(i>=4&&i<skillOffset):i===1||i>=skillOffset);
    const samples=included.map(row=>({...row,x:indices.map(i=>row.x[i])}));
    const weights=indices.map(()=>0),positiveWeight=positive.reduce((sum,row)=>sum+row.weight,0),negativeWeight=negative.reduce((sum,row)=>sum+row.weight,0);
    // Train each reason on matching positive and negative evidence. This avoids
    // treating a skill mismatch as a dislike of the whole role family.
    for(let epoch=0;epoch<80;epoch++){
      const gradient=weights.map(w=>.08*w);
      for(const row of samples){
        const prediction=sigmoid(row.x.reduce((sum,value,i)=>sum+value*weights[i],0));
        const error=(prediction-row.label)*row.weight/(2*(row.label?positiveWeight:negativeWeight));
        row.x.forEach((value,i)=>{gradient[i]+=error*value;});
      }
      weights.forEach((_,i)=>{weights[i]-=.5*gradient[i];});
    }
    return [{indices,weights}];
  });
  const trained=models.length>0;
  return {trained,samples:rows.length,positives,negatives,boost(job:MatchJob,components?:Components){
    if(!trained)return 0;
    const x=features(job,components||match(job).components);
    const centered=models.map(model=>sigmoid(model.indices.reduce((sum,index,i)=>sum+x[index]*model.weights[i],0))-.5);
    // A bounded ±5 points cannot change city/experience/freshness eligibility.
    return Math.max(-5,Math.min(5,centered.reduce((sum,value)=>sum+value,0)/models.length*10));
  }};
}
