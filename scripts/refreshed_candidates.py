"""Validate only evidence-derived candidates; an HTTP 200 alone is not complete."""
import asyncio
import json
from pathlib import Path
from scraper.adapters import client,request
from scraper.main import scrape
from scraper.models import Company

OUT=Path('artifacts/refreshed-candidates')
CANDIDATES=[
    Company('Vodafone','https://jobs.vodafone.com/careers','vodafone','vodafone.com',4),
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
        for name,origin in [('Aon','https://jobs.aon.com'),('DocuSign','https://careers.docusign.com'),('Costco','https://careers.costco.com'),('Panasonic','https://careers.na.panasonic.com')]:
            case=dict(company=name,status='UNVERIFIED_PUBLIC_PROBE');cases.append(case)
            try:
                r=await request(x,'GET',origin+'/api/jobs',params={'page':1,'limit':20,'internal':'false'});r.raise_for_status();data=r.json()
                (OUT/(name+'-jibe.json')).write_text(json.dumps(data))
                case.update(count=data.get('count'),totalCount=data.get('totalCount'),filter=data.get('filter'))
                rows=data.get('jobs') or []
                if rows:
                    row=rows[0]['data'];url=origin+'/api/jobs/'+row['slug']+'/'+row['language']
                    dr=await request(x,'GET',url);dr.raise_for_status();(OUT/(name+'-detail.json')).write_text(dr.text)
            except Exception as exc:case['blocker']=str(exc)
            print(json.dumps({k:v for k,v in case.items() if k!='filter'}),flush=True)
        try:
            r=await request(x,'GET','https://sarlaaviation.keka.com/careers/api/embedjobs/default/active/e49e9d28-c9da-4c98-9479-9c1bc14f55e6');r.raise_for_status()
            (OUT/'sarla-keka.json').write_text(r.text)
            print(json.dumps({'company':'Sarla Aviation','status':'UNVERIFIED_PUBLIC_PROBE','http_status':r.status_code}),flush=True)
        except Exception as exc:print('Sarla Aviation public probe: '+str(exc),flush=True)
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
