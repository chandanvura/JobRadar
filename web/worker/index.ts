import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env { ASSETS: Fetcher; DB: D1Database; JOBRADAR_INGEST_SECRET?: string; IMAGES: { input(stream: ReadableStream): { transform(options: Record<string, unknown>): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } } } }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }
type RecordValue = Record<string, unknown>;

const MAX_BODY_BYTES=6_000_000;
const SECURITY_HEADERS={"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000; includeSubDomains"};
const json=(body:unknown,status=200,extra:Record<string,string>={})=>Response.json(body,{status,headers:{"Cache-Control":"no-store",...SECURITY_HEADERS,...extra}});
const textValue=(value:unknown,fallback="")=>typeof value==="string"?value.trim():fallback;
const numberValue=(value:unknown,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const nullableNumber=(value:unknown)=>value===null||value===undefined||value===""?null:numberValue(value);
const nullableText=(value:unknown)=>typeof value==="string"&&value.trim()?value.trim():null;
const safeUrl=(value:unknown)=>{try{const url=new URL(String(value));return url.protocol==="https:"?url.toString():null}catch{return null}};
const authorized=(request:Request,env:Env)=>Boolean(env.JOBRADAR_INGEST_SECRET&&request.headers.get("Authorization")===`Bearer ${env.JOBRADAR_INGEST_SECRET}`);

async function dashboard(env:Env){
  const [jobResult,companyResult,runResult,notificationResult]=await Promise.all([
    env.DB.prepare("SELECT id,external_job_id,title,company,location,normalized_location,experience_min,experience_max,experience_label,skills,ats_provider,application_url,career_page_url,posted_at,posted_label,posted_precision,reported_age_hours,first_seen_at,last_seen_at,relevance_score,role_category,hiring_signal,application_status,is_active,is_eligible,eligibility_reason FROM jobs WHERE is_active=1 ORDER BY is_eligible DESC,COALESCE(posted_at,first_seen_at) DESC,relevance_score DESC LIMIT 1000").all(),
    env.DB.prepare("SELECT name,careers_url,ats_provider,last_checked_at,last_success_at,error_count,jobs_found,candidate_jobs,eligible_jobs,warning FROM companies WHERE enabled=1 ORDER BY priority DESC,name LIMIT 500").all(),
    env.DB.prepare("SELECT * FROM scraper_runs ORDER BY id DESC LIMIT 24").all(),
    env.DB.prepare("SELECT n.id,n.channel,n.status,n.sent_at,n.error,j.title,j.company FROM notifications n JOIN jobs j ON j.id=n.job_id ORDER BY n.id DESC LIMIT 50").all(),
  ]);
  const runs=runResult.results;const latest=runs[0]||null;
  return json({jobs:jobResult.results,companies:companyResult.results,latest_run:latest,runs,notifications:notificationResult.results,configured:Boolean(env.JOBRADAR_INGEST_SECRET),server_time:new Date().toISOString(),policy:{cities:["Bengaluru","Hyderabad"],max_age_hours:24,max_experience_years:3,skills_required:false}});
}

async function ingest(request:Request,env:Env){
  if(!authorized(request,env))return json({error:"Unauthorized"},401,{"WWW-Authenticate":"Bearer"});
  if(numberValue(request.headers.get("Content-Length"))>MAX_BODY_BYTES)return json({error:"Payload too large"},413);
  let payload:{jobs?:RecordValue[];companies?:RecordValue[];run?:RecordValue};try{payload=await request.json() as typeof payload}catch{return json({error:"Invalid JSON"},400)}
  const incoming=Array.isArray(payload.jobs)?payload.jobs.slice(0,2000):[];const companyUpdates=Array.isArray(payload.companies)?payload.companies.slice(0,1000):[];const errors:string[]=[];const validJobs:RecordValue[]=[];
  for(const j of incoming){const ats=textValue(j.ats_provider),external=textValue(j.external_job_id),title=textValue(j.title),company=textValue(j.company);if(!ats||!external||!title||!company||!safeUrl(j.application_url)||!safeUrl(j.career_page_url)||!safeUrl(j.job_url)){errors.push(`${company||"unknown"}/${external||"missing-id"}: invalid required field`);continue}validJobs.push(j)}
  const existence=validJobs.length?await env.DB.batch(validJobs.map(j=>env.DB.prepare("SELECT id FROM jobs WHERE ats_provider=? AND external_job_id=?").bind(textValue(j.ats_provider),textValue(j.external_job_id)))):[];
  const newExternalIds=validJobs.filter((_,i)=>!existence[i]?.results?.length).map(j=>textValue(j.external_job_id));
  const statements=[env.DB.prepare("UPDATE companies SET enabled=0,updated_at=CURRENT_TIMESTAMP")];
  const successfulNames=new Set<string>();
  for(const c of companyUpdates){const provider=textValue(c.ats_provider),identifier=textValue(c.ats_identifier),name=textValue(c.name),warning=textValue(c.warning);if(!provider||!identifier||!name)continue;if(numberValue(c.error_count)===0&&!warning.startsWith("Limited coverage"))successfulNames.add(name);statements.push(env.DB.prepare(`INSERT INTO companies (name,careers_url,ats_provider,ats_identifier,priority,enabled,last_checked_at,last_success_at,error_count,jobs_found,candidate_jobs,eligible_jobs,warning,last_job_found_at) VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,CASE WHEN ?>0 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT(ats_provider,ats_identifier) DO UPDATE SET name=excluded.name,careers_url=excluded.careers_url,priority=excluded.priority,enabled=1,last_checked_at=excluded.last_checked_at,last_success_at=COALESCE(excluded.last_success_at,companies.last_success_at),error_count=excluded.error_count,jobs_found=excluded.jobs_found,candidate_jobs=excluded.candidate_jobs,eligible_jobs=excluded.eligible_jobs,warning=excluded.warning,last_job_found_at=CASE WHEN excluded.jobs_found>0 THEN CURRENT_TIMESTAMP ELSE companies.last_job_found_at END,updated_at=CURRENT_TIMESTAMP`).bind(name,safeUrl(c.careers_url)||"https://invalid.local/",provider,identifier,numberValue(c.priority,3),nullableText(c.last_checked_at),nullableText(c.last_success_at),numberValue(c.error_count),numberValue(c.jobs_found),numberValue(c.candidate_jobs),numberValue(c.eligible_jobs),nullableText(c.warning),numberValue(c.jobs_found)))}
  for(const name of successfulNames)statements.push(env.DB.prepare("UPDATE jobs SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE company=? AND is_active=1").bind(name));
  for(const j of validJobs){const ats=textValue(j.ats_provider),external=textValue(j.external_job_id),applicationUrl=safeUrl(j.application_url)!,careerUrl=safeUrl(j.career_page_url)!,jobUrl=safeUrl(j.job_url)!;statements.push(env.DB.prepare(`INSERT INTO jobs (external_job_id,company,title,normalized_title,role_category,location,normalized_location,city,experience_min,experience_max,experience_label,description,skills,ats_provider,source,job_url,application_url,career_page_url,posted_at,posted_label,posted_precision,reported_age_hours,first_seen_at,last_seen_at,is_active,is_eligible,eligibility_reason,relevance_score,freshness_score,priority_score,hiring_signal,application_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?, 'New') ON CONFLICT(ats_provider,external_job_id) DO UPDATE SET title=excluded.title,normalized_title=excluded.normalized_title,role_category=excluded.role_category,location=excluded.location,normalized_location=excluded.normalized_location,city=excluded.city,experience_min=excluded.experience_min,experience_max=excluded.experience_max,experience_label=excluded.experience_label,description=excluded.description,skills=excluded.skills,job_url=excluded.job_url,application_url=excluded.application_url,career_page_url=excluded.career_page_url,posted_at=COALESCE(jobs.posted_at,excluded.posted_at),posted_label=excluded.posted_label,posted_precision=excluded.posted_precision,reported_age_hours=excluded.reported_age_hours,last_seen_at=excluded.last_seen_at,is_active=1,is_eligible=excluded.is_eligible,eligibility_reason=excluded.eligibility_reason,relevance_score=excluded.relevance_score,freshness_score=excluded.freshness_score,priority_score=excluded.priority_score,hiring_signal=excluded.hiring_signal,updated_at=CURRENT_TIMESTAMP`).bind(external,textValue(j.company),textValue(j.title),textValue(j.normalized_title),textValue(j.role_category,"Other"),textValue(j.location,"Not specified"),textValue(j.normalized_location,"Not specified"),nullableText(j.city),nullableNumber(j.experience_min),nullableNumber(j.experience_max),textValue(j.experience_label,"Unknown"),textValue(j.description).slice(0,20000),JSON.stringify(Array.isArray(j.skills)?j.skills:[]),ats,textValue(j.source,"company_career"),jobUrl,applicationUrl,careerUrl,nullableText(j.posted_at),nullableText(j.posted_label),textValue(j.posted_precision,"unknown"),nullableNumber(j.reported_age_hours),textValue(j.first_seen_at,new Date().toISOString()),textValue(j.last_seen_at,new Date().toISOString()),numberValue(j.is_eligible),textValue(j.eligibility_reason,"Not evaluated"),numberValue(j.relevance_score),numberValue(j.freshness_score),numberValue(j.priority_score),nullableText(j.hiring_signal)))}
  const run=payload.run||{};statements.push(env.DB.prepare("INSERT INTO scraper_runs (started_at,finished_at,companies_checked,companies_successful,companies_failed,companies_empty,jobs_scanned,candidate_jobs,new_jobs,matching_jobs,notifications_sent,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(textValue(run.started_at,new Date().toISOString()),textValue(run.finished_at,new Date().toISOString()),numberValue(run.companies_checked),numberValue(run.companies_successful),numberValue(run.companies_failed),numberValue(run.companies_empty),numberValue(run.jobs_scanned),numberValue(run.candidate_jobs,validJobs.length),newExternalIds.length,numberValue(run.matching_jobs),numberValue(run.notifications_sent),errors.length?"partial":textValue(run.status,"success")));
  await env.DB.batch(statements);
  const eligibleIncoming=validJobs.filter(j=>Boolean(j.is_eligible));
  const notificationChecks=eligibleIncoming.length?await env.DB.batch(eligibleIncoming.map(j=>env.DB.prepare("SELECT n.status FROM jobs j LEFT JOIN notifications n ON n.job_id=j.id AND n.channel='telegram' WHERE j.ats_provider=? AND j.external_job_id=?").bind(textValue(j.ats_provider),textValue(j.external_job_id)))):[];
  const notificationKeys=eligibleIncoming.filter((_,i)=>{const status=notificationChecks[i]?.results?.[0]?.status;return status!=="sent"}).map(j=>`${textValue(j.ats_provider)}:${textValue(j.external_job_id)}`);
  return json({accepted:validJobs.length,rejected:errors.length,errors:errors.slice(0,20),new_external_ids:newExternalIds,notification_keys:notificationKeys});
}

async function updateStatus(){
  return json({error:"Personal tracking is stored privately in this browser"},410);
}

async function recordNotification(request:Request,env:Env){
  if(!authorized(request,env))return json({error:"Unauthorized"},401);let body:{ats_provider?:string;external_job_id?:string;status?:string;error?:string};try{body=await request.json() as typeof body}catch{return json({error:"Invalid JSON"},400)}
  const provider=textValue(body.ats_provider),external=textValue(body.external_job_id),status=textValue(body.status);if(!provider||!external||!["sent","failed"].includes(status))return json({error:"Invalid notification record"},400);const job=await env.DB.prepare("SELECT id FROM jobs WHERE ats_provider=? AND external_job_id=?").bind(provider,external).first<{id:number}>();if(!job)return json({error:"Job not found"},404);
  await env.DB.prepare("INSERT INTO notifications (job_id,channel,status,error) VALUES (?,'telegram',?,?) ON CONFLICT(job_id,channel) DO UPDATE SET status=excluded.status,error=excluded.error,sent_at=CURRENT_TIMESTAMP").bind(job.id,status,nullableText(body.error)?.slice(0,300)||null).run();if(status==="sent")await env.DB.prepare("UPDATE scraper_runs SET notifications_sent=notifications_sent+1 WHERE id=(SELECT MAX(id) FROM scraper_runs)").run();return json({ok:true});
}

async function health(env:Env){const run=await env.DB.prepare("SELECT finished_at,status,companies_checked,companies_successful,companies_failed,companies_empty,jobs_scanned,candidate_jobs FROM scraper_runs ORDER BY id DESC LIMIT 1").first<RecordValue>();const age=run?.finished_at?(Date.now()-Date.parse(String(run.finished_at)))/3600000:null;const ok=Boolean(env.DB)&&Boolean(env.JOBRADAR_INGEST_SECRET)&&age!==null&&age<1.5&&numberValue(run?.companies_failed)===0;return json({ok,database:Boolean(env.DB),ingestion_configured:Boolean(env.JOBRADAR_INGEST_SECRET),latest_run:run,run_age_hours:age,stale:age===null||age>=1.5},ok?200:503)}

const worker={async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url);
  if(["/favicon.ico","/apple-touch-icon.png","/apple-touch-icon-precomposed.png"].includes(url.pathname)){
    const asset=await env.ASSETS.fetch(new Request(new URL("/favicon.svg",request.url),request));
    const headers=new Headers(asset.headers);headers.set("Cache-Control","public, max-age=86400");
    return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
  }
  try{
    if(url.pathname==="/api/health"&&request.method==="GET")return health(env);
    if(url.pathname==="/api/dashboard"&&request.method==="GET")return dashboard(env);
    if(url.pathname==="/api/jobs"&&request.method==="GET"){const result=await env.DB.prepare("SELECT * FROM jobs WHERE is_active=1 ORDER BY COALESCE(posted_at,first_seen_at) DESC,relevance_score DESC LIMIT 500").all();return json({jobs:result.results})}
    if(url.pathname==="/api/ingest"&&request.method==="POST")return ingest(request,env);
    if(url.pathname==="/api/notifications"&&request.method==="POST")return recordNotification(request,env);
    const statusMatch=url.pathname.match(/^\/api\/jobs\/(\d+)\/status$/);if(statusMatch&&request.method==="PATCH")return updateStatus(request,env,statusMatch[1]);
  }catch(error){console.error("JobRadar API error",error);return json({error:"JobRadar API request failed"},500)}
  if(url.pathname.startsWith("/api/"))return json({error:"Not found"},404);
  if(url.pathname==="/_vinext/image"){const allowedWidths=[...DEFAULT_DEVICE_SIZES,...DEFAULT_IMAGE_SIZES];return handleImageOptimization(request,{fetchAsset:(path)=>env.ASSETS.fetch(new Request(new URL(path,request.url))),transformImage:async(body,{width,format,quality})=>(await env.IMAGES.input(body).transform(width>0?{width}:{}).output({format,quality})).response()},allowedWidths)}
  const response=await handler.fetch(request,env,ctx);const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};
export default worker;
