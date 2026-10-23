type Tracked={saved?:boolean;status?:string;updated_at?:string;appliedAt?:string;followUpOn?:string;job:{title:string;company:string;application_url:string;normalized_location:string}};
const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
export function trackingCsv(rows:Tracked[],view:'Saved'|'Applications') {
 const selected=rows.filter(row=>view==='Saved'?row.saved:['Applied','Interview','Offer','Rejected'].includes(row.status||''));
 return [['Company','Role','Location','Status','Applied at','Follow up on','Application URL'],...selected.map(row=>[row.job.company,row.job.title,row.job.normalized_location,row.status,row.appliedAt,row.followUpOn,row.job.application_url])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}
export function validFollowUpDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const stamp=Date.parse(value+'T00:00:00Z');return Number.isFinite(stamp)&&new Date(stamp).toISOString().slice(0,10)===value;
}
export function followUpDue(row:{status?:string;followUpOn?:string},today:string) {
 return ['Applied','Interview'].includes(row.status||'')&&validFollowUpDate(row.followUpOn)&&row.followUpOn!<=today;
}
export function displaySkill(value:string) {
 const names:Record<string,string>={python:'Python',java:'Java',javascript:'JavaScript',typescript:'TypeScript',docker:'Docker',kubernetes:'Kubernetes',aws:'AWS',azure:'Azure',gcp:'GCP','ci/cd':'CI/CD',sql:'SQL',linux:'Linux',terraform:'Terraform',git:'Git',jenkins:'Jenkins',react:'React','spring boot':'Spring Boot','node.js':'Node.js',postgresql:'PostgreSQL',go:'Go'};
 return names[value.toLowerCase()]||value;
}
/** Local calendar download only; no notification permissions or server service. */
export function followUpCalendar(row:Tracked) {
 if(!validFollowUpDate(row.followUpOn))throw Error('Choose a follow-up date first');
 const escape=(s:string)=>s.replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll('\r','').replaceAll(',','\\,').replaceAll(';','\\;');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//JobRadar//Private follow-up//EN','BEGIN:VEVENT',`UID:${encodeURIComponent(row.job.application_url)}-${row.followUpOn}@jobradar.local`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${row.followUpOn.replaceAll('-','')}`,`SUMMARY:${escape('Follow up: '+row.job.company+' — '+row.job.title)}`,`DESCRIPTION:${escape('Review your application and decide whether a respectful follow-up is appropriate. '+row.job.application_url)}`,'BEGIN:VALARM','TRIGGER:-PT9H','ACTION:DISPLAY','DESCRIPTION:Review application follow-up','END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
