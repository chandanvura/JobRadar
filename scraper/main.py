import asyncio,csv,os,sys
from datetime import datetime,timezone
from pathlib import Path
import httpx
from .adapters import ADAPTERS
from .models import Company
from .normalization import enrich

ROOT=Path(__file__).resolve().parents[1]
_TELEGRAM_CHAT_OVERRIDE=None
# Kept empty during normal operation; prevents replaying already-ingested alerts.
TELEGRAM_RETRY_IDS=set()

def now(): return datetime.now(timezone.utc).isoformat()
def load_companies():
    with (ROOT/"companies"/"companies.csv").open(encoding="utf-8") as f:return [Company(r["company_name"],r["careers_url"],r["ats_provider"].lower(),r["ats_identifier"],int(r.get("priority",3)),r.get("enabled","true").lower()=="true") for r in csv.DictReader(f)]

def run_health_status(failures):
    """Operational health depends on request failures, not hiring activity.

    A successful source may legitimately have no open roles. Empty and limited
    sources remain visible as coverage diagnostics but must not mark the scan
    itself as degraded.
    """
    return "success" if failures == 0 else "degraded"

async def scrape(company,sem):
    checked=now()
    async with sem:
        try:
            raw,discovered=await ADAPTERS[company.ats_provider].fetch_jobs(company)
            jobs=[enrich(j,company.priority) for j in raw]
            candidates=[j for j in jobs if j.city in {"Bengaluru","Hyderabad"} and j.role_category!="Other"]
            eligible=[j for j in candidates if j.is_eligible]
            warning="Limited coverage: no structured public job feed" if discovered==0 and company.ats_provider=="custom" else "No current openings returned" if discovered==0 else "No target-city roles currently" if not candidates else None
            return jobs,{"name":company.name,"careers_url":company.careers_url,"ats_provider":company.ats_provider,"ats_identifier":company.ats_identifier,"priority":company.priority,"last_checked_at":checked,"last_success_at":now(),"error_count":0,"jobs_found":discovered,"candidate_jobs":len(candidates),"eligible_jobs":len(eligible),"warning":warning},None,discovered
        except Exception as exc:
            print(f"WARN {company.name}: {type(exc).__name__}: {exc}",file=sys.stderr)
            return [],{"name":company.name,"careers_url":company.careers_url,"ats_provider":company.ats_provider,"ats_identifier":company.ats_identifier,"priority":company.priority,"last_checked_at":checked,"last_success_at":None,"error_count":1,"jobs_found":0,"candidate_jobs":0,"eligible_jobs":0,"warning":f"{type(exc).__name__}: {str(exc)[:160]}"},str(exc),0

def private_start_chat_id(payload):
    """Return the most recent private chat that explicitly sent /start."""
    candidates=[]
    for update in payload.get("result",[]):
        message=update.get("message") or update.get("edited_message") or {}
        chat=message.get("chat") or {}
        if chat.get("type")=="private" and str(message.get("text","")).strip().split()[0:1]==["/start"] and chat.get("id") is not None:
            candidates.append((int(update.get("update_id",0)),str(chat["id"])))
    return max(candidates)[1] if candidates else None

async def notify(job):
    global _TELEGRAM_CHAT_OVERRIDE
    token,configured=os.getenv("TELEGRAM_BOT_TOKEN"),os.getenv("TELEGRAM_CHAT_ID")
    chat=_TELEGRAM_CHAT_OVERRIDE or configured
    if not token or not chat:raise RuntimeError("Telegram credentials are not configured")
    posted=job.posted_label or job.posted_at or "Posting time unavailable"
    message=f"🚨 NEW JOB\n\n{job.title}\n{job.company}\n\n📍 {job.normalized_location}\n💼 {job.experience_label}\n🕒 {posted}\n⭐ Priority: {job.relevance_score}/100\n\nSkills: {' • '.join(job.skills) or 'Optional / not specified'}\n\nAPPLY NOW:\n{job.application_url}\n\nCAREER PAGE:\n{job.career_page_url}"
    async with httpx.AsyncClient(timeout=20) as x:
        url=f"https://api.telegram.org/bot{token}"
        response=await x.post(url+"/sendMessage",json={"chat_id":chat,"text":message,"disable_web_page_preview":True})
        if response.status_code==403 and not _TELEGRAM_CHAT_OVERRIDE:
            updates=await x.get(url+"/getUpdates",params={"limit":100,"timeout":0})
            updates.raise_for_status()
            recovered=private_start_chat_id(updates.json())
            if recovered and recovered!=chat:
                _TELEGRAM_CHAT_OVERRIDE=recovered
                response=await x.post(url+"/sendMessage",json={"chat_id":recovered,"text":message,"disable_web_page_preview":True})
        response.raise_for_status()
    return True

