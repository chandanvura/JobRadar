import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { safeUrl } from "./urls";
import { jobDelta, JOB_INSERT_COLUMNS } from "./job-delta";
import { publicRead } from "./public-backup";
import { apiFailure, quotaExceeded } from "./api-failure";

interface Env { ASSETS: Fetcher; DB: D1Database; JOBRADAR_INGEST_SECRET?: string; IMAGES: { input(stream: ReadableStream): { transform(options: Record<string, unknown>): { output(options: { format: string; quality: number }): Promise<{ response(): Response }> } } } }
interface ExecutionContext { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void }
type RecordValue = Record<string, unknown>;

const MAX_BODY_BYTES=6_000_000;
const SECURITY_HEADERS={"X-Content-Type-Options":"nosniff","X-Frame-Options":"DENY","Referrer-Policy":"strict-origin-when-cross-origin","Permissions-Policy":"camera=(), microphone=(), geolocation=()","Strict-Transport-Security":"max-age=31536000; includeSubDomains","Cross-Origin-Opener-Policy":"same-origin","Cross-Origin-Resource-Policy":"same-origin","X-Permitted-Cross-Domain-Policies":"none","Content-Security-Policy":"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'"};
const PUBLIC_JOB_COLUMNS="id,external_job_id,description,title,company,location,normalized_location,employment_type,experience_min,experience_max,experience_label,skills,ats_provider,application_url,career_page_url,posted_at,posted_label,posted_precision,reported_age_hours,first_seen_at,last_seen_at,relevance_score,role_category,hiring_signal,application_status,is_active,is_eligible,eligibility_reason";
const json=(body:unknown,status=200,extra:Record<string,string>={})=>Response.json(body,{status,headers:{"Cache-Control":"no-store",...SECURITY_HEADERS,...extra}});
const textValue=(value:unknown,fallback="")=>typeof value==="string"?value.trim():fallback;
const numberValue=(value:unknown,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const nullableNumber=(value:unknown)=>value===null||value===undefined||value===""?null:numberValue(value);
const nullableText=(value:unknown)=>typeof value==="string"&&value.trim()?value.trim():null;
const authorized=(request:Request,env:Env)=>Boolean(env.JOBRADAR_INGEST_SECRET&&request.headers.get("Authorization")===`Bearer ${env.JOBRADAR_INGEST_SECRET}`);
const companyQuality=(company:RecordValue)=>[
  numberValue(company.error_count)===0?1:0,
  numberValue(company.jobs_found),
  numberValue(company.candidate_jobs),
  Date.parse(textValue(company.last_checked_at))||0,
];
const dedupeCompanies=(companies:RecordValue[])=>{
  const selected=new Map<string,RecordValue>();
  for(const company of companies){
    const key=textValue(company.name).toLocaleLowerCase();if(!key)continue;
    const current=selected.get(key);if(!current){selected.set(key,company);continue}
    const nextScore=companyQuality(company),currentScore=companyQuality(current);
    if(nextScore.some((value,index)=>value!==currentScore[index]&&value>currentScore[index]&&nextScore.slice(0,index).every((prior,i)=>prior===currentScore[i])))selected.set(key,company);
  }
  return [...selected.values()];
};

async function dashboard(env:Env){
  const [jobResult,companyResult,runResult,notificationResult]=await Promise.all([
    env.DB.prepare(`SELECT ${PUBLIC_JOB_COLUMNS} FROM jobs WHERE is_active=1 AND city IN ('Bengaluru','Hyderabad') ORDER BY CASE WHEN is_eligible=1 THEN 0 WHEN eligibility_reason IN ('Experience not stated — verify','Posting date not verified within 24 hours') THEN 1 ELSE 2 END,COALESCE(posted_at,first_seen_at) DESC,relevance_score DESC LIMIT 100`).all(),
    env.DB.prepare("SELECT name,careers_url,ats_provider,last_checked_at,last_success_at,error_count,jobs_found,candidate_jobs,eligible_jobs,warning FROM companies WHERE enabled=1 ORDER BY priority DESC,name").all(),
    env.DB.prepare("SELECT * FROM scraper_runs ORDER BY id DESC LIMIT 24").all(),
    env.DB.prepare("SELECT n.id,n.channel,n.status,n.sent_at,NULL AS error,j.title,j.company FROM notifications n JOIN jobs j ON j.id=n.job_id ORDER BY n.id DESC LIMIT 50").all(),
  ]);
  const runs=runResult.results;const latest=runs[0]||null;
  return json({jobs:jobResult.results,companies:dedupeCompanies(companyResult.results as RecordValue[]),latest_run:latest,runs,notifications:notificationResult.results,configured:Boolean(env.JOBRADAR_INGEST_SECRET),server_time:new Date().toISOString(),policy:{cities:["Bengaluru","Hyderabad"],max_age_hours:24,max_experience_years:3,skills_required:false}});
}

async function ingest(request:Request,env:Env){
  if(!authorized(request,env))return json({error:"Unauthorized"},401,{"WWW-Authenticate":"Bearer"});
  if(numberValue(request.headers.get("Content-Length"))>MAX_BODY_BYTES)return json({error:"Payload too large"},413);
  let payload:{jobs?:RecordValue[];companies?:RecordValue[];run?:RecordValue};try{payload=await request.json() as typeof payload}catch{return json({error:"Invalid JSON"},400)}
  if(!payload || typeof payload!=="object" || Array.isArray(payload) || (payload.jobs!==undefined && !Array.isArray(payload.jobs)) || (payload.companies!==undefined && !Array.isArray(payload.companies)) || (payload.run!==undefined && (!payload.run || typeof payload.run!=="object" || Array.isArray(payload.run))))return json({error:"Invalid ingestion payload"},400);
  if((payload.jobs?.length||0)>2000 || (payload.companies?.length||0)>1000 || (Array.isArray(payload.run?.seen_job_keys) && payload.run.seen_job_keys.length>50000))return json({error:"Ingestion payload exceeds supported limits"},413);
  if(payload.jobs?.some(job=>!job || typeof job!=="object" || Array.isArray(job)) || payload.companies?.some(company=>!company || typeof company!=="object" || Array.isArray(company)))return json({error:"Invalid ingestion record"},400);
  // A missing manifest is not an authoritative empty scan. Reject before any writes.
  if(payload.run){
    const {successful_companies:companies,seen_job_keys:keys}=payload.run;
    if(!Array.isArray(companies)||!Array.isArray(keys)||companies.some(value=>typeof value!=="string"||!value.trim())||keys.some(value=>typeof value!=="string"||!value.trim()))return json({error:"Finalization requires explicit company and job manifests"},400);
    if(companies.length>1000)return json({error:"Finalization company manifest exceeds supported limits"},413);
  }
  const incoming=Array.isArray(payload.jobs)?payload.jobs:[];const companyUpdates=Array.isArray(payload.companies)?payload.companies:[];const errors:string[]=[];const validJobs:RecordValue[]=[];
  for(const j of incoming){const ats=textValue(j.ats_provider),external=textValue(j.external_job_id),title=textValue(j.title),company=textValue(j.company);if(!ats||!external||!title||!company||!safeUrl(j.application_url)||!safeUrl(j.career_page_url)||!safeUrl(j.job_url)){errors.push(`${company||"unknown"}/${external||"missing-id"}: invalid required field`);continue}validJobs.push(j)}
  if(payload.run&&errors.length)return json({error:"Rejected jobs prevent scan finalization",rejected:errors.length,errors:errors.slice(0,20)},400);
  const existence=validJobs.length?await env.DB.batch(validJobs.map(j=>env.DB.prepare("SELECT id,is_active,external_job_id,company,title,normalized_title,role_category,location,normalized_location,city,employment_type,experience_min,experience_max,experience_label,description,skills,ats_provider,source,job_url,application_url,career_page_url,posted_at,posted_label,posted_precision,reported_age_hours,first_seen_at,last_seen_at,is_eligible,eligibility_reason,relevance_score,freshness_score,priority_score,hiring_signal FROM jobs WHERE company=? COLLATE NOCASE AND ats_provider=? AND external_job_id=?").bind(textValue(j.company),textValue(j.ats_provider),textValue(j.external_job_id)))):[];
  const newJobs=validJobs.filter((_,i)=>!existence[i]?.results?.length);
  const newExternalIds=newJobs.map(j=>textValue(j.external_job_id));
  const newJobKeys=newJobs.map(j=>`${textValue(j.company)}\u001f${textValue(j.ats_provider)}\u001f${textValue(j.external_job_id)}`);
  const statements=[];
  const companyExistence=companyUpdates.length?await env.DB.batch(companyUpdates.map(c=>env.DB.prepare("SELECT * FROM companies WHERE name=? COLLATE NOCASE OR (ats_provider=? AND ats_identifier=?)").bind(textValue(c.name),textValue(c.ats_provider),textValue(c.ats_identifier)))):[];
  for(const [companyIndex,c] of companyUpdates.entries()){
    const provider=textValue(c.ats_provider),identifier=textValue(c.ats_identifier),name=textValue(c.name),warning=textValue(c.warning);if(!provider||!identifier||!name)continue;
    const values=[name,safeUrl(c.careers_url)||"https://invalid.local/",provider,identifier,numberValue(c.priority,3),nullableText(c.last_checked_at),nullableText(c.last_success_at),numberValue(c.error_count),numberValue(c.jobs_found),numberValue(c.candidate_jobs),numberValue(c.eligible_jobs),nullableText(c.warning)];
    const columns='name,careers_url,ats_provider,ats_identifier,priority,last_checked_at,last_success_at,error_count,jobs_found,candidate_jobs,eligible_jobs,warning'.split(',');
    const rows=companyExistence[companyIndex]?.results||[];
    if(rows.length===1){
      const existing=rows[0] as RecordValue;
      const incoming:RecordValue=Object.fromEntries(columns.map((column,index)=>[column,values[index]]));
      incoming.enabled=1;
      incoming.last_success_at=incoming.last_success_at??existing.last_success_at;
      incoming.last_job_found_at=numberValue(c.jobs_found)>0 && (existing.jobs_found===0 || existing.last_job_found_at===null)?new Date().toISOString():existing.last_job_found_at;
      const changed=Object.keys(incoming).filter(column=>incoming[column]!==existing[column]);
      if(changed.length)statements.push(env.DB.prepare(`UPDATE companies SET ${changed.map(column=>`${column}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND (${changed.map(column=>`${column} IS NOT ?`).join(' OR ')})`).bind(...changed.map(column=>incoming[column]),existing.id,...changed.map(column=>incoming[column])));
      continue;
    }
    statements.push(env.DB.prepare(`INSERT INTO companies (name,careers_url,ats_provider,ats_identifier,priority,enabled,last_checked_at,last_success_at,error_count,jobs_found,candidate_jobs,eligible_jobs,warning,last_job_found_at) VALUES (?,?,?,?,?,1,?,?,?,?,?,?,?,CASE WHEN ?>0 THEN CURRENT_TIMESTAMP ELSE NULL END) ON CONFLICT DO UPDATE SET name=excluded.name,careers_url=excluded.careers_url,ats_provider=excluded.ats_provider,ats_identifier=excluded.ats_identifier,priority=excluded.priority,enabled=1,last_checked_at=excluded.last_checked_at,last_success_at=COALESCE(excluded.last_success_at,companies.last_success_at),error_count=excluded.error_count,jobs_found=excluded.jobs_found,candidate_jobs=excluded.candidate_jobs,eligible_jobs=excluded.eligible_jobs,warning=excluded.warning,last_job_found_at=CASE WHEN excluded.jobs_found>0 AND (companies.jobs_found=0 OR companies.last_job_found_at IS NULL) THEN CURRENT_TIMESTAMP ELSE companies.last_job_found_at END,updated_at=CURRENT_TIMESTAMP WHERE companies.name IS NOT excluded.name OR companies.careers_url IS NOT excluded.careers_url OR companies.ats_provider IS NOT excluded.ats_provider OR companies.ats_identifier IS NOT excluded.ats_identifier OR companies.priority IS NOT excluded.priority OR companies.enabled<>1 OR companies.error_count IS NOT excluded.error_count OR companies.jobs_found IS NOT excluded.jobs_found OR companies.candidate_jobs IS NOT excluded.candidate_jobs OR companies.eligible_jobs IS NOT excluded.eligible_jobs OR companies.warning IS NOT excluded.warning OR companies.last_checked_at IS NOT excluded.last_checked_at OR (excluded.last_success_at IS NOT NULL AND companies.last_success_at IS NOT excluded.last_success_at)`).bind(...values,numberValue(c.jobs_found)));
  }
  const activeCompanySources=companyUpdates.map(c=>({name:textValue(c.name).toLocaleLowerCase(),key:`${textValue(c.name).toLocaleLowerCase()}\u001f${textValue(c.ats_provider)}\u001f${textValue(c.ats_identifier)}`})).filter(source=>source.name&&source.key.split("\u001f").every(Boolean));
  if(activeCompanySources.length){const names=[...new Set(activeCompanySources.map(source=>source.name))],keys=[...new Set(activeCompanySources.map(source=>source.key))];statements.push(env.DB.prepare("UPDATE companies SET enabled=0,updated_at=CURRENT_TIMESTAMP WHERE enabled=1 AND lower(name) IN (SELECT value FROM json_each(?)) AND (lower(name) || char(31) || ats_provider || char(31) || ats_identifier) NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(names),JSON.stringify(keys)))}
  for(const [jobIndex,j] of validJobs.entries()){
    const ats=textValue(j.ats_provider),external=textValue(j.external_job_id),applicationUrl=safeUrl(j.application_url)!,careerUrl=safeUrl(j.career_page_url)!,jobUrl=safeUrl(j.job_url)!;
    const values=[external,textValue(j.company),textValue(j.title),textValue(j.normalized_title),textValue(j.role_category,"Other"),textValue(j.location,"Not specified"),textValue(j.normalized_location,"Not specified"),nullableText(j.city),textValue(j.employment_type,"Full-time"),nullableNumber(j.experience_min),nullableNumber(j.experience_max),textValue(j.experience_label,"Unknown"),textValue(j.description).slice(0,20000),JSON.stringify(Array.isArray(j.skills)?j.skills:[]),ats,textValue(j.source,"company_career"),jobUrl,applicationUrl,careerUrl,nullableText(j.posted_at),nullableText(j.posted_label),textValue(j.posted_precision,"unknown"),nullableNumber(j.reported_age_hours),textValue(j.first_seen_at,new Date().toISOString()),textValue(j.last_seen_at,new Date().toISOString()),numberValue(j.is_eligible),textValue(j.eligibility_reason,"Not evaluated"),numberValue(j.relevance_score),numberValue(j.freshness_score),numberValue(j.priority_score),nullableText(j.hiring_signal)];
    const existing=existence[jobIndex]?.results?.[0] as RecordValue|undefined;
    if(existing){
      const delta=jobDelta(existing,Object.fromEntries(JOB_INSERT_COLUMNS.map((column,index)=>[column,values[index]])));
      const columns=Object.keys(delta);
      if(columns.length)statements.push(env.DB.prepare(`UPDATE jobs SET ${columns.map(column=>`${column}=?`).join(',')},updated_at=CURRENT_TIMESTAMP WHERE id=? AND (${columns.map(column=>`${column} IS NOT ?`).join(' OR ')})`).bind(...Object.values(delta),existing.id,...Object.values(delta)));
      continue;
    }
    // The conflict clause remains for simultaneous first sightings only.
    statements.push(env.DB.prepare(`INSERT INTO jobs (external_job_id,company,title,normalized_title,role_category,location,normalized_location,city,employment_type,experience_min,experience_max,experience_label,description,skills,ats_provider,source,job_url,application_url,career_page_url,posted_at,posted_label,posted_precision,reported_age_hours,first_seen_at,last_seen_at,is_active,is_eligible,eligibility_reason,relevance_score,freshness_score,priority_score,hiring_signal,application_status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?,?,?,?, 'New') ON CONFLICT(company,ats_provider,external_job_id) DO UPDATE SET title=excluded.title,normalized_title=excluded.normalized_title,role_category=excluded.role_category,location=excluded.location,normalized_location=excluded.normalized_location,city=excluded.city,employment_type=excluded.employment_type,experience_min=excluded.experience_min,experience_max=excluded.experience_max,experience_label=excluded.experience_label,description=excluded.description,skills=excluded.skills,job_url=excluded.job_url,application_url=excluded.application_url,career_page_url=excluded.career_page_url,posted_at=COALESCE(jobs.posted_at,excluded.posted_at),posted_label=excluded.posted_label,posted_precision=excluded.posted_precision,reported_age_hours=excluded.reported_age_hours,last_seen_at=excluded.last_seen_at,is_active=1,is_eligible=excluded.is_eligible,eligibility_reason=excluded.eligibility_reason,relevance_score=excluded.relevance_score,freshness_score=excluded.freshness_score,priority_score=excluded.priority_score,hiring_signal=excluded.hiring_signal,updated_at=CURRENT_TIMESTAMP WHERE jobs.title IS NOT excluded.title OR jobs.normalized_title IS NOT excluded.normalized_title OR jobs.role_category IS NOT excluded.role_category OR jobs.location IS NOT excluded.location OR jobs.normalized_location IS NOT excluded.normalized_location OR jobs.city IS NOT excluded.city OR jobs.employment_type IS NOT excluded.employment_type OR jobs.experience_min IS NOT excluded.experience_min OR jobs.experience_max IS NOT excluded.experience_max OR jobs.experience_label IS NOT excluded.experience_label OR jobs.description IS NOT excluded.description OR jobs.skills IS NOT excluded.skills OR jobs.job_url IS NOT excluded.job_url OR jobs.application_url IS NOT excluded.application_url OR jobs.career_page_url IS NOT excluded.career_page_url OR jobs.posted_at IS NOT COALESCE(jobs.posted_at,excluded.posted_at) OR jobs.posted_label IS NOT excluded.posted_label OR jobs.posted_precision IS NOT excluded.posted_precision OR jobs.reported_age_hours IS NOT excluded.reported_age_hours OR jobs.is_active<>1 OR jobs.is_eligible IS NOT excluded.is_eligible OR jobs.eligibility_reason IS NOT excluded.eligibility_reason OR jobs.relevance_score IS NOT excluded.relevance_score OR jobs.freshness_score IS NOT excluded.freshness_score OR jobs.priority_score IS NOT excluded.priority_score OR jobs.hiring_signal IS NOT excluded.hiring_signal`).bind(...values));
  }
  if(payload.run){const run=payload.run,started=textValue(run.started_at,new Date().toISOString()),successfulCompanies=Array.isArray(run.successful_companies)?run.successful_companies.map(value=>textValue(value)).filter(Boolean).slice(0,1000):[],seenJobKeys=Array.isArray(run.seen_job_keys)?run.seen_job_keys.map(value=>textValue(value)).filter(Boolean):[];statements.push(env.DB.prepare("UPDATE jobs SET is_active=0,updated_at=CURRENT_TIMESTAMP WHERE is_active=1 AND company IN (SELECT value FROM json_each(?)) AND (company || char(31) || ats_provider || char(31) || external_job_id) NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(successfulCompanies),JSON.stringify(seenJobKeys)));statements.push(env.DB.prepare("INSERT INTO scraper_runs (started_at,finished_at,companies_checked,companies_successful,companies_failed,companies_empty,jobs_scanned,candidate_jobs,new_jobs,matching_jobs,notifications_sent,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(started_at) DO UPDATE SET finished_at=excluded.finished_at,companies_checked=excluded.companies_checked,companies_successful=excluded.companies_successful,companies_failed=excluded.companies_failed,companies_empty=excluded.companies_empty,jobs_scanned=excluded.jobs_scanned,candidate_jobs=excluded.candidate_jobs,new_jobs=max(scraper_runs.new_jobs,excluded.new_jobs),matching_jobs=excluded.matching_jobs,notifications_sent=max(scraper_runs.notifications_sent,excluded.notifications_sent),status=excluded.status").bind(started,textValue(run.finished_at,new Date().toISOString()),numberValue(run.companies_checked),numberValue(run.companies_successful),numberValue(run.companies_failed),numberValue(run.companies_empty),numberValue(run.jobs_scanned),numberValue(run.candidate_jobs,validJobs.length),numberValue(run.new_jobs,newExternalIds.length),numberValue(run.matching_jobs),numberValue(run.notifications_sent),errors.length?"partial":textValue(run.status,"success")))}
  const writeResults=statements.length?await env.DB.batch(statements):[];
  const d1RowsWritten=writeResults.reduce((total,result)=>total+numberValue(result.meta.rows_written),0);
  const eligibleIncoming=validJobs.filter(j=>Boolean(j.is_eligible));
  const notificationChecks=eligibleIncoming.length?await env.DB.batch(eligibleIncoming.map(j=>env.DB.prepare("SELECT n.status FROM jobs j LEFT JOIN notifications n ON n.job_id=j.id AND n.channel='telegram' WHERE j.company=? COLLATE NOCASE AND j.ats_provider=? AND j.external_job_id=?").bind(textValue(j.company),textValue(j.ats_provider),textValue(j.external_job_id)))):[];
  const notificationKeys=eligibleIncoming.filter((_,i)=>{const status=notificationChecks[i]?.results?.[0]?.status;return status!=="sent"}).map(j=>`${textValue(j.company)}\u001f${textValue(j.ats_provider)}\u001f${textValue(j.external_job_id)}`);
  return json({d1_rows_written:d1RowsWritten,accepted:validJobs.length,rejected:errors.length,errors:errors.slice(0,20),new_external_ids:newExternalIds,new_job_keys:newJobKeys,notification_keys:notificationKeys});
}

async function updateStatus(){
  return json({error:"Personal tracking is stored privately in this browser"},410);
}

async function recordNotification(request:Request,env:Env){
  if(!authorized(request,env))return json({error:"Unauthorized"},401);let body:{company?:string;ats_provider?:string;external_job_id?:string;status?:string;error?:string};try{body=await request.json() as typeof body}catch{return json({error:"Invalid JSON"},400)}
  if(!body || typeof body!=="object" || Array.isArray(body))return json({error:"Invalid notification record"},400);
  const company=textValue(body.company),provider=textValue(body.ats_provider),external=textValue(body.external_job_id),status=textValue(body.status);if(!company||!provider||!external||!["sent","failed"].includes(status))return json({error:"Invalid notification record"},400);const job=await env.DB.prepare("SELECT id FROM jobs WHERE company=? COLLATE NOCASE AND ats_provider=? AND external_job_id=?").bind(company,provider,external).first<{id:number}>();if(!job)return json({error:"Job not found"},404);
  const recorded=await env.DB.prepare("INSERT INTO notifications (job_id,channel,status,error) VALUES (?,'telegram',?,?) ON CONFLICT(job_id,channel) DO UPDATE SET status=excluded.status,error=excluded.error,sent_at=CURRENT_TIMESTAMP WHERE notifications.status IS NOT excluded.status OR notifications.error IS NOT excluded.error").bind(job.id,status,nullableText(body.error)?.slice(0,300)||null).run();if(status==="sent" && recorded.meta.changes>0)await env.DB.prepare("UPDATE scraper_runs SET notifications_sent=notifications_sent+1 WHERE id=(SELECT MAX(id) FROM scraper_runs)").run();return json({ok:true});
}

async function health(env:Env){
  const run=await env.DB.prepare("SELECT started_at,finished_at,status,companies_checked,companies_successful,companies_failed,companies_empty,jobs_scanned,candidate_jobs FROM scraper_runs ORDER BY id DESC LIMIT 1").first<RecordValue>();
  const elapsed=run?.finished_at?(Date.now()-Date.parse(String(run.finished_at)))/3600000:null;
  const age=elapsed!==null&&Number.isFinite(elapsed)?elapsed:null;
  const stale=age===null||age<0||age>=5;
  const pipelineOk=Boolean(env.DB)&&Boolean(env.JOBRADAR_INGEST_SECRET)&&!stale;
  const scanOk=run?.status==="success"&&numberValue(run?.companies_failed)===0;
  const ok=pipelineOk&&scanOk;
  return json({ok,pipeline_ok:pipelineOk,scan_ok:scanOk,database:Boolean(env.DB),ingestion_configured:Boolean(env.JOBRADAR_INGEST_SECRET),latest_run:run,run_age_hours:age,stale},ok?200:503);
}

const worker={async fetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url);
  if(["/favicon.ico","/apple-touch-icon.png","/apple-touch-icon-precomposed.png"].includes(url.pathname)){
    const asset=await env.ASSETS.fetch(new Request(new URL("/favicon.svg",request.url),request));
    const headers=new Headers(asset.headers);headers.set("Cache-Control","public, max-age=86400");
    return new Response(asset.body,{status:asset.status,statusText:asset.statusText,headers});
  }
  try{
    if(url.pathname==="/api/health"&&request.method==="GET")return await health(env);
    if(url.pathname==="/api/dashboard"&&request.method==="GET")return await publicRead(request,env.ASSETS,()=>dashboard(env),SECURITY_HEADERS);
    if(url.pathname==="/api/jobs"&&request.method==="GET"){const raw=url.searchParams.get("after")||"0",after=Number(raw);if(!Number.isSafeInteger(after)||after<0)return json({error:"Invalid cursor"},400);return await publicRead(request,env.ASSETS,async()=>{const result=await env.DB.prepare(`SELECT ${PUBLIC_JOB_COLUMNS} FROM jobs WHERE id IN (SELECT id FROM (SELECT id FROM jobs WHERE is_active=1 AND city='Bengaluru' AND id>? ORDER BY id LIMIT 101) UNION ALL SELECT id FROM (SELECT id FROM jobs WHERE is_active=1 AND city='Hyderabad' AND id>? ORDER BY id LIMIT 101)) ORDER BY id LIMIT 101`).bind(after,after).all();const jobs=result.results.slice(0,100);return json({jobs,next_cursor:result.results.length>100?jobs[jobs.length-1].id:null})},SECURITY_HEADERS)}
    if(url.pathname==="/api/ingest"&&request.method==="POST")return await ingest(request,env);
    if(url.pathname==="/api/notifications"&&request.method==="POST")return await recordNotification(request,env);
    const statusMatch=url.pathname.match(/^\/api\/jobs\/(\d+)\/status$/);if(statusMatch&&request.method==="PATCH")return updateStatus();
  }catch(error){console.error("JobRadar API error",{quota_exhausted:quotaExceeded(error),type:error instanceof Error?error.name:"unknown"});return apiFailure(error,url.pathname,SECURITY_HEADERS)}
  if(url.pathname.startsWith("/api/"))return json({error:"Not found"},404);
  if(url.pathname==="/_vinext/image"){const allowedWidths=[...DEFAULT_DEVICE_SIZES,...DEFAULT_IMAGE_SIZES];return handleImageOptimization(request,{fetchAsset:(path)=>env.ASSETS.fetch(new Request(new URL(path,request.url))),transformImage:async(body,{width,format,quality})=>(await env.IMAGES.input(body).transform(width>0?{width}:{}).output({format,quality})).response()},allowedWidths)}
  const response=await handler.fetch(request,env,ctx);const headers=new Headers(response.headers);for(const [key,value] of Object.entries(SECURITY_HEADERS))headers.set(key,value);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}};
export default worker;
