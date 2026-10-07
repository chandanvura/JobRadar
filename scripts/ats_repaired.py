"""Read-only complete-feed validation. Run employer HTTP only on Actions."""
import asyncio
import csv
import json
from pathlib import Path
from scraper.main import scrape
from scraper.models import Company

async def run():
    names={'ACKO','AMD','AXA','GitHub','DocuSign','Booking.com','Intercontinental Exchange','Principal Financial Group','Keysight Technologies','PepsiCo'}
    cases=[]
    for row in csv.DictReader(Path('companies/companies.csv').open()):
        if row['company_name'] not in names:continue
        company=Company(row['company_name'],row['careers_url'],row['ats_provider'],row['ats_identifier'],int(row['priority']))
        jobs,status,error,count=await scrape(company,asyncio.Semaphore(1),asyncio.Semaphore(1))
        case=dict(company=company.name,status=status,error=error,advertised_total=count,unique_ids=len({j.external_job_id for j in jobs}),details=len(jobs),unknown_dates=sum(j.posted_at is None for j in jobs),missing_descriptions=sum(not j.description for j in jobs))
        case['complete']=not error and not (status.get('warning') or '').startswith('Limited coverage') and count==len(jobs)==case['unique_ids'] and not case['missing_descriptions']
        cases.append(case);print(json.dumps(case),flush=True)
    output=Path('artifacts/ats-repaired-2026-10-07');output.mkdir(parents=True,exist_ok=True)
    (output/'evidence.json').write_text(json.dumps(cases,indent=2))
    if len(cases)!=len(names) or not all(c['complete'] for c in cases):raise RuntimeError('Complete repaired feeds have not all passed')

if __name__=='__main__':asyncio.run(run())
