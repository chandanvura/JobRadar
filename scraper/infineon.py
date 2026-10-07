"""Complete India PCSX inventory, using Infineon's published position links."""
import asyncio
import json
from urllib.parse import urljoin,urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

BOARD='https://jobs.infineon.com/careers'
DOMAIN='infineon.com'


def listing(data,offset,expected=None):
    data=data.get('data',{});total=data.get('count');batch=data.get('positions')
    if type(total) is not int or not 0<=total<=2000 or not isinstance(batch,list):
        raise ValueError('Infineon omitted a bounded exact search total')
    if expected is not None and total!=expected:raise SnapshotChanged('Infineon search count changed')
    if not batch and offset<total or offset+len(batch)>total:raise ValueError('Infineon pagination is truncated or exceeds its total')
    rows={}
    for item in batch:
        ident=str(item.get('id',''));url=urljoin(BOARD,item.get('positionUrl',''));parts=urlsplit(url)
        if (not ident.isdigit() or ident in rows or item.get('isPrivate')
                or parts.scheme!='https' or parts.hostname!='jobs.infineon.com' or parts.path!='/careers/job/'+ident):
            raise ValueError('Infineon listing has an invalid employer position identity')
        rows[ident]={'url':url,'title':item.get('name',''),'locations':item.get('locations') or [],'standardizedLocations':item.get('standardizedLocations') or []}
    return total,rows


def detail(text,item):
    from .adapters import clean,jsonld_objects,location_text
    jobs=list(jsonld_objects(BeautifulSoup(text,'html.parser')))
    if len(jobs)!=1:raise ValueError('Infineon detail omitted one JobPosting')
    job=jobs[0];org=job.get('hiringOrganization') or {}
    if (org.get('name')!='Infineon' or org.get('sameAs')!='infineon.com' or job.get('url')!=item['url']
            or clean(job.get('title')).casefold()!=clean(item['title']).casefold()):
        raise ValueError('Infineon detail differs from its employer listing identity')
    description=clean(job.get('description'))
    if not description:raise ValueError('Infineon detail omitted full job requirements')
    # PCSX exposes all locations; JobPosting may contain only one address.
    location=location_text(item['locations'],item['standardizedLocations'])
    return dict(title=job['title'],description=description,location=location,posted=job.get('datePosted'))


class InfineonCareerAdapter:
    async def fetch_jobs(self,company):
        from .adapters import client,request,make_job
        if company.name!='Infineon Technologies' or company.careers_url!=BOARD or company.ats_identifier!=DOMAIN:
            raise ValueError('Unverified Infineon public source configuration')
        async with client(timeout=40) as x:
            r=await request(x,'GET',BOARD);r.raise_for_status()
            code=BeautifulSoup(r.text,'html.parser').find('code',id='pcsx-data')
            if not code or json.loads(code.get_text()).get('domain')!=DOMAIN:
                raise ValueError('Infineon public configuration differs from its employer domain')
            async def page(offset,expected=None):
                r=await request(x,'GET','https://jobs.infineon.com/api/pcsx/search',params={'domain':DOMAIN,'query':'','location':'India','start':offset,'sort_by':'timestamp'});r.raise_for_status()
                return listing(r.json(),offset,expected)
            total,first=await page(0);found=dict(first)
            while len(found)<total:
                _,rows=await page(len(found),total)
                if rows.keys() & found.keys():raise SnapshotChanged('Infineon pagination repeated IDs')
                found.update(rows)
            gate=asyncio.Semaphore(3)
            async def convert(ident,item):
                async with gate:r=await request(x,'GET',item['url'])
                if r.status_code in (404,410):raise SnapshotChanged('Infineon listed detail disappeared')
                r.raise_for_status();job=detail(r.text,item)
                # The published timestamp has no zone: preserve its date, without inventing UTC time.
                posted=job['posted'][:10] if isinstance(job['posted'],str) else None
                return make_job(ident,job['title'],company.name,job['location'],job['description'],'infineon','company_career',item['url'],item['url'],BOARD,posting=posted)
            jobs=await asyncio.gather(*(convert(ident,item) for ident,item in found.items()))
            _,check=await page(0,total)
            if check!=first:raise SnapshotChanged('Infineon first page changed during detail collection')
        return jobs,total
