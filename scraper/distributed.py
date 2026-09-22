"""Distributed scan workers and the single idempotent scan coordinator."""

import argparse,asyncio,dataclasses,hashlib,json,os,sys
from datetime import datetime,timezone
from pathlib import Path

from .adapters import ADAPTERS
from .main import TELEGRAM_RETRY_IDS,TelegramDeliveryError,ensure_telegram_ready,ingest_scan,load_companies,notify,now,record_notification,run_health_status,scrape
from .models import Job

ARTIFACT_VERSION=1

def source_shard(company,count):
    """Assign a source stably so retries and reruns scan the same ownership set."""
    key=f"{company.ats_provider}:{company.ats_identifier}".encode()
    return int.from_bytes(hashlib.sha256(key).digest()[:8],"big")%count

def _atomic_json(path,payload):
    target=Path(path); target.parent.mkdir(parents=True,exist_ok=True)
    temporary=target.with_suffix(target.suffix+".tmp")
    temporary.write_text(json.dumps(payload,separators=(",",":"),ensure_ascii=False),encoding="utf-8")
    temporary.replace(target)

async def run_worker(index,count,output):
    if count<1 or index<0 or index>=count: raise ValueError("Invalid shard index/count")
    started=now()
    enabled=[c for c in load_companies() if c.enabled and c.ats_provider in ADAPTERS]
    owned=[c for c in enabled if source_shard(c,count)==index]
    sem=asyncio.Semaphore(int(os.getenv("JOBRADAR_SOURCE_CONCURRENCY","12")))
    custom_sem=asyncio.Semaphore(int(os.getenv("JOBRADAR_CUSTOM_CONCURRENCY","8")))
    batches=await asyncio.gather(*(scrape(c,sem,custom_sem) for c in owned))
    all_jobs=[job for jobs,_,_,_ in batches for job in jobs]
    candidates=[job for job in all_jobs if job.city in {"Bengaluru","Hyderabad","Chennai","Pune"} and job.role_category!="Other"]
    jobs=[]
    for job in candidates:
        item=job.as_dict(); item["description"]=item.get("description","")[:4000]; jobs.append(item)
    artifact={
        "version":ARTIFACT_VERSION,"shard_index":index,"shard_count":count,
        "started_at":started,"finished_at":now(),"sources":len(owned),
        "jobs_scanned":sum(discovered for *_,discovered in batches),
        "raw_jobs":len(all_jobs),"jobs":jobs,
        "companies":[status for _,status,_,_ in batches],
        "failures":sum(error is not None for _,_,error,_ in batches),
    }
    _atomic_json(output,artifact)
    print(f"Shard {index+1}/{count}: {len(owned)} sources, {len(all_jobs)} raw jobs, {len(jobs)} candidates, {artifact['failures']} failures")

def load_artifacts(paths):
    artifacts=[json.loads(Path(path).read_text(encoding="utf-8")) for path in paths]
    if not artifacts: raise ValueError("No shard artifacts found")
    counts={int(item.get("shard_count",0)) for item in artifacts}
    versions={int(item.get("version",0)) for item in artifacts}
    if len(counts)!=1 or versions!={ARTIFACT_VERSION}: raise ValueError("Incompatible shard artifacts")
    count=counts.pop(); indices=[int(item.get("shard_index",-1)) for item in artifacts]
    if sorted(indices)!=list(range(count)): raise ValueError(f"Expected shards 0..{count-1}, received {sorted(indices)}")
    return sorted(artifacts,key=lambda item:item["shard_index"])

def merge_artifacts(artifacts,expected_sources=None):
    companies=[company for artifact in artifacts for company in artifact["companies"]]
    company_keys=[(company["ats_provider"],company["ats_identifier"]) for company in companies]
    if len(company_keys)!=len(set(company_keys)): raise ValueError("Duplicate company ownership across shards")
    if expected_sources is not None and len(companies)!=expected_sources:
        raise ValueError(f"Incomplete distributed scan: expected {expected_sources} sources, received {len(companies)}")
    jobs={}
    for artifact in artifacts:
        for job in artifact["jobs"]: jobs[(job["ats_provider"],job["external_job_id"])]=job
    return {
        "started_at":min(item["started_at"] for item in artifacts),
        "finished_at":max(item["finished_at"] for item in artifacts),
        "companies":companies,"jobs":list(jobs.values()),
        "jobs_scanned":sum(int(item["jobs_scanned"]) for item in artifacts),
        "raw_jobs":sum(int(item["raw_jobs"]) for item in artifacts),
        "failures":sum(int(item["failures"]) for item in artifacts),
    }

