import sections from '../../config/requirement-sections.json' with {type:'json'};
import {candidateClauses} from './requirement-clauses.ts';
import {analyzeExperience,experienceWithinPolicy} from './job-experience.ts';
export {candidateClauses} from './requirement-clauses.ts';
const preferredPattern=new RegExp(sections.preferred,'i');
const requiredPattern=new RegExp(sections.required,'i');
export type RequirementEvidence = {value:string; evidence:string; certainty:'stated'};
import skillPatterns from '../../config/skills.json' with {type:'json'};
const compiledSkills=Object.entries(skillPatterns).map(([skill,pattern])=>[skill,new RegExp(pattern,'i')] as const);

export function extractRequirements(description:string,location='',clauses=candidateClauses(description)) {
 const requiredSkills:RequirementEvidence[]=[],preferredSkills:RequirementEvidence[]=[],mentionedSkills:RequirementEvidence[]=[],education:RequirementEvidence[]=[],batches:RequirementEvidence[]=[];
 const push=(out:RequirementEvidence[],value:string,text:string)=>{if(!out.some(x=>x.value===value))out.push({value,evidence:text.slice(0,320),certainty:'stated'});};
 for(const {text,section} of clauses){
  const preferred=preferredPattern.test(section)||/\b(?:preferred|nice to have|good to have|a plus|desirable|bonus|optional)\b/i.test(text);
  const required=!preferred&&(requiredPattern.test(section)||/\b(?:must|required|mandatory|minimum|need to have)\b/i.test(text));
  for(const [skill,pattern] of compiledSkills)if(pattern.test(text))push(preferred?preferredSkills:required?requiredSkills:mentionedSkills,skill,text);
  for(const m of text.matchAll(/\b(?:bachelor(?:'s|s)?|master(?:'s|s)?|ph\.?d\.?|b\.?tech|m\.?tech|b\.e\.?|m\.e\.?|bca|mca|b\.?sc|m\.?sc|diploma|equivalent (?:practical |work )?experience)\b/gi))push(education,m[0],text);
  for(const m of text.matchAll(/\b(?:BE|ME|BS|MS|BEng|MEng)\b(?=\s+(?:or|and|in|degree)\b)/g))push(education,m[0],text);
  if(/\b(?:batch|graduat(?:ion|ing|ed|es)|class of|pass(?:ed|ing) out)\b/i.test(text))for(const m of text.matchAll(/\b20\d{2}\b/g))push(batches,m[0],text);
 }
 // A conflicting clause is uncertainty, never silently resolved as a must-have.
 const conflicts=requiredSkills.filter(x=>preferredSkills.some(p=>p.value===x.value)).map(x=>x.value);
 const modeEvidence=[location,...clauses.map(x=>x.text)].filter(x=>/\b(?:hybrid|remote|onsite|on[ -]site|work from home|work from (?:an? |the )?office)\b/i.test(x));
 const modes=new Set<string>();for(const text of modeEvidence){
  if(/\bhybrid\b/i.test(text))modes.add('Hybrid');
  if(/\b(?:remote|work from home)\b/i.test(text)&&!/\b(?:not remote|no remote|remote (?:customers|teams|systems|support))\b/i.test(text))modes.add('Remote');
  if(/\b(?:onsite|on[ -]site|work from (?:an? |the )?office)\b/i.test(text))modes.add('Onsite');
 }
 return {experience:analyzeExperience(description,clauses),requiredSkills:requiredSkills.filter(x=>!conflicts.includes(x.value)),preferredSkills:preferredSkills.filter(x=>!conflicts.includes(x.value)),mentionedSkills,skillConflicts:conflicts,education,batches,workMode:modes.size===1?[...modes][0]:modes.size>1?'Conflicting':'Unknown',workModeEvidence:modeEvidence.slice(0,3),reviewNeeded:true};
}
export function experienceUnverified(job:{experience_label?:string}) {return /^(?:Entry-level title|Conditional experience|Conflicting experience|JD extract)/i.test(job.experience_label||'');}
export function normalizeExperience<T extends {description?:string|null;experience_label:string;experience_min:number|null;experience_max:number|null;is_eligible:number;eligibility_reason:string;description_truncated?:boolean}>(job:T):T {
 if(job.description_truncated)return {...job,experience_min:null,experience_max:null,is_eligible:0,experience_label:"JD extract — verify full requirements",eligibility_reason:"JD extract — verify full requirements"};
 const requirements=typeof job.description==='string'&&job.description.trim()?requirementsFor(job):null;
 const analysis=requirements?.experience;
 let normalized=job;
 if(analysis&&analysis.status!=='unknown') {
  const stated=analysis.status==='stated',policy=stated&&experienceWithinPolicy(analysis.min,analysis.max);
  const scanStricter=stated&&job.experience_min!==null&&(job.experience_min>analysis.min!||(job.experience_max!==null&&analysis.max!==null&&job.experience_max>analysis.max));
  if(scanStricter){const review={...job,is_eligible:0,eligibility_reason:'Experience differs between scan and JD — verify'};if(requirements)requirementCache.set(review,requirements);return review;}

  normalized={...job,experience_min:analysis.min,experience_max:analysis.max,experience_label:analysis.label,
   is_eligible:policy?job.is_eligible:0,
   eligibility_reason:!stated?analysis.label:!policy?'Experience exceeds 0–3 YOE policy':!job.is_eligible&&/Experience not stated|Entry-level title/.test(job.eligibility_reason)?'JD experience found — awaiting scan verification':job.eligibility_reason};
 } else {
  const reason=analysis?.preferred.length?'Only preferred experience stated — verify':experienceUnverified(job)?'Entry-level title — experience unverified':'Experience not stated — verify';
  normalized={...job,experience_min:null,experience_max:null,experience_label:reason,is_eligible:0,eligibility_reason:reason};
 }
 if(requirements&&normalized!==job)requirementCache.set(normalized,requirements);
 return normalized;
}

const clauseCache=new WeakMap<object,ReturnType<typeof candidateClauses>>();
export function clausesFor(job:{description?:string|null}) {
 const cached=clauseCache.get(job);if(cached)return cached;
 const value=candidateClauses(job.description||'');clauseCache.set(job,value);return value;
}
const requirementCache=new WeakMap<object,ReturnType<typeof extractRequirements>>();
export function requirementsFor(job:{description?:string|null;location?:string;normalized_location?:string}) {
 const cached=requirementCache.get(job);if(cached)return cached;
 const value=extractRequirements(job.description||'',job.location||job.normalized_location||'',clausesFor(job));
 requirementCache.set(job,value);return value;
}

export function primeRequirements(job:object, value:ReturnType<typeof extractRequirements>) {
 requirementCache.set(job,value);
}

export function hasRequirements(job:object) {return requirementCache.has(job);}
