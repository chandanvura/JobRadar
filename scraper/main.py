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

async def scrape(company,sem):
    checked=now()
    async with sem:
        try:
            raw=await ADAPTERS[company.ats_provider].fetch_jobs(company)
            return [enrich(j,company.priority) for j in raw],{"name":company.name,"careers_url":company.careers_url,"ats_provider":company.ats_provider,"ats_identifier":company.ats_identifier,"priority":company.priority,"last_checked_at":checked,"last_success_at":now(),"error_count":0},None
        except Exception as exc:
            print(f"WARN {company.name}: {type(exc).__name__}: {exc}",file=sys.stderr)
            return [],{"name":company.name,"careers_url":company.careers_url,"ats_provider":company.ats_provider,"ats_identifier":company.ats_identifier,"priority":company.priority,"last_checked_at":checked,"last_success_at":None,"error_count":1},str(exc)

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
    if not token or not chat:return False
    message=f"🚨 NEW JOB\n\n{job.title}\n{job.company}\n\n📍 {job.normalized_location}\n💼 {job.experience_label}\n⭐ Match: {job.relevance_score}/100\n\nSkills: {' • '.join(job.skills) or 'Optional / not specified'}\n\nAPPLY NOW:\n{job.application_url}"
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

async def main():
    started=now(); enabled=[c for c in load_companies() if c.enabled and c.ats_provider in ADAPTERS]; sem=asyncio.Semaphore(6)
    batches=await asyncio.gather(*(scrape(c,sem) for c in enabled)); all_jobs=[j for jobs,_,_ in batches for j in jobs]; eligible=[j for j in all_jobs if j.is_eligible]
    statuses=[status for _,status,_ in batches]; failures=sum(error is not None for _,_,error in batches)
    endpoint,secret=os.getenv("JOBRADAR_API_URL"),os.getenv("JOBRADAR_INGEST_SECRET")
    if not endpoint or not secret:
        print(f"Scanned {len(all_jobs)} jobs; {len(eligible)} eligible. Storage skipped: JOBRADAR_API_URL/INGEST_SECRET missing."); return
    run={"started_at":started,"finished_at":now(),"companies_checked":len(enabled),"companies_successful":len(enabled)-failures,"companies_failed":failures,"jobs_scanned":len(all_jobs),"matching_jobs":len(eligible),"notifications_sent":0}
    headers={"Authorization":f"Bearer {secret}"}
    bypass=os.getenv("JOBRADAR_SITE_BYPASS_TOKEN")
    if bypass:headers["OAI-Sites-Authorization"]=f"Bearer {bypass}"
    async with httpx.AsyncClient(timeout=45) as x:
        response=await x.post(endpoint.rstrip("/")+"/api/ingest",headers=headers,json={"jobs":[j.as_dict() for j in eligible],"companies":statuses,"run":run}); response.raise_for_status(); result=response.json()
    new_ids=set(result.get("new_external_ids",[])); sent=0
    for job in eligible:
        if (job.external_job_id in new_ids or job.external_job_id in TELEGRAM_RETRY_IDS) and job.relevance_score>=65:
            try: sent+=int(await notify(job))
            except Exception as exc: print(f"WARN Telegram {job.external_job_id}: {exc}",file=sys.stderr)
    print(f"Scanned {len(all_jobs)} jobs; {len(eligible)} eligible; {len(new_ids)} new; {sent} alerts.")
if __name__=="__main__":asyncio.run(main())
