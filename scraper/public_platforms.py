"""Collectors for structured data served by public employer career sites."""
import asyncio
import json
import re
from urllib.parse import urlparse



def script_json(text, marker):
    match=re.search(marker, text)
    if not match:
        raise ValueError('Public career page is missing its structured data')
    value=json.JSONDecoder().raw_decode(text[match.end():].lstrip())[0]
    if not isinstance(value, dict):
        raise ValueError('Public career page returned an unexpected data shape')
    return value


def phenom_config(text, page_url, identifier):
    config=script_json(text, r'\bphApp\s*=\s*phApp\s*\|\|\s*')
    if config.get('refNum')!=identifier:
        raise ValueError('Phenom employer identifier does not match the official page')
    base=config.get('baseUrl','')
    endpoint=config.get('widgetApiEndpoint','')
    host=urlparse(page_url).hostname
    if any(urlparse(u).scheme!='https' or urlparse(u).hostname!=host for u in (base,endpoint)):
        raise ValueError('Phenom public endpoints must belong to the employer career host')
    if urlparse(endpoint).path!='/widgets':
        raise ValueError('Unexpected Phenom public search endpoint')
    return config


def phenom_location(item):
    from .adapters import location_text
    return location_text(item.get('location'),item.get('cityStateCountry'),item.get('multi_location'),item.get('multi_location_array'))


class PhenomCareerAdapter:
    """Use the same public search widget as the employer's careers UI."""
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, likely_target, make_job, request
        async with client(timeout=45) as x:
            page=await request(x,'GET',company.careers_url)
            page.raise_for_status()
            config=phenom_config(page.text,str(page.url),company.ats_identifier)
            jobs=[]; offset=0; seen=set()
            while offset<2000:
                payload={'ddoKey':'refineSearch','country':config['country'],'lang':'en',
                         'locale':config['locale'],'deviceType':'desktop','refNum':config['refNum'],
                         'from':offset,'size':50,'keywords':'','selected_fields':{'country':['India','IND','INDIA','IN']},
                         'all_fields':[],'jobs':True,'counts':True,'pageName':'search-results','siteType':'external'}
                response=await request(x,'POST',config['widgetApiEndpoint'],json=payload)
                response.raise_for_status()
                result=response.json().get('refineSearch',{})
                batch=result.get('data',{}).get('jobs')
                if result.get('status') not in (200,'success') or not isinstance(batch,list):
                    raise ValueError('Phenom public search returned an unexpected schema')
                if not batch: break
                ids={str(item.get('jobSeqNo') or '') for item in batch}
                if '' in ids or ids & seen:
                    raise ValueError('Phenom public search pagination repeated or omitted job identifiers')
                seen.update(ids); jobs.extend(batch); offset+=len(batch)
                if offset>=int(result.get('totalHits',offset)): break
            else:
                raise ValueError('Phenom India search exceeded the bounded scan')
            semaphore=asyncio.Semaphore(6)
            missing_details=[]
            async def convert(item):
                if not likely_target(item.get('title',''),phenom_location(item)): return None
                if item.get('visibilityType','').lower() in {'private','internal'}: return None
                sequence=item['jobSeqNo']
                if not re.fullmatch(r'[\w.-]+',sequence):
                    raise ValueError('Invalid public Phenom job identifier')
                url=config['baseUrl'].rstrip('/')+'/job/'+sequence
                async with semaphore:
                    detail=await cached_get(x,url)
                if detail.status_code in (404,410): return None
                detail.raise_for_status()
                data=script_json(detail.text,r'\bphApp\.ddo\s*=\s*').get('jobDetail',{})
                job=data.get('data',{}).get('job',{})
                if not job or job.get('jobSeqNo')!=sequence:
                    raise ValueError('Phenom detail did not match its public listing')
                if job.get('visibilityType','').lower() in {'private','internal'}: return None
                description=clean(job.get('description',''))
                if not description:
                    missing_details.append(sequence)
                    return None
                # Creation/ingestion, refresh and expiry times do not establish posting age.
                posting=job.get('postedDate') or job.get('atsPostedDate') or item.get('postedDate')
                return make_job(str(job.get('jobId') or sequence),job.get('title') or item['title'],
                                company.name,phenom_location(job),description,'phenom','company_career',
                                url,url,company.careers_url,posting=posting)
            converted=await asyncio.gather(*(convert(item) for item in jobs))
        from .models import JobBatch
        warning=(f'Limited coverage: {len(missing_details)} relevant public job details lack an employer description'
                 if missing_details else None)
        return JobBatch([job for job in converted if job],warning),len(jobs)


class WorkableCareerAdapter:
    """Read published vacancies through the public Workable job-board interface."""
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, likely_target, location_text, make_job, request
        slug=company.ats_identifier
        if not re.fullmatch(r'[\w-]+',slug):
            raise ValueError('Invalid Workable employer account')
        base='https://apply.workable.com'
        found={}; tokens=set(); token=None
        async with client(timeout=35) as x:
            for _ in range(100):
                payload={'query':'','location':[],'department':[],'worktype':[],'remote':[]}
                if token: payload['token']=token
                response=await request(x,'POST',f'{base}/api/v3/accounts/{slug}/jobs',json=payload)
                response.raise_for_status(); data=response.json()
                batch=data.get('results')
                if not isinstance(batch,list):
                    raise ValueError('Workable public listing returned an unexpected schema')
                if any(not j.get('shortcode') or j['shortcode'] in found for j in batch):
                    raise ValueError('Workable public listing repeated or omitted job identifiers')
                for item in batch:
                    found[item['shortcode']]=item
                token=data.get('nextPage')
                if not token: break
                if not batch or not isinstance(token,str) or token in tokens:
                    raise ValueError('Workable public listing repeated its pagination token')
                tokens.add(token)
            else:
                raise ValueError('Workable public listing exceeded the bounded scan')
            semaphore=asyncio.Semaphore(6)
            def location(item):
                return location_text(item.get('location'),[entry for entry in item.get('locations',[]) if not isinstance(entry,dict) or not entry.get('hidden')])
            async def convert(item):
                if item.get('isInternal') or item.get('state')!='published': return None
                if not likely_target(item.get('title',''),location(item)): return None
                shortcode=item['shortcode']
                if not re.fullmatch(r'[\w-]+',shortcode):
                    raise ValueError('Invalid Workable public job identifier')
                async with semaphore:
                    response=await cached_get(x,f'{base}/api/v2/accounts/{slug}/jobs/{shortcode}')
                if response.status_code in (404,410): return None
                response.raise_for_status(); job=response.json()
                if job.get('shortcode')!=shortcode or job.get('isInternal') or job.get('state')!='published':
                    raise ValueError('Workable detail did not match its public listing')
                description=' '.join(clean(job.get(k,'')) for k in ('description','requirements','benefits')).strip()
                if not description:
                    raise ValueError('Workable detail is missing its full employer description')
                url=f'{base}/{slug}/j/{shortcode}/'
                return make_job(shortcode,job.get('title') or item['title'],company.name,location(job),description,
                                'workable','company_career',url,url,company.careers_url,posting=job.get('published'))
            converted=await asyncio.gather(*(convert(item) for item in found.values()))
        return [job for job in converted if job],len(found)
