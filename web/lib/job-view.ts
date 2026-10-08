import {internshipRole} from './job-sections.ts';
export type ViewJob={title:string;is_active:number;is_eligible:number;experience_min:number|null;experience_max:number|null;experience_label?:string;employment_type?:string|null;eligibility_reason:string};
const senior=(title:string)=>/\b(?:senior|staff|principal|lead|manager|director|head|architect|experienced)\b/i.test(title.replace(/member of technical staff/gi,'technical contributor'));
export const verifiedView=(view:string)=>['Recommended','Ultra Fresh'].includes(view);
export const defaultFreshness=(view:string)=>verifiedView(view)?'24 hours':'Any date';
export function matchesCareerView(job:ViewJob,view:string,min:number,max:number,currentPosting:boolean) {
  if(['Saved','Applications'].includes(view))return true;
  if(!job.is_active)return false;
  if(view==='All Jobs')return !internshipRole(job);
  if(view==='Internships')return internshipRole(job);
  if(internshipRole(job))return false;
  if(verifiedView(view)&&(!job.is_eligible||!currentPosting))return false;
  const known=job.experience_min!==null||job.experience_max!==null;
  if(known&&((job.experience_min??0)>max||(job.experience_max??Infinity)<min))return false;
  if(!known&&senior(job.title))return false;
  if(view==='Needs Review')return !job.is_eligible;
  return true;
}
