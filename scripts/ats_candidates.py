"""Actions-only, read-only validation of employer-published candidate sources."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from scraper.adapters import ADAPTERS, client, request
from scraper.career_widgets import kula_records
from scraper.main import scrape
from scraper.models import Company

async def run():
    candidates=json.loads(Path('companies/ats-candidates-2026-10-07.json').read_text())['companies']
    if not 1<=len(candidates)<=50:raise ValueError('Bounded candidate batch required')
    output=Path('artifacts/ats-candidates-2026-10-07');output.mkdir(parents=True,exist_ok=True);evidence=[]
    for candidate in candidates:
        c=Company(candidate['name'],candidate['board'],candidate['provider'],candidate['identifier'])
        case=dict(company=c.name,source=candidate,status='UNVERIFIED',pages=[])
        folder=output/c.name;folder.mkdir(exist_ok=True)
        try:
            async with client(timeout=40) as x:
                async def get(url):
                    response=await request(x,'GET',url);response.raise_for_status()
                    p=folder/(str(len(case['pages']))+'.html');p.write_text(response.text)
                    soup=BeautifulSoup(response.text,'html.parser')
                    case['pages'].append(dict(url=url,final_url=str(response.url),http_status=response.status_code,content_type=response.headers.get('content-type'),title=soup.title.get_text(' ',strip=True) if soup.title else None))
                    return response,soup
                if candidate.get('official'):
                    r,soup=await get(candidate['official'])
                    if candidate['navigation'] not in {urljoin(str(r.url),a['href']) for a in soup.select('a[href]')}:
                        raise ValueError('Current official careers navigation no longer matches')
                    r,soup=await get(candidate['navigation'])
                    if c.careers_url not in {urljoin(str(r.url),a.get('href') or a.get('src')) for a in soup.select('[href],[src]')}:
                        raise ValueError('Current official navigation no longer publishes candidate board')
                r,soup=await get(c.careers_url)
                if c.ats_provider=='kula':
                    records,_=kula_records(r.text)
                    expected={str(row['id']) for row in records if row.get('listed') is True and not row.get('is_confidential') and row.get('kind') in ('external','internal_and_external')}
                    case['advertised_public_ids']=sorted(expected)
                    title=soup.title.get_text() if soup.title else ''
                    if c.name.lower() not in title.lower():raise ValueError('Candidate board branding does not identify employer')
                else:expected=None
                if c.ats_provider=='lever':
                    data=await request(x,'GET','https://api.lever.co/v0/postings/'+c.ats_identifier,params={'mode':'json'});data.raise_for_status()
                    (folder/'public-listing.json').write_text(json.dumps(data.json(),indent=2))
                    missing=[row for row in data.json() if not (row.get('descriptionPlain') or row.get('description') or row.get('lists') or row.get('additionalPlain') or row.get('additional'))]
                    case['missing_requirements']=[dict(id=row['id'],title=row['text'],url=row.get('hostedUrl')) for row in missing]
                    for row in missing[:10]:
                        if row.get('hostedUrl'):await get(row['hostedUrl'])
                rows,status,error,count=await scrape(c,asyncio.Semaphore(1),asyncio.Semaphore(1))
                ids={j.external_job_id for j in rows}
                case.update(collection=status,error=error,count=count,unique_ids=len(ids),details=len(rows),unknown_dates=sum(j.posted_at is None for j in rows),missing_descriptions=sum(not j.description for j in rows))
                if error or (status.get('warning') or '').startswith('Limited coverage'):raise ValueError(error or status['warning'])
                if expected is not None:
                    if ids!=expected or count!=len(expected) or len(ids)!=len(rows) or any(not j.description for j in rows):raise ValueError('Candidate public listing and full details do not reconcile')
                    final,_=await get(c.careers_url);last,_=kula_records(final.text)
                    last_ids={str(row['id']) for row in last if row.get('listed') is True and not row.get('is_confidential') and row.get('kind') in ('external','internal_and_external')}
                    if last_ids!=expected:raise ValueError('Candidate public listing changed during scan')
                case['status']='COMPLETE_ACTIONS_NOT_PRODUCTION'
        except Exception as exc:case['blocker']=str(exc)
        (folder/'evidence.json').write_text(json.dumps(case,indent=2));evidence.append(case)
        print(json.dumps({k:v for k,v in case.items() if k not in ('advertised_public_ids','pages')}),flush=True)
    (output/'evidence.json').write_text(json.dumps(evidence,indent=2))

if __name__=='__main__':asyncio.run(run())
