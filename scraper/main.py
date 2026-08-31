import asyncio,csv,os,sys
from datetime import datetime,timezone
from pathlib import Path
import httpx
from .adapters import ADAPTERS
from .models import Company
from .normalization import enrich

ROOT=Path(__file__).resolve().parents[1]
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

async def notify(job):
    token,chat=os.getenv("TELEGRAM_BOT_TOKEN"),os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat:return False
    message=f"🚨 NEW JOB\n\n{job.title}\n{job.company}\n\n📍 {job.normalized_location}\n💼 {job.experience_label}\n⭐ Match: {job.relevance_score}/100\n\nSkills: {' • '.join(job.skills) or 'Not specified'}\n\nAPPLY NOW:\n{job.application_url}"
    async with httpx.AsyncClient(timeout=20) as x:
        response=await x.post(f"https://api.telegram.org/bot{token}/sendMessage",json={"chat_id":chat,"text":message,"disable_web_page_preview":True}); response.raise_for_status()
    return True

async def main():
    started=now(); enabled=[c for c in load_companies() if c.enabled and c.ats_provider in ADAPTERS]; sem=asyncio.Semaphore(6)
    batches=await asyncio.gather(*(scrape(c,sem) for c in enabled)); all_jobs=[j for jobs,_,_ in batches for j in jobs]; eligible=[j for j in all_jobs if j.is_eligible]
    statuses=[status for _,status,_ in batches]; failures=sum(error is not None for _,_,error in batches)
    endpoint,secret=os.getenv("JOBRADAR_API_URL"),os.getenv("JOBRADAR_INGEST_SECRET")
    if not endpoint or not secret:
        print(f"Scanned {len(all_jobs)} jobs; {len(eligible)} eligible. Storage skipped: JOBRADAR_API_URL/INGEST_SECRET missing."); return
    run={"started_at":started,"finished_at":now(),"companies_checked":len(enabled),"companies_successful":len(enabled)-failures,"companies_failed":failures,"jobs_scanned":len(all_jobs),"matching_jobs":len(eligible),"notifications_sent":0}
    async with httpx.AsyncClient(timeout=45) as x:
        response=await x.post(endpoint.rstrip("/")+"/api/ingest",headers={"Authorization":f"Bearer {secret}"},json={"jobs":[j.as_dict() for j in eligible],"companies":statuses,"run":run}); response.raise_for_status(); result=response.json()
    new_ids=set(result.get("new_external_ids",[])); sent=0
    for job in eligible:
        if job.external_job_id in new_ids and job.relevance_score>=65:
            try: sent+=int(await notify(job))
            except Exception as exc: print(f"WARN Telegram {job.external_job_id}: {exc}",file=sys.stderr)
    print(f"Scanned {len(all_jobs)} jobs; {len(eligible)} eligible; {len(new_ids)} new; {sent} alerts.")
if __name__=="__main__":asyncio.run(main())
