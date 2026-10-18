type Posting={posted_label?:string|null;reported_age_hours:number|null;posted_at:string|null;last_seen_at:string;posted_precision:string};
export function postingAge(job:Posting,now=Date.now()){
 const age=(date:string|null)=>{if(!date)return null;const value=(now-Date.parse(date))/3600000;return Number.isFinite(value)&&value>=0?value:null};
 if(job.reported_age_hours!==null){const elapsed=age(job.last_seen_at);return elapsed===null?null:Math.max(0,job.reported_age_hours)+elapsed;}
 return age(job.posted_at);
}
export function currentPosting(job:Posting,now=Date.now()){
 const age=postingAge(job,now);if(age!==null)return age<=24;
 // An employer's “today” label is valid only on the day it was observed in India.
 const observed=Date.parse(job.last_seen_at);
 // India uses a fixed UTC+05:30 day boundary. Avoid constructing an Intl
 // formatter twice for every unknown-date listing on each view change.
 const day=(time:number)=>Math.floor((time+19_800_000)/86_400_000);
 return /\btoday\b/i.test(job.posted_label||'')&&Number.isFinite(observed)&&observed<=now&&day(observed)===day(now);
}
