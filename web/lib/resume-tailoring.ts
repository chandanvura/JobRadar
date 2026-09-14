export type Resume={name:string;contact:string;summary:string;experience:string;projects:string;education:string;skills:string;jd:string};
export const resumeFields=['name','contact','summary','experience','projects','education','skills','jd'] as const;
export const blankResume:Resume={name:'',contact:'',summary:'',experience:'',projects:'',education:'',skills:'',jd:''};
export function cleanResume(value:unknown):Resume{const v=value&&typeof value==='object'?value as Record<string,unknown>:{};return Object.fromEntries(resumeFields.map(k=>[k,typeof v[k]==='string'?v[k].slice(0,20000):''])) as Resume}
export const keywordList=['Java','Python','JavaScript','TypeScript','Go','Spring','Spring Boot','React','SQL','PostgreSQL','MySQL','Redis','MongoDB','AWS','Azure','GCP','Docker','Kubernetes','Terraform','Ansible','Jenkins','Linux','Git','CI/CD','REST','Microservices','Prometheus','Grafana','Kafka','Helm','ArgoCD','Bash','Networking','Observability','Incident response','Testing'];
export const matches=(text:string,word:string)=>new RegExp('(^|[^a-z0-9])'+word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?=$|[^a-z0-9])','i').test(text);
export function hasResume(r:Resume){return Boolean(r.name.trim()&&(r.experience.trim()||r.projects.trim()||r.education.trim()))}
export function tailorResume(base:Resume,jd:string){
 const skills=base.skills.split(/[,;|\n]+/).map(s=>s.trim()).filter(Boolean);
 const wanted=[...new Set([...keywordList,...skills])].filter(k=>matches(jd,k));
 const rank=(line:string)=>wanted.filter(k=>matches(line,k)).length;
 // Sort only consecutive bullet runs. Headers and dates remain in place, even without blank lines.
 const reorder=(text:string)=>{const lines=text.split('\n');for(let i=0;i<lines.length;){if(!/^\s*[-•*]\s/.test(lines[i])){i++;continue}let end=i;const bullets:string[][]=[];while(end<lines.length&&/^\s*[-•*]\s/.test(lines[end])){const bullet=[lines[end++]];while(end<lines.length&&/^\s+\S/.test(lines[end])&&!/^\s*[-•*]\s/.test(lines[end]))bullet.push(lines[end++]);bullets.push(bullet)}lines.splice(i,end-i,...bullets.sort((a,b)=>rank(b.join(' '))-rank(a.join(' '))).flat());i=end;}return lines.join('\n')};
 const resume={...base,jd,experience:reorder(base.experience),projects:reorder(base.projects),skills:skills.sort((a,b)=>rank(b)-rank(a)).join(', ')};
 const text=[base.summary,base.experience,base.projects,base.skills,base.education].join('\n');
 return {resume,present:wanted.filter(k=>matches(text,k)),missing:wanted.filter(k=>!matches(text,k)),changed:resume.experience!==base.experience||resume.projects!==base.projects||resume.skills!==base.skills};
}
