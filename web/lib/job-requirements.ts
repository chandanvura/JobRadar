import sections from '../../config/requirement-sections.json' with {type:'json'};
export type RequirementEvidence = {value:string; evidence:string; certainty:'stated'};
export function candidateClauses(description:string) {
 const text=description.slice(0,20000).replace(/[‘’]/g,"'").replace(/<[^>]+>/g,'\n').replace(/&nbsp;|&#160;/gi,' ').replace(/&amp;/gi,'&').replace(/&#39;|&apos;/g,"'")
  .replace(new RegExp('\\b('+sections.headers+')\\s*:?','gi'),(_,heading:string)=>'\n§'+heading.toLowerCase()+'\n');
 let section='unspecified';const clauses:{text:string;section:string}[]=[];
 for(const part of text.split(/[\n;•]|(?<=[.!?])\s+/)) {
  const value=part.trim();if(value.startsWith('§')){section=value.slice(1);continue;}
  if(value&&!new RegExp(sections.boilerplate,'i').test(section)&&!new RegExp(sections.company_clause,'i').test(value))clauses.push({text:value,section});
 }
 return clauses;
}
import skillPatterns from '../../config/skills.json' with {type:'json'};

export function extractRequirements(description:string,location='') {
 const clauses=candidateClauses(description);
 const requiredSkills:RequirementEvidence[]=[],preferredSkills:RequirementEvidence[]=[],mentionedSkills:RequirementEvidence[]=[],education:RequirementEvidence[]=[],batches:RequirementEvidence[]=[];
 const push=(out:RequirementEvidence[],value:string,text:string)=>{if(!out.some(x=>x.value===value))out.push({value,evidence:text.slice(0,320),certainty:'stated'});};
 for(const {text,section} of clauses){
  const preferred=new RegExp(sections.preferred,'i').test(section)||/\b(?:preferred|nice to have|good to have|a plus|desirable|bonus|optional)\b/i.test(text);
  const required=!preferred&&(new RegExp(sections.required,'i').test(section)||/\b(?:must|required|mandatory|minimum|need to have)\b/i.test(text));
  for(const [skill,pattern] of Object.entries(skillPatterns))if(new RegExp(pattern,'i').test(text))push(preferred?preferredSkills:required?requiredSkills:mentionedSkills,skill,text);
  for(const m of text.matchAll(/\b(?:bachelor(?:'s|s)?|master(?:'s|s)?|ph\.?d\.?|b\.?tech|m\.?tech|b\.?e\.?|m\.?e\.?|bca|mca|b\.?sc|m\.?sc|diploma|equivalent (?:practical |work )?experience)\b/gi))push(education,m[0],text);
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
 return {requiredSkills:requiredSkills.filter(x=>!conflicts.includes(x.value)),preferredSkills:preferredSkills.filter(x=>!conflicts.includes(x.value)),mentionedSkills,skillConflicts:conflicts,education,batches,workMode:modes.size===1?[...modes][0]:modes.size>1?'Conflicting':'Unknown',workModeEvidence:modeEvidence.slice(0,3),reviewNeeded:true};
}
export function experienceUnverified(job:{experience_label?:string}) {return /^Entry-level title/i.test(job.experience_label||'');}
export function normalizeExperience<T extends {experience_label:string;experience_min:number|null;experience_max:number|null;is_eligible:number;eligibility_reason:string}>(job:T):T {
 return experienceUnverified(job)?{...job,experience_min:null,experience_max:null,experience_label:'Entry-level title — experience unverified',is_eligible:0,eligibility_reason:'Entry-level title — experience unverified'}:job;
}

const requirementCache=new WeakMap<object,ReturnType<typeof extractRequirements>>();
export function requirementsFor(job:{description?:string|null;location?:string;normalized_location?:string}) {
 const cached=requirementCache.get(job);if(cached)return cached;
 const value=extractRequirements(job.description||'',job.location||job.normalized_location||'');
 requirementCache.set(job,value);return value;
}
