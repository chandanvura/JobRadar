"""NetApp's published TalentBrew AJAX listing and every public job detail."""
import asyncio
import re
from urllib.parse import urljoin,urlsplit,unquote
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

BOARD='https://careers.netapp.com/search-jobs'


def listing(text,expected=None,page=1):
    soup=BeautifulSoup(text,'html.parser');search=soup.select_one('#search-results')
    if not search:raise ValueError('NetApp omitted its published search results')
    def integer(key):
        raw=search.get('data-'+key,'')
        if not raw.isdigit():raise ValueError('NetApp omitted valid '+key)
        return int(raw)
    total=integer('total-results');pages=integer('total-pages');current=integer('current-page');size=integer('records-per-page')
    if total>2000 or not 1<=size<=100 or pages!=max(1,(total+size-1)//size) or current!=page:
        raise ValueError('NetApp advertised invalid or unbounded pagination')
    if expected is not None and (total,pages,size)!=expected:raise SnapshotChanged('NetApp advertised pagination changed')
    container=soup.select_one('#search-results-list')
    if not container:raise ValueError('NetApp omitted its public job list')
    rows={}
    for a in container.select('a[data-job-id][href]'):
        ident=a['data-job-id'];url=urljoin(BOARD,a['href']);parts=urlsplit(url)
        if parts.scheme!='https' or parts.hostname!='careers.netapp.com' or not parts.path.endswith('/27600/'+ident):
            raise ValueError('NetApp job link has another employer or ID')
        heading=a.select_one('h2,h3');title=(heading or a).get_text(' ',strip=True)
        record=dict(url=url,title=title)
        if ident in rows and rows[ident]!=record:raise ValueError('NetApp repeats conflicting job records')
        rows[ident]=record
    if len(rows)!=min(size,max(0,total-(page-1)*size)):
        raise ValueError('NetApp page is truncated')
    return (total,pages,size),rows,search


def detail(text,item):
    from .adapters import clean,jsonld_objects,location_text
    soup=BeautifulSoup(text,'html.parser');records=list(jsonld_objects(soup))
    if len(records)!=1:raise ValueError('NetApp detail omitted one unambiguous JobPosting')
    job=records[0];url=job.get('url') or '';parts=urlsplit(url)
    org=job.get('hiringOrganization') or {}
    if (parts.hostname!='careers.netapp.com' or unquote(parts.path)!=unquote(urlsplit(item['url']).path)
            or org.get('name')!='NetApp' or clean(job.get('title')).casefold()!=item['title'].casefold()):
        raise ValueError('NetApp detail does not match its listed employer and job identity')
    description=clean(job.get('description'))
    if not description or description.upper()=='UNAVAILABLE':raise ValueError('NetApp omitted full job requirements')
    locations=job.get('jobLocation') or []
    if not isinstance(locations,list):locations=[locations]
    addresses=[v.get('address') or {} for v in locations if isinstance(v,dict)]
    location=location_text([[a.get(k) for k in ['addressLocality','addressRegion','addressCountry']]
                            for a in addresses if isinstance(a,dict)])
    posted=job.get('datePosted')
    if isinstance(posted,str) and re.fullmatch(r'\d{4}-\d{1,2}-\d{1,2}',posted):
        y,m,d=map(int,posted.split('-'));posted=f'{y:04d}-{m:02d}-{d:02d}'
    return dict(title=job['title'],description=description,location=location,posted=posted)


class NetAppCareerAdapter:
    async def fetch_jobs(self,company):
        from .adapters import client,request,make_job
        if company.name!='NetApp' or company.careers_url!=BOARD or company.ats_identifier!='27600':
            raise ValueError('Unverified NetApp TalentBrew configuration')
        async with client(timeout=40) as x:
            r=await request(x,'GET',BOARD);r.raise_for_status();soup=BeautifulSoup(r.text,'html.parser')
            if (not soup.title or 'NetApp' not in soup.title.get_text() or
                    not any('/company/27600/' in s['src'] for s in soup.select('script[src]'))):
                raise ValueError('NetApp current board omitted its published employer identity')
            totals,first,search=listing(r.text)
            endpoint=urljoin(BOARD,search.get('data-ajax-url',''))
            if endpoint!='https://careers.netapp.com/search-jobs/results':raise ValueError('NetApp current public pagination endpoint changed')
            params={key:search.get('data-'+attribute,'') for key,attribute in [('Distance','distance'),('FacetTerm','facet-term'),('FacetType','facet-type'),('SearchResultsModuleName','search-results-module-name'),('SortCriteria','sort-criteria'),('SortDirection','sort-direction'),('SearchType','search-type'),('OrganizationIds','organization-ids'),('ResultsType','results-type')]}
            params.update(RecordsPerPage=totals[2],Keywords='',Location='',ShowRadius='false',IsPagination='True',ActiveFacetID=0)
            found=dict(first)
            for page in range(2,totals[1]+1):
                params['CurrentPage']=page;r=await request(x,'GET',endpoint,params=params,headers={'X-Requested-With':'XMLHttpRequest'});r.raise_for_status();payload=r.json()
                if not isinstance(payload.get('results'),str):raise ValueError('NetApp omitted the public AJAX result body')
                _,rows,_=listing(payload['results'],totals,page)
                if rows.keys() & found.keys():raise ValueError('NetApp pagination repeated unique IDs')
                found.update(rows)
            if len(found)!=totals[0]:raise ValueError('NetApp complete listing does not reconcile')
            gate=asyncio.Semaphore(3)
            async def convert(ident,item):
                async with gate:r=await request(x,'GET',item['url'])
                if r.status_code in (404,410):raise SnapshotChanged('NetApp listed detail disappeared')
                r.raise_for_status();job=detail(r.text,item)
                return make_job(ident,job['title'],company.name,job['location'],job['description'],'netapp','company_career',item['url'],item['url'],BOARD,posting=job['posted'])
            jobs=await asyncio.gather(*(convert(ident,item) for ident,item in found.items()))
            r=await request(x,'GET',BOARD);r.raise_for_status();_,check,_=listing(r.text,totals)
            if check!=first:raise SnapshotChanged('NetApp first page changed during complete detail collection')
        return jobs,len(found)
