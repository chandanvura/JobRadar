"""Capture failing feed responses on Actions without publishing jobs."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from scraper import adapters
from scraper.main import load_companies, fetch_company_jobs

async def main():
    root=Path("artifacts/feed-timing");root.mkdir(parents=True,exist_ok=True)
    verified=set()
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
            roots={"Lam Research":"https://www.lamresearch.com/","Principal Financial Group":"https://www.principal.com/","HubSpot":"https://www.hubspot.com/"}
            # Follow only actual first-party published career links; save blocks as evidence.
            async with adapters.client(timeout=30) as client:
                queue=[roots[company.name]];seen=set()
                while queue and len(seen)<4:
                    current=queue.pop(0)
                    if current in seen:continue
                    seen.add(current)
                    try:
                        page=await capture(client,'GET',current)
                        if page.status_code!=200:continue
                        for anchor in BeautifulSoup(page.text,'html.parser').select('a[href]'):
                            target=urljoin(str(page.url),anchor['href']).split('#',1)[0]
                            host=urlsplit(target).hostname or ''
                            if (urlsplit(target).scheme=='https' and
                                any(host==domain or host.endswith('.'+domain) for domain in ('lamresearch.com','principal.com','hubspot.com')) and
                                ('career' in target.lower() or 'career' in anchor.get_text().lower()) and target not in seen):
                                if host!=urlsplit(roots[company.name]).hostname or '/careers/jobs' in target:
                                    queue.insert(0,target)
                                else:
                                    queue.append(target)
                    except Exception as exc:
                        records.append(dict(url=current,error=type(exc).__name__))
            jobs,count=await fetch_company_jobs(company)
            result=dict(company=company.name,total=count,details=len(jobs),unique_ids=len({j.external_job_id for j in jobs}),error=None,
                        unknown_dates=sum(j.posted_at is None for j in jobs),missing_descriptions=sum(not j.description for j in jobs))
            if count==len(jobs)==result['unique_ids'] and not result['missing_descriptions']:
                verified.add(company.name)
        except Exception as exc:
            result=dict(company=company.name,error=f"{type(exc).__name__}: {exc}")
        finally:
            adapters.request=original
            (root/(company.name.replace(" ","-")+".json")).write_text(json.dumps(dict(result=result,responses=records),indent=2))
        print(json.dumps(result),flush=True)
    if not {"Lam Research","Principal Financial Group"}.issubset(verified):
        raise RuntimeError('Repaired feeds failed complete count and detail verification')

if __name__=="__main__":
    asyncio.run(main())
