interface Env { GITHUB_DISPATCH_TOKEN?: string }
type Run = {id:number; status:string; conclusion:string|null; updated_at:string};

const API="https://api.github.com/repos/chandanvura/JobRadar";
const HEALTH="https://jobradar.chandanvura.workers.dev/api/health";
const ACTIVE=new Set(["queued","in_progress","pending","requested","waiting"]);

export function needsScan(finished:string|null,runs:Run[],now=Date.now()){
  if(runs.some(run=>ACTIVE.has(run.status)))return false;
  const age=finished?now-Date.parse(finished):Infinity;
  return !Number.isFinite(age)||age>=300*60_000;
}

async function github(path:string,token:string,body?:unknown,method?:string){
  const response=await fetch(`${API}${path}`,{
    method:method||(body===undefined?"GET":"POST"),
    headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,
      "User-Agent":"JobRadar-recovery-scheduler",
      "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body),
    signal:AbortSignal.timeout(10_000),
  });
  if(!response.ok)throw new Error(`GitHub API returned HTTP ${response.status}`);
  return response.status===204?null:response.json();
}

async function latestCompletedScan(runs:Run[],token:string):Promise<string|null>{
  for(const run of runs){
    if(run.conclusion!=="success")continue;
    const data=await github(`/actions/runs/${run.id}/jobs?per_page=30`,token) as {jobs:{name:string;conclusion:string;completed_at:string|null}[]};
    const finalizer=data.jobs.find(job=>job.name==="finalize"&&job.conclusion==="success");
    if(finalizer)return finalizer.completed_at;
  }
  return null;
}

export async function checkAndRecover(env:Env){
  if(!env.GITHUB_DISPATCH_TOKEN){console.log("External scheduler awaits GITHUB_DISPATCH_TOKEN");return "unconfigured"}
  const token=env.GITHUB_DISPATCH_TOKEN;
  const workflow=await github("/actions/workflows/scrape.yml",token) as {state:string};
  if(workflow.state==="disabled_inactivity"){
    await github("/actions/workflows/scrape.yml/enable",token,undefined,"PUT");
    console.log("Re-enabled scan workflow disabled for inactivity");
  }else if(workflow.state!=="active"){
    console.log(`Scan workflow state: ${workflow.state}`);
    return "disabled";
  }
  const data=await github("/actions/workflows/scrape.yml/runs?per_page=30",token) as {workflow_runs:Run[]};
  const runs=data.workflow_runs;
  if(runs.some(run=>ACTIVE.has(run.status))){console.log("Scan already active");return "active"}
  let finished:string|null=null;
  try{
    const response=await fetch(HEALTH,{signal:AbortSignal.timeout(10_000)});
    // A 503 means production is intentionally unavailable/degraded (including
    // D1 free-tier exhaustion). Never turn that condition into a recovery
    // dispatch loop: the scan cannot ingest successfully while the API is 503.
    if(response.status===503){
      console.log("Production health is 503; suppress recovery scan until service recovers/reset completes");
      await response.body?.cancel();
      return "degraded";
    }
    if(!response.ok)throw new Error(`Health returned HTTP ${response.status}`);
    const health=await response.json() as {latest_run?:{finished_at?:string};quota_exhausted?:boolean};
    if(health.quota_exhausted){console.log("D1 daily quota exhausted; recovery waits for reset");return "quota"}
    finished=health.latest_run?.finished_at||null;
  }catch{
    console.log("Production health unavailable; using GitHub finalizer history");
    finished=await latestCompletedScan(runs,token);
  }
  if(!needsScan(finished,runs)){console.log("Scan is fresh");return "fresh"}
  await github("/actions/workflows/scrape.yml/dispatches",token,{ref:"main"});
  console.log("Dispatched recovery scan");
  return "dispatched";
}

export async function restoreInactiveSchedules(env:Env){
  if(!env.GITHUB_DISPATCH_TOKEN)return 0;
  const allowed=new Set(["deploy-cloudflare.yml","backup-d1.yml","watchdog.yml","monthly-maintenance.yml","telegram-digest.yml"]);
  const result=await github("/actions/workflows?per_page=100",env.GITHUB_DISPATCH_TOKEN) as {workflows:{path:string;state:string}[]};
  let restored=0;
  for(const workflow of result.workflows){
    const name=workflow.path.split("/").pop()||"";
    if(allowed.has(name) && workflow.state==="disabled_inactivity"){
      await github(`/actions/workflows/${name}/enable`,env.GITHUB_DISPATCH_TOKEN,undefined,"PUT");
      restored++;console.log(`Restored inactive operational schedule: ${name}`);
    }
  }
  return restored;
}

export async function probeAvailability(){
  const started=Date.now();const statuses:number[]=[];
  for(const path of ["/","/api/dashboard?source=backup"]){
    try{
      const response=await fetch(`https://jobradar.chandanvura.workers.dev${path}`,{signal:AbortSignal.timeout(10_000),cache:"no-store"});
      const validType=response.headers.get("Content-Type")?.includes(path==="/"?"text/html":"application/json");
      statuses.push(response.status===200 && validType?200:response.status===200?502:response.status);
      await response.body?.cancel();
    }catch{statuses.push(0);}
  }
  const result={event:"availability",checked_at:new Date().toISOString(),ok:statuses.every(status=>status===200),root_status:statuses[0],backup_api_status:statuses[1],duration_ms:Date.now()-started};
  console.log(JSON.stringify(result));
  return result;
}

const worker = {
  fetch(){return new Response("Not found",{status:404})},
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){
    ctx.waitUntil(Promise.all([checkAndRecover(env),probeAvailability(),restoreInactiveSchedules(env)]));
  },
};
export default worker;
