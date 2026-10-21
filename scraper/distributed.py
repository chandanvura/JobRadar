"""Distributed scan workers and the single idempotent scan coordinator."""

import argparse,asyncio,dataclasses,hashlib,json,os,sys
from datetime import datetime,timezone
from pathlib import Path
from time import perf_counter,process_time

from .adapters import ADAPTERS
from .main import TELEGRAM_RETRY_IDS,QuotaDeferred,TelegramDeliveryError,ensure_telegram_ready,ingest_scan,load_companies,notify,now,record_notification,run_health_status,scrape,source_job_key
from .normalization import TARGET_CITIES
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
    started=now(); wall_started=perf_counter(); cpu_started=process_time()
    enabled=[c for c in load_companies() if c.enabled and c.ats_provider in ADAPTERS]
    owned=[c for c in enabled if source_shard(c,count)==index]
    sem=asyncio.Semaphore(int(os.getenv("JOBRADAR_SOURCE_CONCURRENCY","12")))
    custom_sem=asyncio.Semaphore(int(os.getenv("JOBRADAR_CUSTOM_CONCURRENCY","8")))
    batches=await asyncio.gather(*(scrape(c,sem,custom_sem) for c in owned))
    all_jobs=[job for jobs,_,_,_ in batches for job in jobs]
    candidates=[job for job in all_jobs if job.city in TARGET_CITIES and job.role_category!="Other"]
    jobs=[]
    for job in candidates:
        item=job.as_dict(); item["description"]=item.get("description","")[:12000]; jobs.append(item)
    timing={"event":"worker_timing","shard_index":index,"discovery_wall_seconds":round(perf_counter()-wall_started,3),"process_cpu_seconds":round(process_time()-cpu_started,3)}
    artifact={
        "version":ARTIFACT_VERSION,"shard_index":index,"shard_count":count,"timing":timing,
        "started_at":started,"finished_at":now(),"sources":len(owned),
        "jobs_scanned":sum(discovered for *_,discovered in batches),
        "raw_jobs":len(all_jobs),"jobs":jobs,
        "companies":[status for _,status,_,_ in batches],
        "failures":sum(error is not None for _,_,error,_ in batches),
    }
    _atomic_json(output,artifact)
    print(json.dumps(timing,separators=(",",":")),flush=True)
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
    if len(company_keys)!=len(set(co…1161 tokens truncated…len(limited)} limited; {len(failed)} failed. End-to-end duration: {elapsed:.1f}s.")
    if failed: print("Failed sources: "+", ".join(failed))
    if telegram_failures:
        print("ERROR Telegram failures remain queued for retry.",file=sys.stderr)
        raise TelegramDeliveryError(f"Telegram delivery failed for {telegram_failures} operation(s); check the finalize logs and bot chat configuration")

def cli():
    parser=argparse.ArgumentParser(description="JobRadar distributed scan services")
    commands=parser.add_subparsers(dest="command",required=True)
    worker=commands.add_parser("worker"); worker.add_argument("--index",type=int,required=True); worker.add_argument("--count",type=int,required=True); worker.add_argument("--output",required=True)
    coordinator=commands.add_parser("finalize"); coordinator.add_argument("paths",nargs="+")
    args=parser.parse_args()
    if args.command=="worker": asyncio.run(run_worker(args.index,args.count,args.output))
    else: asyncio.run(finalize(args.paths))

if __name__=="__main__": cli()
