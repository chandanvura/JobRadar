"""Read-only Actions validation of current source errors; no production writes."""
import asyncio
import hashlib
import json
from pathlib import Path
from bs4 import BeautifulSoup
from scraper.adapters import client,request,workday_country_facets
from scraper.main import scrape
from scraper.models import Company
from scripts.ats_deep import public_references

OUT=Path('artifacts/refreshed-repairs')

async def run():
    OUT.mkdir(parents=True,exist_ok=True);evidence=[]
    async with client(timeout=40) as x:
        case={'company':'HubSpot','requests':[],'status':'UNVERIFIED'};evidence.append(case)
        try:
            for label,url in [('official','https://www.hubspot.com/'),('careers','https://www.hubspot.com/careers'),('jobs','https://www.hubspot.com/careers/jobs')]:
                r=await request(x,'GET',url);(OUT/f'hubspot-{label}.html').write_text(r.text)
                case['requests'].append({'url':url,'final_url':str(r.url),'status':r.status_code,'sha256':hashlib.sha256(r.content).hexdigest()});r.raise_for_status()
                soup=BeautifulSoup(r.text,'html.parser');links,scripts=public_references(soup,str(r.url))
                case[label]={'links':links,'scripts':scripts,'title':soup.title.get_text() if soup.title else None}
                if label=='jobs':
                    selected=[u for u in scripts if any(word in u.lower() for word in ['career','job','search','main','bundle'])][:12]
                    for index,url in enumerate(selected):
                        sr=await request(x,'GET',url);(OUT/f'hubspot-script-{index}.js').write_text(sr.text)
                        case['requests'].append({'url':url,'status':sr.status_code,'sha256':hashlib.sha256(sr.content).hexdigest()})
        except Exception as exc:case['blocker']=str(exc)
        case={'company':'Maersk','scope':'published India country facet','status':'UNVERIFIED'};evidence.append(case)
        try:
            r=await request(x,'POST','https://maersk.wd3.myworkdayjobs.com/wday/cxs/maersk/Maersk_Careers/jobs',json={'appliedFacets':{},'limit':20,'offset':0,'searchText':''});r.raise_for_status()
            data=r.json();case['published_facets']=data.get('facets');case['india_facet']=workday_country_facets(data.get('facets',[]),'India')
            c=Company('Maersk','https://maersk.wd3.myworkdayjobs.com/Maersk_Careers','workday_complete','maersk|Maersk_Careers|India',4)
            jobs,status,error,total=await scrape(c,asyncio.Semaphore(1),asyncio.Semaphore(1))
            case.update(collection=status,error=error,advertised_total=total,unique_ids=len({j.external_job_id for j in jobs}),details=len(jobs),missing_descriptions=sum(not j.description for j in jobs))
            case['complete']=not error and total==len(jobs)==case['unique_ids'] and not case['missing_descriptions'] and not (status.get('warning') or '').startswith('Limited coverage')
            if case['complete']:case['status']='COMPLETE_ACTIONS_NOT_PRODUCTION'
        except Exception as exc:case['blocker']=str(exc)
    (OUT/'evidence.json').write_text(json.dumps(evidence,indent=2))
    for c in evidence:print(json.dumps({k:v for k,v in c.items() if k not in ['published_facets','requests','official','careers','jobs']}),flush=True)

if __name__=='__main__':asyncio.run(run())
