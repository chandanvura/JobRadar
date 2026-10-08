import {personalMatch, normalizeSkill} from './job-match.ts';
import type {LearningRecord, MatchJob, MatchPreferences} from './job-match.ts';
import {ROLE_FAMILIES} from './role-taxonomy.ts';

// Small regularized logistic model, fitted locally from explicit preferences.
// Its output is an uncalibrated preference signal, never hiring probability.
const dimensions=4+ROLE_FAMILIES.length+32;
const sigmoid=(value:number)=>1/(1+Math.exp(-Math.max(-25,Math.min(25,value))));
function features(job:MatchJob, preferences:MatchPreferences):number[] {
  const fit=personalMatch(job,preferences).components;
  const vector=new Array<number>(dimensions).fill(0);
  [fit.title,fit.skills,fit.experience,fit.location].forEach((v,i)=>{vector[i]=Number.isFinite(v)?(v-50)/50:0;});
  const family=ROLE_FAMILIES.indexOf(job.role_category);
  if(family>=0)vector[4+family]=1;
  let skills:string[]=[];
  try {const parsed:unknown=JSON.parse(job.skills);if(Array.isArray(parsed))skills=[...new Set(parsed.filter((s):s is string=>typeof s==='string').map(normalizeSkill))].slice(0,32);}catch{/* Missing skills remain neutral. */}
  for(const skill of skills) {
    let hash=2166136261;
    for(const character of skill)hash=Math.imul(hash^character.charCodeAt(0),16777619);
    vector[4+ROLE_FAMILIES.length+(hash>>>0)%32]+=1/Math.sqrt(Math.max(1,skills.length));
  }
  return vector;
}
export function fitPreferenceModel(history:LearningRecord[], preferences:MatchPreferences) {
  const examples=new Map<string,{job:MatchJob;label:number}>();
  for(const record of history.slice(-500)) {
    // Rejection is an employer outcome, not an explicit preference label.
    if(record.status==='Rejected')continue;
    const label=record.status==='Ignored'?0:record.saved||['Applied','Interview','Offer'].includes(record.status||'')?1:null;
    if(label===null)continue;
    const job=record.job;
    const key=job.application_url||[job.title,job.role_category,job.skills].join('\u001f');
    examples.set(key,{job,label});
  }
  const rows=[...examples.values()];
  const positives=rows.filter(row=>row.label===1).length, negatives=rows.length-positives;
  const trained=rows.length>=12&&positives>=4&&negatives>=4;
  const weights=new Array<number>(dimensions).fill(0);
  if(trained) {
    const samples=rows.map(row=>({...row,x:features(row.job,preferences)}));
    // Deterministic full-batch gradients and class balance prevent one repeated
    // choice or a majority of saved jobs from dominating the tiny model.
    for(let epoch=0;epoch<80;epoch++) {
      const gradient=weights.map(w=>.08*w);
      for(const row of samples) {
        const prediction=sigmoid(row.x.reduce((sum,value,i)=>sum+value*weights[i],0));
        const balance=1/(2*(row.label?positives:negatives));
        const error=(prediction-row.label)*balance;
        row.x.forEach((value,i)=>{gradient[i]+=error*value;});
      }
      weights.forEach((_,i)=>{weights[i]-=.5*gradient[i];});
    }
  }
  return {trained,samples:rows.length,positives,negatives,boost(job:MatchJob) {
    if(!trained)return 0;
    const x=features(job,preferences);
    const prediction=sigmoid(x.reduce((sum,value,i)=>sum+value*weights[i],0));
    // A bounded ±5 points cannot change city/experience/freshness eligibility.
    return Math.max(-5,Math.min(5,(prediction-.5)*10));
  }};
}
