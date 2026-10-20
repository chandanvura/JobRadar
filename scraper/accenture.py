"""Bounded public search used by Accenture's current India careers page."""
import asyncio
import httpx
import json
from urllib.parse import urlsplit,parse_qs
from bs4 import BeautifulSoup
from .models import JobBatch

OFFICIAL='https://www.accenture.com/in-en/careers/jobsearch'
SEARCH='https://www.accenture.com/api/accenture/elastic/findjobs'
PAGE_SIZE=100
EXPERIENCE_BANDS=('Experience: 0-2 years','Experience: 2-5 years')


class AccentureCareerAdapter:
    async def fetch_jobs(self,company):
        from .adapters import client,request,clean,location_text,make_job,fetch_detail,jsonld_objects,parse_posting
        from .normalization import enrich
        if company.name!='Accenture' or company.careers_url!=OFFICIAL or company.ats_identifier!=SEARCH:
            raise ValueError('Accenture source differs from the verified official search')
        found={};moved=False
        async with client(timeout=35) as x:
            for band in EXPERIENCE_BANDS:
                filters=[{'fieldName':'yearsOfExperience.keyword','items':[band],'multiSelect':False}]
                fields={'startIndex':'0','maxResultSize':str(PAGE_SIZE),'jobKeyword':'','jobCountry':'India','jobLanguage':'en','countrySite':'in-en','sortBy':'1','searchType':'vectorSearch','enableQueryBoost':'true','minScore':'0.6','getFeedbackJudgmentEnabled':'true','useCleanEmbedding':'true','score':'true','totalHits':'true','debugQuery':'false','jobFilters':json.dumps(filters)}
                response=await request(x,'POST',SEARCH,files={key:(None,value) for key,value in fields.items()},headers={'CSRF-Token':''})
                response.raise_for_status();payload=response.json()
                rows=payload.get('data')
                total=(payload.get('totalHits') or {}).get('total')
                if not isinstance(rows,list) or len(rows)>PAGE_SIZE or type(total) is not int or total<0 or (not rows and total>0):
                    raise ValueError('Accenture official search returned an invalid page or count')
                page_ids=set()
                for row in rows:
                    identifier=row.get('guid');path=row.get('jobDetailUrl','').replace('{0}','in-en');url=urlsplit(path)
                    if (not isinstance(identifier,str) or not identifier or identifier in page_ids or row.get('country')!='India'
                            or not row.get('title') or not row.get('jobDescriptionClean') or not row.get('location')
                            or url.scheme!='https' or url.hostname!='www.accenture.com' or url.path!='/in-en/careers/jobdetails'
                            or url.username or url.password or parse_qs(url.query).get('id')!=[identifier]):
                        raise ValueError('Accenture search omitted requirements, identity or official India job links')
                    page_ids.add(identifier)
                    if identifier in found:moved=True;continue
                    # updateDate is an index update, never posting-date evidence.
                    job=make_job(row.get('requisitionId') or identifier,row['title'],company.name,
                                 location_text(row['location'],'India'),clean(row['jobDescriptionClean']+'\n'+row.get('qualificationClean','')),
                                 'accenture','company_career',path,path,OFFICIAL,posting=row.get('postedDateText'))
                    found[identifier]=job
            gate=asyncio.Semaphore(3)
            async def posting(job):
                if enrich(job).eligibility_reason!='Posting date not verified within 24 hours':return
                try:
                    async with gate:
                        response=await fetch_detail(x,job.job_url)
                except httpx.HTTPError:
                    return
                if response.status_code!=200:return
                for item in jsonld_objects(BeautifulSoup(response.text,'html.parser')):
                    owner=item.get('hiringOrganization') or {}
                    url=urlsplit(item.get('url',''))
                    if (item.get('title')==job.title and isinstance(owner,dict) and owner.get('name')=='Accenture'
                            and url.hostname=='www.accenture.com' and parse_qs(url.query).get('id')==parse_qs(urlsplit(job.job_url).query).get('id')
                            and item.get('datePosted')):
                        job.posted_at,job.posted_label,job.posted_precision,job.reported_age_hours=parse_posting(item['datePosted'])
                        break
            await asyncio.gather(*(posting(job) for job in found.values()))
        warning=f'Limited coverage: {len(found)} newest records from official India experience-band searches; not a complete inventory'
        if moved:warning+='; results moved between pages'
        return JobBatch(list(found.values()),warning),len(found)
