import {employerText} from './employer-text.ts';
import sections from '../../config/requirement-sections.json' with {type:'json'};
const experienceHeaderPattern=new RegExp(sections.experience_heading,'gim');
const headersPattern=new RegExp('\\b('+sections.headers+')\\s*:?','gi');
const boilerplatePattern=new RegExp(sections.boilerplate,'i');
const companyPattern=new RegExp(sections.company_clause,'i');
export function candidateClauses(description:string) {
 const text=employerText(description.slice(0,20000)).replace(/[‘’]/g,"'")
  .replace(headersPattern,(_,heading:string)=>'\n§'+heading.toLowerCase()+'\n')
  .replace(experienceHeaderPattern,'\n§experience\n');
 let section='unspecified';const clauses:{text:string;section:string}[]=[];
 for(const part of text.split(/[\n;•]|(?<=[.!?])\s+/)) {
  const value=part.trim();if(value.startsWith('§')){section=value.slice(1);continue;}
  if(value&&!boilerplatePattern.test(section)&&!companyPattern.test(value))clauses.push({text:value,section});
 }
 return clauses;
}