def job_from_dict(value):
    fields={field.name for field in dataclasses.fields(Job)}
    return Job(**{key:item for key,item in value.items() if key in fields})

async def finalize(paths):
    enabled=[c for c in load_companies() if c.enabled and c.ats_provider in ADAPTERS]
    merged=merge_artifacts(load_artifacts(paths),len(enabled))
    statuses=merged["companies"]; payload_jobs=merged["jobs"]
    eligible=[job_from_dict(item) for item in payload_jobs if item.get("is_eligible")]
    failures=merged["failures"]
    empty=sum(1 for status in statuses if not status.get("error_count") and status.get("jobs_found",0)==0 and not str(status.get("warning","")).startswith("Limited coverage"))
    run={"started_at":merged["started_at"],"finished_at":merged["finished_at"],"companies_checked":len(enabled),"companies_successful":len(enabled)-failures,"companies_failed":failures,"companies_empty":empty,"jobs_scanned":merged["jobs_scanned"],"candidate_jobs":len(payload_jobs),"matching_jobs":len(eligible),"notifications_sent":0,"status":run_health_status(failures)}
    endpoint,secret=os.getenv("JOBRADAR_API_URL"),os.getenv("JOBRADAR_INGEST_SECRET")
    if not endpoint or not secret: raise RuntimeError("JOBRADAR_API_URL/INGEST_SECRET missing")
    headers={"Authorization":f"Bearer {secret}"}; bypass=os.getenv("JOBRADAR_SITE_BYPASS_TOKEN")
    if bypass: headers["OAI-Sites-Authorization"]=f"Bearer {bypass}"
    result=await ingest_scan(endpoint,headers,payload_jobs,statuses,run)
    alert_keys=set(result.get("notification_keys",[])); sent=0; telegram_failures=0
    alert_jobs=[job for job in eligible if (f"{job.ats_provider}:{job.external_job_id}" in alert_keys or job.external_job_id in TELEGRAM_RETRY_IDS) and job.relevance_score>=65]
    telegram_chat=None
    try:
        telegram_chat=await ensure_telegram_ready()
        print("Telegram health check: bot authentication and chat validation passed.")
    except TelegramDeliveryError as exc:
        telegram_failures+=1; print(f"ERROR {exc}",file=sys.stderr)
        for job in alert_jobs: await record_notification(endpoint,headers,job,"failed",str(exc))
    for job in alert_jobs if telegram_chat else []:
        try:
            await notify(job,telegram_chat); sent+=1
            await record_notification(endpoint,headers,job,"sent")
        except TelegramDeliveryError as exc:
            telegram_failures+=1; print(f"ERROR Telegram {job.external_job_id}: {exc}",file=sys.stderr)
            await record_notification(endpoint,headers,job,"failed",str(exc))
    limited=[s["name"] for s in statuses if str(s.get("warning","")).startswith("Limited coverage")]
    failed=[s["name"] for s in statuses if s.get("error_count")]
    elapsed=(datetime.now(timezone.utc)-datetime.fromisoformat(merged["started_at"])).total_seconds()
    print(f"Distributed scan: {merged['raw_jobs']} raw; {len(payload_jobs)} candidates; {len(eligible)} eligible; {len(result.get('new_external_ids',[]))} new; {sent} alerts.")
    print(f"Source diagnostics: {empty} empty; {len(limited)} limited; {len(failed)} failed. End-to-end duration: {elapsed:.1f}s.")
    if failed: print("Failed sources: "+", ".join(failed))
    if telegram_failures: print("WARNING Telegram failures remain queued for retry.",file=sys.stderr)

def cli():
    parser=argparse.ArgumentParser(description="JobRadar distributed scan services")
    commands=parser.add_subparsers(dest="command",required=True)
    worker=commands.add_parser("worker"); worker.add_argument("--index",type=int,required=True); worker.add_argument("--count",type=int,required=True); worker.add_argument("--output",required=True)
    coordinator=commands.add_parser("finalize"); coordinator.add_argument("paths",nargs="+")
    args=parser.parse_args()
    if args.command=="worker": asyncio.run(run_worker(args.index,args.count,args.output))
    else: asyncio.run(finalize(args.paths))

if __name__=="__main__": cli()
