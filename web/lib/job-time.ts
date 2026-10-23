type Posting={posted_label?:string|null;reported_age_hours:number|null;posted_at:string|null;last_seen_at:string;posted_precision:string};
export function postingAge(job:Posting,now=Date.now()){
 const age=(date:string|null)=>{if(!date)return null;const value=(now-Date.parse(date))/3600000;return Number.isFinite(value)&&value>=0?value:null};
 if(job.posted_at&&age(job.posted_at)===null)return null;
 if(job.reported_age_hours!==null){const elapsed=age(job.last_seen_at);return elapsed===null||!Number.isFinite(job.reported_age_hours)||job.reported_age_hours<0?null:job.reported_age_hours+elapsed;}
 return age(job.posted_at);
}
export function currentPosting(job:Posting,now=Date.now()){
 const age=postingAge(job,now);
 const observed=Date.parse(job.last_seen_at),posted=job.posted_at?Date.parse(job.posted_at):null;
 const day=(time:number)=>Math.floor((time+19_800_000)/86_400_000);
 if(job.posted_at&&(posted===null||!Number.isFinite(posted)||posted>now))return false;
 if(job.reported_age_hours!==null)return age!==null&&age<=24;
 if(posted!==null)return job.posted_precision==='day'?day(posted)===day(now):age!==null&&age<=24;
 return job.posted_precision==='day'&&/^(?:posted\s+)?today$/i.test((job.posted_label||'').trim())&&Number.isFinite(observed)&&observed<=now&&day(observed)===day(now);
}

export function postingText(job:Posting,now=Date.now()) {
 const hours=postingAge(job,now);
 if(job.reported_age_hours!==null)return hours===null?'Posting time unverified':`Posted about ${hours<1?`${Math.floor(hours*60)}m`:`${Math.floor(hours)}h`} ago · employer estimate`;
 if(job.posted_at){
  if(hours===null)return 'Posting date unverified';
  if(job.posted_precision==='day')return `Posted ${new Date(job.posted_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'})} · date only`;
  return `Posted ${hours<1?`${Math.floor(hours*60)}m`:`${Math.floor(hours)}h`} ago`;
 }
 if(job.posted_precision==='day'&&/^(?:posted\s+)?today$/i.test((job.posted_label||'').trim())&&Number.isFinite(Date.parse(job.last_seen_at))&&Date.parse(job.last_seen_at)<=now){
  return currentPosting(job,now)?'Employer reports posted today · time unknown':`Employer reported “today” on ${new Date(job.last_seen_at).toLocaleDateString('en-IN',{timeZone:'Asia/Kolkata',day:'numeric',month:'short',year:'numeric'})}`;
 }
 return 'Posting time unknown';
}

/** Presentation only: timestamps retain their original instant, displayed in IST. */
export function formatIstTimestamp(value:string|number) {
 const date=new Date(value);
 return Number.isFinite(date.getTime())?date.toLocaleString('en-IN',{timeZone:'Asia/Kolkata',day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:true})+' IST':'Time unknown';
}
export function istDateKey(value=Date.now()) {return new Date(value).toLocaleDateString('en-CA',{timeZone:'Asia/Kolkata'});}
