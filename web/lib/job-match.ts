export type MatchJob={title:string;role_category:string;skills:string;experience_min:number|null;experience_max:number|null;is_eligible:number;relevance_score:number;posted_at:string|null;posted_label:string|null;reported_age_hours:number|null};
export type MatchPreferences={titles:string[];skills:string[];experienceMin:number;experienceMax:number};
export type LearningRecord={saved?:boolean;status?:string;job:MatchJob};
const stop=new Set(["engineer","engineering","developer","software","the","and","for"]);
const words=(value:string)=>value.toLowerCase().replace(/[^a-z0-9+#]+/g," ").split(/\s+/).filter(x=>x.length>1&&!stop.has(x));
const parsedSkills=(value:string)=>{try{const v=JSON.parse(value);return Array.isArray(v)?v.map(String):[]}catch{return[]}};
const overlap=(a:string[],b:string[])=>a.filter(x=>b.some(y=>y===x||y.includes(x)||x.includes(y)));
export const experienceCompatible=(job:MatchJob,p:MatchPreferences)=>job.experience_min===null&&job.experience_max===null?null:(job.experience_min??0)<=p.experienceMax&&(job.experience_max??job.experience_min??0)>=p.experienceMin;
export function personalMatch(job:MatchJob,p:MatchPreferences){
 const title=job.title.toLowerCase(),titleHits=overlap(words(p.titles.join(" ")),words(job.title));
 const exactTitle=p.titles.some(x=>title.includes(x.toLowerCase())),jobSkills=parsedSkills(job.skills).map(x=>x.toLowerCase());
 const skillHits=p.skills.filter(x=>jobSkills.some(y=>y.includes(x.toLowerCase())||x.toLowerCase().includes(y))),exp=experienceCompatible(job,p),reasons:string[]=[];
 let score=Math.min(35,Math.round(job.relevance_score*.35));
 if(job.is_eligible){score+=18;reasons.push("verified 24h + experience")}
 if(exactTitle){score+=24;reasons.push("preferred title")}else if(titleHits.length){score+=Math.min(18,titleHits.length*6);reasons.push(`${titleHits.length} title term${titleHits.length===1?"":"s"}`)}else if(!p.titles.length){score+=12;reasons.push("target role")}
 if(skillHits.length){score+=Math.min(20,skillHits.length*5);reasons.push(`${skillHits.length} skill match${skillHits.length===1?"":"es"}`)}
 if(exp===true){score+=18;reasons.push("experience overlaps")}else if(exp===null){score+=5;reasons.push("experience to verify")}else{score-=35;reasons.push("experience outside preference")}
 return {score:Math.max(0,Math.min(100,score)),reasons,titleMatch:exactTitle||titleHits.length>0,skillMatch:skillHits.length>0,experienceMatch:exp};
}

// Private, deterministic learning: positive actions lift similar roles while
// Ignored jobs gently lower them. Nothing leaves this browser.
export function feedbackBoost(job:MatchJob,history:LearningRecord[]){
 let boost=0;
 const targetWords=words(job.title),targetSkills=parsedSkills(job.skills).map(x=>x.toLowerCase());
 for(const record of history){
  const positive=record.saved||["Applied","Interview","Offer"].includes(record.status||"");
  const negative=record.status==="Ignored";
  if(!positive&&!negative)continue;
  const direction=positive?1:-1,similarRole=record.job.role_category===job.role_category;
  const titleOverlap=overlap(targetWords,words(record.job.title)).length;
  const skillOverlap=overlap(targetSkills,parsedSkills(record.job.skills).map(x=>x.toLowerCase())).length;
  boost+=direction*((similarRole?4:0)+Math.min(4,titleOverlap)+Math.min(3,skillOverlap));
 }
 return Math.max(-20,Math.min(20,boost));
}
