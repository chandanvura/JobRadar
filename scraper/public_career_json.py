"""Employer-published complete JSON arrays with embedded full requirements."""
import html
import re
from urllib.parse import urljoin,urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

ATLASSIAN='https://www.atlassian.com/endpoint/careers/listings'
ATLASSIAN_PORTALS={17: 'globalcareers-atlassian.icims.com', 242: 'careers-apac-atlassian.icims.com', 111: 'careers-americas.icims.com', 250: 'campus-globalcareers-atlassian.icims.com', 251: 'campus-americas.icims.com', 193343: 'globalmobility-careers-atlassian.icims.com'}
AVALARA='https://api.careerpuck.com/v1/public/job-boards/avalara'


def records(payload,kind):
    from .adapters import clean,location_text
    if kind=='atlassian':
        rows=payload
    else:
        if (not isinstance(payload,dict) or payload.get('permalink')!='avalara' or payload.get('isSandbox') is not False
                or payload.get('includeJdOnPage') is not True or payload.get('employerProfile',{}).get('name')!='Avalara'
                or payload.get('employerProfile',{}).get('emailDomain')!='avalara.com'):
            raise ValueError('Careerpuck board is not the current public Avalara employer feed')
        rows=payload.get('jobs')
    if not isinstance(rows,list) or len(rows)>2000:raise ValueError('Complete career array is malformed or exceeds bounded scan')
    result={}
    for row in rows:
        if not isinstance(row,dict):raise ValueError('Malformed public career record')
        if kind=='atlassian':
            ident=str(row.get('id') or '');portal=row.get('portalJobPost') or {}
            url=portal.get('portalUrl') or '';host=urlsplit(url).hostname
            if (not ident.isdigit() or portal.get('id')!=row.get('id') or portal.get('portalId')!=row.get('portalId')
                    or host!=ATLASSIAN_PORTALS.get(row.get('portalId')) or f'/jobs/{ident}/' not in url):
                raise ValueError('Atlassian record does not match its published employer job portal')
            locations=row.get('locations')
            if not isinstance(locations,list) or any(not isinstance(v,str) for v in locations):raise ValueError('Atlassian locations are malformed')
            description=clean(' '.join(row.get(k) or '' for k in ['overview','responsibilities','qualifications']))
            location=location_text(locations);apply=row.get('applyUrl') or url
        else:
            ident=row.get('permalink');url=row.get('publicUrl') or '';apply=row.get('applyUrl') or url
            if (not isinstance(ident,str) or not re.fullmatch(r'[\w-]+',ident) or row.get('status')!='public'
                    or row.get('jobBoard',{}).get('permalink')!='avalara' or row.get('jobBoard',{}).get('isSandbox') is not False
                    or not url.startswith('https://app.careerpuck.com/job-board/avalara/job/')
                    or urlsplit(apply).hostname not in {'careersnoa-avalara.icims.com','careersind-avalara.icims.com','careersemea-avalara.icims.com','careersbr-avalara.icims.com'}):
                raise ValueError('Avalara record belongs to another or nonpublic employer board')
            text=row.get('content') or ''
            # Public content is entity-escaped HTML, sometimes with a second layer.
            for _ in range(3):text=html.unescape(text)
            description=clean(text)
            locations=[v.get('name') for v in row.get('offices') or [] if isinstance(v,dict)]
            location=location_text(row.get('location'),locations)
        if ident in result or not row.get('title') or not description:
            raise ValueError('Public career array has duplicate IDs or incomplete job details')
        result[ident]=dict(title=row['title'],description=description,location=location,url=url,apply=apply)
    return result


class PublicCareerJSONAdapter:
    def __init__(self,kind):self.kind=kind
    async def fetch_jobs(self,company):
        from .adapters import client,request,make_job
        kind=self.kind;endpoint=ATLASSIAN if kind=='atlassian' else AVALARA
        expected='https://www.atlassian.com/company/careers/all-jobs' if kind=='atlassian' else 'https://careers.avalara.com/'
        if company.careers_url!=expected or company.ats_identifier!=kind:raise ValueError('Unverified public employer JSON configuration')
        async with client(timeout=40) as x:
            r=await request(x,'GET',expected);r.raise_for_status()
            if kind=='avalara':
                soup=BeautifulSoup(r.text,'html.parser')
                links={urljoin(str(r.url),a['href']) for a in soup.select('a[href]')}
                if 'https://app.careerpuck.com/job-board/avalara' not in links:raise ValueError('Official Avalara website no longer publishes this board')
            elif '"type":"Careers"' not in r.text:raise ValueError('Official Atlassian careers application is missing')
            r=await request(x,'GET',endpoint);r.raise_for_status();first=r.json();found=records(first,kind)
            # Neither source exposes backend pagination here: public UI receives
            # the whole array and filters/slices it locally. All descriptions are
            # embedded. iCIMS updatedDate and Careerpuck import-time postedAt are
            # not demonstrated original employer posting dates: leave unknown.
            jobs=[make_job(ident,item['title'],company.name,item['location'],item['description'],kind,'company_career',item['url'],item['apply'],expected)
                  for ident,item in found.items()]
            r=await request(x,'GET',endpoint);r.raise_for_status()
            if records(r.json(),kind)!=found:raise SnapshotChanged('Complete public career array changed during collection')
        return jobs,len(found)
