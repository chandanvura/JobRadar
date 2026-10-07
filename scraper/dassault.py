"""Published Dassault career XML and complete first-party JobPosting details."""
import asyncio
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

BOARD='https://www.3ds.com/careers/jobs'
ENDPOINT='https://www.3ds.com/apisearch/card_search_api'
PARAMS=[('lang','en'),('r','f/card_content_type/career'),('r','f/card_content_categories_facet/cards language/en')]


def listing(text, offset, expected=None):
    root=ET.fromstring(text)
    if root.tag!='{exa:com.exalead.search.v10}Answer' or root.get('estimated')!='false':
        raise ValueError('Dassault search omitted an exact XML result count')
    total=int(root.attrib['nhits'])
    if total!=int(root.attrib['nmatches']) or int(root.attrib['start'])!=offset or not 0<=total<=2000:
        raise ValueError('Dassault search returned invalid pagination')
    if expected is not None and total!=expected:raise SnapshotChanged('Dassault advertised count changed')
    rows={}
    for hit in root.findall('.//{*}Hit'):
        fields={}
        for meta in hit.findall('.//{*}Meta'):
            key=meta.get('name');value=meta.findtext(".//{*}MetaString[@name='value']")
            if value is not None:
                if key in fields and fields[key]!=value:raise ValueError('Dassault XML has conflicting fields')
                fields[key]=value
        ident=fields.get('card_id','');url=fields.get('content_cta_1_url','');parts=urlsplit(url)
        if (not ident.isdigit() or ident in rows or fields.get('content_type')!='career'
                or fields.get('content_lang')!='en' or parts.scheme!='https' or parts.hostname!='www.3ds.com'
                or not parts.path.startswith('/careers/jobs/') or not parts.path.endswith('-'+ident)):
            raise ValueError('Dassault listing omitted its unique employer job identity')
        rows[ident]={'url':url,'title':fields.get('content_title','')}
    if len(rows)!=min(10,max(0,total-offset)):raise ValueError('Dassault XML page is truncated')
    return total,rows


def detail(text, ident, item):
    from .adapters import clean,jsonld_objects,location_text
    jobs=list(jsonld_objects(BeautifulSoup(text,'html.parser')))
    if len(jobs)!=1:raise ValueError('Dassault detail omitted one unambiguous JobPosting')
    job=jobs[0];org=job.get('hiringOrganization') or {}
    if (str(job.get('identifier'))!=ident or org.get('name')!='Dassault Systèmes'
            or org.get('sameAs')!='https://www.3ds.com/'
            or clean(job.get('title')).casefold()!=clean(item['title']).casefold()):
        raise ValueError('Dassault detail differs from its employer and listing identity')
    description=clean(job.get('description'))
    if not description:raise ValueError('Dassault omitted full job requirements')
    places=job.get('jobLocation') or []
    if not isinstance(places,list):places=[places]
    addresses=[p.get('address') or {} for p in places if isinstance(p,dict)]
    location=location_text([[a.get(k) for k in ('addressLocality','addressRegion','addressCountry')] for a in addresses])
    return dict(title=job['title'],description=description,location=location,posted=job.get('datePosted'))


class DassaultCareerAdapter:
    async def fetch_jobs(self,company):
        from .adapters import client,request,make_job
        if company.name!='Dassault Systemes' or company.careers_url!=BOARD or company.ats_identifier!='career-en':
            raise ValueError('Unverified Dassault career configuration')
        async with client(timeout=40) as x:
            r=await request(x,'GET',BOARD);r.raise_for_status()
            if 'https://www.3ds.com/apisearch' not in r.text or 'card_content_type' not in r.text:
                raise ValueError('Dassault board omitted its published career search configuration')
            async def page(offset,expected=None):
                response=await request(x,'GET',ENDPOINT,params=PARAMS+[('start',str(offset))]);response.raise_for_status()
                return listing(response.text,offset,expected)
            total,first=await page(0);found=dict(first)
            for offset in range(10,total,10):
                _,rows=await page(offset,total)
                if rows.keys() & found.keys():raise SnapshotChanged('Dassault pagination repeated job IDs')
                found.update(rows)
            if len(found)!=total:raise ValueError('Dassault listing does not reconcile with its exact total')
            gate=asyncio.Semaphore(3)
            async def convert(ident,item):
                async with gate:r=await request(x,'GET',item['url'])
                if r.status_code in (404,410):raise SnapshotChanged('Dassault listed detail disappeared')
                r.raise_for_status();job=detail(r.text,ident,item)
                return make_job(ident,job['title'],company.name,job['location'],job['description'],'dassault','company_career',item['url'],item['url'],BOARD,posting=job['posted'])
            jobs=await asyncio.gather(*(convert(ident,item) for ident,item in found.items()))
            _,check=await page(0,total)
            if check!=first:raise SnapshotChanged('Dassault first page changed while collecting details')
        return jobs,total