async def record_notification(endpoint,headers,job,status,error=None):
    payload={"ats_provider":job.ats_provider,"external_job_id":job.external_job_id,"status":status,"error":error}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(30,connect=10)) as x:
            response=await x.post(endpoint.rstrip("/")+"/api/notifications",headers=headers,json=payload)
            response.raise_for_status()
    except Exception as exc:
        print(f"WARN Notification audit {job.external_job_id}: {type(exc).__name__}",file=sys.stderr)

async def post_with_retry(url,headers,payload,attempts=3):
    last=None
    for attempt in range(attempts):
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(150,connect=20)) as x:
                response=await x.post(url,headers=headers,json=payload); response.raise_for_status(); return response
        except (httpx.TimeoutException,httpx.NetworkError,httpx.HTTPStatusError) as exc:
            last=exc
            if attempt+1<attempts: await asyncio.sleep(2**attempt)
    raise last or RuntimeError("Request failed")

async def main():
    started=now(); enabled=[c for c in load_companies() if c.enabled and c.ats_provider in ADAPTERS]; sem=asyncio.Semaphore(6)
    batches=await asyncio.gather(*(scrape(c,sem) for c in enabled)); all_jobs=[j for jobs,_,_,_ in batches for j in jobs]
    candidates=[j for j in all_jobs if j.city in {"Bengaluru","Hyderabad"} and j.role_category!="Other"]
    eligible=[j for j in candidates if j.is_eligible]
    statuses=[status for _,status,_,_ in batches]; failures=sum(error is not None for _,_,error,_ in batches); scanned=sum(count for *_,count in batches)
    endpoint,secret=os.getenv("JOBRADAR_API_URL"),os.getenv("JOBRADAR_INGEST_SECRET")
    if not endpoint or not secret:
        print(f"Scanned {len(all_jobs)} jobs; {len(eligible)} eligible. Storage skipped: JOBRADAR_API_URL/INGEST_SECRET missing."); return
    empty=sum(1 for status in statuses if not status.get("error_count") and status.get("jobs_found",0)==0 and not str(status.get("warning","")).startswith("Limited coverage"))
    run={"started_at":started,"finished_at":now(),"companies_checked":len(enabled),"companies_successful":len(enabled)-failures,"companies_failed":failures,"companies_empty":empty,"jobs_scanned":scanned,"candidate_jobs":len(candidates),"matching_jobs":len(eligible),"notifications_sent":0,"status":run_health_status(failures)}
    headers={"Authorization":f"Bearer {secret}"}
    bypass=os.getenv("JOBRADAR_SITE_BYPASS_TOKEN")
    if bypass:headers["OAI-Sites-Authorization"]=f"Bearer {bypass}"
    payload_jobs=[]
    for job in candidates:
        item=job.as_dict(); item["description"]=item.get("description","")[:4000]; payload_jobs.append(item)
    response=await post_with_retry(endpoint.rstrip("/")+"/api/ingest",headers,{"jobs":payload_jobs,"companies":statuses,"run":run})
    result=response.json(); alert_keys=set(result.get("notification_keys",[])); sent=0
    for job in eligible:
        notification_key=f"{job.ats_provider}:{job.external_job_id}"
        if (notification_key in alert_keys or job.external_job_id in TELEGRAM_RETRY_IDS) and job.relevance_score>=65:
            try:
                await notify(job); sent+=1
                await record_notification(endpoint,headers,job,"sent")
            except Exception as exc:
                print(f"WARN Telegram {job.external_job_id}: {type(exc).__name__}",file=sys.stderr)
                await record_notification(endpoint,headers,job,"failed",f"{type(exc).__name__}: Telegram delivery failed")
    empty_names=[s["name"] for s in statuses if not s.get("error_count") and not s.get("jobs_found") and not str(s.get("warning","")).startswith("Limited coverage")]
    limited_names=[s["name"] for s in statuses if str(s.get("warning","")).startswith("Limited coverage")]
    failed_names=[s["name"] for s in statuses if s.get("error_count")]
    print(f"Scanned {len(all_jobs)} jobs; {len(candidates)} target candidates; {len(eligible)} eligible; {len(result.get('new_external_ids',[]))} new; {sent} alerts.")
    print(f"Source diagnostics: {len(empty_names)} empty; {len(limited_names)} limited; {len(failed_names)} failed.")
    if empty_names: print("Empty sources: "+", ".join(empty_names))
    if limited_names: print("Limited sources: "+", ".join(limited_names))
    if failed_names: print("Failed sources: "+", ".join(failed_names))
if __name__=="__main__":asyncio.run(main())
