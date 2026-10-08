"""Capture failing feed responses on Actions without publishing jobs."""
import asyncio
import json
from pathlib import Path
from scraper import adapters
from scraper.main import load_companies, fetch_company_jobs

async def main():
    root=Path("artifacts/feed-timing");root.mkdir(parents=True,exist_ok=True)
    original=adapters.request
    for company in load_companies():
        if company.name not in {"Lam Research","Principal Financial Group","HubSpot"}:continue
        records=[]
        async def capture(client,method,url,**kwargs):
            response=await original(client,method,url,**kwargs)
            try:body=response.json()
            except ValueError:body=response.text
            records.append(dict(url=str(response.url),status=response.status_code,body=body))
            return response
        adapters.request=capture
        try:
            jobs,count=await fetch_company_jobs(company)
            result=dict(company=company.name,total=count,details=len(jobs),unique_ids=len({j.external_job_id for j in jobs}),error=None)
        except Exception as exc:
            result=dict(company=company.name,error=f"{type(exc).__name__}: {exc}")
        finally:
            adapters.request=original
            (root/(company.name.replace(" ","-")+".json")).write_text(json.dumps(dict(result=result,responses=records),indent=2))
        print(json.dumps(result),flush=True)

if __name__=="__main__":
    asyncio.run(main())
