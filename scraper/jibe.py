"""Complete public Jibe listings derived from the employer's linked search JS.

The application publishes GET /api/jobs with page/limit/internal/country and
GET api/jobs/{slug}/{language}. Use the live HTML tenant identity and public
country facets; never infer countries from locales or guess ATS board tokens.
"""
import asyncio
import json
import re
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged


def board_identity(text, identifier):
    m=re.search(r'window\._jibe\s*=\s*(\{[^;]+\})',text)
    if not m or json.loads(m[1]).get('cid')!=identifier:
        raise ValueError('Jibe current employer page does not match its registered tenant')


def listing_records(payload, page, expected=None):
    count=payload.get('count');total=payload.get('totalCount');rows=payload.get('jobs')
    if type(count) is not int or type(total) is not int or not 0<=count<=2000 or total!=count or not isinstance(rows,list):
        raise ValueError('Jibe listing has incomplete language scope, invalid totals or exceeds its bounded scan')
    if expected is not None and count!=expected:raise SnapshotChanged('Jibe advertised count changed during pagination')
    if len(rows)!=min(20,max(0,count-(page-1)*20)):
        raise ValueError('Jibe listing page is truncated or has an unexpected page length')
    records={}
    for entry in rows:
        row=entry.get('data') or {};identifier=row.get('slug');language=row.get('language')
        if (not isinstance(identifier,str) or not re.fullmatch(r'[\w.-]+',identifier) or identifier in records
                or not isinstance(language,str) or not re.fullmatch(r'[a-z]{2}-[a-z]{2}',language)
                or not row.get('title') or row.get('internal') is not False or row.get('searchable') is not True):
            raise ValueError('Jibe public listing has duplicate IDs, internal jobs or malformed records')
        records[identifier]=row
    return count,records


def detail_record(payload,row,tenant):
    if not isinstance(payload,dict) or payload.get('client_code')!=tenant:
        raise ValueError('Jibe detail belongs to another employer tenant')
    if any(payload.get(k)!=row.get(k) for k in ['slug','req_id','title','language','brand']):
        raise ValueError('Jibe detail does not match its listed job identity')
    if payload.get('internal') is not False or payload.get('searchable') is not True:
        raise SnapshotChanged('Jibe job ceased to be public during collection')
    # The search UI concatenates primary and additional display locations.
    # Detail returns primary separately; reconcile those actual locations.
    def display(*parts):return ', '.join(str(v) for v in parts if v)
    primary={payload.get('full_location') or '',
             display(payload.get('city'),payload.get('state'),payload.get('country')),
             display(payload.get('city'),payload.get('state') or payload.get('country'))}
    # A listing can expose only state/country while detail supplies the city.
    # Accept that broader display when published city/state fields are absent or match the detail.
    if (row.get('city') in (None,'',payload.get('city')) and
            row.get('state') in (None,'',payload.get('state'))):
        primary.update({display(payload.get('state'),payload.get('country')),display(payload.get('country'))})
    options=[{v.strip() for v in primary if v.strip()}]
    for loc in payload.get('additional_locations') or []:
        if not isinstance(loc,dict):raise ValueError('Jibe additional location schema changed')
        # Employers select either region or country for their display text.
        # Match only strings built from the actual published address fields.
        rendered={loc.get('full_location') or '',
                  display(loc.get('city'),loc.get('state'),loc.get('country')),
                  display(loc.get('city'),loc.get('state') or loc.get('country')),
                  display(loc.get('city'),loc.get('country'))}
        options.append({v.strip() for v in rendered if v.strip()})
    listed={v.strip() for v in (row.get('full_location') or '').split(';') if v.strip()}
    if (payload.get('country')!=row.get('country') or
            any(not (variants & listed) for variants in options) or
            not listed.issubset(set().union(*options))):
        raise SnapshotChanged(f"Jibe location discrepancy {row['slug']}: listed={sorted(listed)!r}; actual={options!r}")
    from .adapters import clean
    if not clean(payload.get('description')):raise ValueError('Jibe full job detail omitted employer requirements')
    return payload


def job_location(job):
    from .adapters import location_text
    primary=job.get('full_location') or location_text(job.get('city'),job.get('state'),job.get('country'))
    other=[]
    for loc in job.get('additional_locations') or []:
        if isinstance(loc,dict):
            other.append(loc.get('full_location') or location_text(loc.get('city'),loc.get('state'),loc.get('country')))
        elif isinstance(loc,str):other.append(loc)
    return location_text(primary,other)


