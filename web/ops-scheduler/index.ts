interface Env { GITHUB_DISPATCH_TOKEN?: string }
type Run = {id:number; status:string; conclusion:string|null; updated_at:string};

const API="https://api.github.com/repos/chandanvura/JobRadar";
const HEALTH="https://jobradar.chandanvura.workers.dev/api/health";
const ACTIVE=new Set(["queued","in_progress","pending","requested","waiting"]);

export function needsScan(finished:string|null,runs:Run[],now=Date.now()){
  if(runs.some(run=>ACTIVE.has(run.status)))return false;
  const age=finished?now-Date.parse(finished):Infinity;
  return !Number.isFinite(age)||age>=75*60_000;
}

async function github(path:string,token:string,body?:unknown,method?:string){
  const response=await fetch(`${API}${path}`,{
    method:method||(body===undefined?"GET":"POST"),
    headers:{"Accept":"application/vnd.github+json","Authorization":`Bearer ${token}`,
      "X-GitHub-Api-Version":"2022-11-28","Content-Type":"application/json"},
    body:body===undefined?undefined:JSON.stringify(body),
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
    if(!response.ok&&response.status!==503)throw new Error(`Health returned HTTP ${response.status}`);
    const health=await response.json() as {latest_run?:{finished_at?:string}};
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

export default {
  fetch(){return new Response("Not found",{status:404})},
  async scheduled(_controller:ScheduledController,env:Env,ctx:ExecutionContext){
    ctx.waitUntil(checkAndRecover(env));
  },
};
