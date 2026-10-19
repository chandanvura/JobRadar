import rules from '../../config/experience-rules.json' with {type:'json'};
import sections from '../../config/requirement-sections.json' with {type:'json'};
import {candidateClauses} from './requirement-clauses.ts';
export type ExperienceEvidence={min:number;max:number|null;kind:string;evidence:string;section:string};
export type ExperienceAnalysis={min:number|null;max:number|null;label:string;status:'unknown'|'stated'|'conditional'|'conflict';required:ExperienceEvidence[];preferred:ExperienceEvidence[]};
const patterns=rules.patterns.map(row=>({...row,regex:new RegExp(row.pattern,'gi')}));
const fragmentPattern=new RegExp(rules.fragment_split,'i');
const words=new RegExp('\\b('+Object.keys(rules.words).join('|')+')\\b','gi');
const optionalPattern=new RegExp(rules.optional,'i'),requiredPattern=new RegExp(sections.required,'i'),preferredPattern=new RegExp(sections.preferred,'i'),juniorPattern=new RegExp(rules.junior,'i'),excludedPattern=new RegExp(rules.exclude,'i');
const factor=(unit:string|undefined)=>/^mo/i.test(unit||'')?1/12:1;
const rounded=(value:number)=>Math.round(value*1e6)/1e6;
const juniorExcludedPattern=new RegExp(rules.junior_excluded,'i');
export function analyzeExperience(description:string,clauses=candidateClauses(description)):ExperienceAnalysis {
 const required:ExperienceEvidence[]=[],preferred:ExperienceEvidence[]=[];let conditional=false;
 for(const {text:original,section} of clauses)for(const fragment of original.split(fragmentPattern)) {
  const text=fragment.replace(words,word=>String(rules.words[word.toLowerCase() as keyof typeof rules.words]));
  if(/\b(?:company|organisation|organization|team)\s+has\b|\bfounded\b/i.test(text))continue;
  if(excludedPattern.test(text)&&! /\bexperience\b/i.test(text)&&!juniorPattern.test(text))continue;
  const optional=preferredPattern.test(section)||optionalPattern.test(text),rows:ExperienceEvidence[]=[],spans:[number,number][]=[];
  for(const {kind,regex} of patterns)for(const match of text.matchAll(regex)) {
   const start=match.index!,end=start+match[0].length;
   if(spans.some(([left,right])=>start<right&&end>left))continue;
   if(/^\s*(?:long\s+)?(?:degree|course|contract|tenure|warranty|bond|bachelor|master|phd|ago|old)\b/i.test(text.slice(end,end+60)))continue;
   if(!requiredPattern.test(section)&&!optional&&! /\b(?:experience|experienced|overall|candidate|minimum|maximum|requires?|needs?|freshers?)\b/i.test(text)&&! /^[\d\s.\-–—+]+(?:years?|yrs?|yoe|months?|mos?)\.?$/i.test(text.trim())&&kind==='exact')continue;
   let min:number,max:number|null;
   if(kind==='range'){min=Number(match[1])*factor(match[2]||match[4]);max=Number(match[3])*factor(match[4]);}
   else {const value=Number(match[1])*factor(match[2]);min=kind==='upper'?0:value;max=kind==='lower'?null:value;}
   rows.push({min:rounded(min),max:max===null?null:rounded(max),kind,evidence:fragment.trim().slice(0,400),section});spans.push([start,end]);
  }
  if(rows.length>1&&/\bor\b/i.test(text)&&!optional)conditional=true;
  if(!rows.length&&juniorPattern.test(text)&&!juniorExcludedPattern.test(text))rows.push({min:0,max:null,kind:'junior',evidence:fragment.trim().slice(0,400),section});
  (optional?preferred:required).push(...rows);
 }
 const unique=(rows:ExperienceEvidence[])=>[...new Map(rows.map(row=>[JSON.stringify([row.min,row.max,row.kind,row.evidence,row.section]),row])).values()];
 required.splice(0,required.length,...unique(required));preferred.splice(0,preferred.length,...unique(preferred));
 const result:ExperienceAnalysis={min:null,max:null,label:'Unknown',status:'unknown',required,preferred};
 const numeric=required.filter(row=>row.kind!=='junior');let constraints=numeric.length?numeric:required;
 if(!constraints.length)return result;
 if(conditional)return {...result,status:'conditional',label:'Conditional experience — verify'};
 const lower=constraints.filter(row=>row.kind==='lower').map(row=>row.min),upper=constraints.filter(row=>row.kind==='upper').map(row=>row.max!);
 if(lower.length&&upper.length)constraints=[...constraints.filter(row=>row.kind!=='lower'),{min:Math.max(...lower),max:Math.min(...upper),kind:'range',evidence:'',section:''}];
 if(constraints.some(row=>row.max!==null&&row.min>row.max))return {...result,status:'conflict',label:'Conflicting experience — verify'};
 const chosen=constraints.reduce((a,b)=>b.min>a.min||(b.min===a.min&&(b.max??Infinity)>(a.max??Infinity))?b:a);
 const {min,max}=chosen,label=chosen.kind==='junior'?'Fresher':max===null?`${min}+`:min===max?`${min}`:`${min}–${max}`;
 return {...result,min,max,label,status:'stated'};
}
export function experienceWithinPolicy(min:number|null,max:number|null) {return min!==null&&min>=0&&(max===null?min<=2:max>=min&&max<=3);}
export function experienceDecision(analysis:ExperienceAnalysis) {
 return analysis.status!=='stated'?'Verify JD before shortlisting':experienceWithinPolicy(analysis.min,analysis.max)?'Shortlist by experience':'Do not shortlist by experience';
}