class JibeCareerAdapter:
    async def fetch_jobs(self,company):
        from .adapters import clean,client,make_job,request
        parts=company.ats_identifier.split('|');tenant=parts[0];scope=parts[1] if len(parts)==2 else None
        country=scope if scope=='India' else None
        brand=scope.removeprefix('brand=') if scope and scope.startswith('brand=') else None
        if len(parts)>2 or not re.fullmatch(r'[\w-]+',tenant) or (scope is not None and scope!='India' and not brand):
            raise ValueError('Invalid evidence-derived Jibe employer configuration')
        parsed=urlsplit(company.careers_url)
        if parsed.scheme!='https' or parsed.username or parsed.password:raise ValueError('Jibe requires the official HTTPS employer board')
        origin=f'https://{parsed.netloc}';endpoint=origin+'/api/jobs'
        async with client(timeout=40) as x:
            board=await request(x,'GET',company.careers_url);board.raise_for_status();board_identity(board.text,tenant)
            soup=BeautifulSoup(board.text,'html.parser')
            assets=[urljoin(str(board.url),s['src']) for s in soup.select('script[src]') if '/search/' in s['src'] and 'main.js' in s['src']]
            if len(assets)!=1:raise ValueError('Jibe current board omitted its public search application')
            asset=await request(x,'GET',assets[0]);asset.raise_for_status()
            if 'this.http.get("/api/jobs"' not in asset.text or 'searchJobBySlug' not in asset.text:
                raise ValueError('Jibe public script no longer verifies the registered endpoints')
            params=dict(page=1,limit=20,internal='false')
            if country or brand:
                probe=await request(x,'GET',endpoint,params=params);probe.raise_for_status();data=probe.json()
                facets=data.get('filter',{}).get('facetList',{}).get('country',[])
                if country and not any(v.get('term')==country for v in facets):
                    raise ValueError('Jibe employer did not publish the requested country facet; zero is unverified')
                if country:params['country']=country
                if brand:
                    brands=data.get('filter',{}).get('brands',{}).get('all',[])
                    if not any(v.get('brand')==brand for v in brands):raise ValueError('Jibe requested brand was not published by employer')
                    params['brand']=brand
            found={};total=None;first=None
            for page in range(1,101):
                params['page']=page
                r=await request(x,'GET',endpoint,params=params);r.raise_for_status()
                count,rows=listing_records(r.json(),page,total);total=count
                if found.keys() & rows.keys():raise ValueError('Jibe pagination repeated a unique job ID')
                if brand and any(row.get('brand')!=brand for row in rows.values()):raise ValueError('Jibe brand facet includes another employer')
                if first is None:first=rows
                found.update(rows)
                if len(found)==total:break
            else:raise ValueError('Jibe exceeded bounded complete pagination')
            gate=asyncio.Semaphore(3)
            async def convert(row):
                url=f"{endpoint}/{row['slug']}/{row['language']}"
                async with gate:r=await request(x,'GET',url)
                if r.status_code in (404,410):raise SnapshotChanged('Jibe listed detail disappeared during collection')
                r.raise_for_status();job=detail_record(r.json(),row,tenant)
                countries={job.get('country')} | {v.get('country') for v in job.get('additional_locations') or [] if isinstance(v,dict)}
                if country and country not in countries:raise ValueError('Jibe country facet includes a job with no published requested-country location')
                description=clean(' '.join(job.get(k) or '' for k in ['description','qualifications','responsibilities','benefits']))
                public=f"{origin}/jobs/{row['slug']}?lang={row['language']}"
                return make_job(row['slug'],job['title'],company.name,job_location(job),description,
                                'jibe','company_career',public,job.get('apply_url') or public,
                                company.careers_url,posting=job.get('posted_date'))
            jobs=await asyncio.gather(*(convert(row) for row in found.values()))
            params['page']=1;r=await request(x,'GET',endpoint,params=params);r.raise_for_status()
            _,check=listing_records(r.json(),1,total)
            if check!=first:raise SnapshotChanged('Jibe first public page changed during complete detail scan')
        return jobs,len(found)
