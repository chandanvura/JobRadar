"""Validate only evidence-derived candidates; an HTTP 200 alone is not complete."""
import asyncio
import json
from pathlib import Path
from scraper.adapters import client,request
from scraper.main import scrape
from scraper.models import Company

OUT=Path('artifacts/refreshed-candidates')
CANDIDATES=[
    Company('Aon','https://jobs.aon.com/jobs','jibe','aon|India',4),
    Company('DocuSign','https://careers.docusign.com/careers-home/jobs','jibe','docusign|India',4),
    Company('Planful','https://planful.com/jobs/careers-list/','greenhouse','hostanalytics',3),
    Company('Bayer','https://talent.bayer.com/careers?domain=bayer.com','eightfold_legacy_complete','talent.bayer.com|bayer.com',4),
]

async def run():
    OUT.mkdir(parents=True,exist_ok=True);cases=[]
    for c in CANDIDATES:
        jobs,status,error,total=await scrape(c,asyncio.Semaphore(1),asyncio.Semaphore(1))
        case=dict(company=c.name,provider=c.ats_provider,identifier=c.ats_identifier,board=c.careers_url,collection=status,error=error,advertised_total=total,unique_ids=len({j.external_job_id for j in jobs}),details=len(jobs),missing_descriptions=sum(not j.description for j in jobs))
        case['complete']=not error and total==len(jobs)==case['unique_ids'] and not case['missing_descriptions'] and not (status.get('warning') or '').startswith('Limited coverage')
        cases.append(case);print(json.dumps(case),flush=True)
    async with client(timeout=40) as x:
        for name,host in [('Darwinbox','dbx.darwinbox.in'),('Orange Health Labs','orangehealth.darwinbox.in')]:
            case=dict(company=name,status='UNVERIFIED_PUBLIC_PROBE');cases.append(case)
            try:
                url='https://'+host+'/ms/candidateapi/job/alljobs'
                r=await request(x,'POST',url,params={'companyId':'main'},json={'companyId':'main','page':1,'sort_option':'new','limit':10})
                (OUT/(host+'.body')).write_text(r.text)
                case.update(http_status=r.status_code,endpoint=url)
                if r.status_code==200:
                    data=r.json();case['top_keys']=list(data);case['first_page_count']=len(data.get('data',[])) if isinstance(data.get('data'),list) else None
            except Exception as exc:case['blocker']=str(exc)
            print(json.dumps(case),flush=True)
        case=dict(company='HubSpot',status='UNVERIFIED_PUBLIC_PROBE');cases.append(case)
        try:
            queries=json.loads(Path('companies/hubspot-public-queries.json').read_text())
            r=await request(x,'POST','https://wtcfns.hubspot.com/careers/graphql',json={'operationName':'Jobs','query':queries['Jobs'],'variables':{}})
            (OUT/'hubspot-graphql.json').write_text(r.text);case['http_status']=r.status_code
            if r.status_code==200:
                data=r.json();case['errors']=data.get('errors');jobs=(data.get('data') or {}).get('jobs');case['count']=len(jobs) if isinstance(jobs,list) else None
        except Exception as exc:case['blocker']=str(exc)
        print(json.dumps(case),flush=True)
    (OUT/'evidence.json').write_text(json.dumps(cases,indent=2))

if __name__=='__main__':asyncio.run(run())
