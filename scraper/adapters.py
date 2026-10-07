from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from pathlib import Path
from hashlib import sha256
import asyncio, html, json, os, re, time
import httpx
from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET
from .models import Company, Job, JobBatch
from .snapshot import SnapshotChanged

HEADERS={"User-Agent":"JobRadar/1.2 (+personal job monitor; responsible hourly polling)","Accept":"application/json,text/html;q=0.9"}
CACHE_ROOT=Path(os.getenv("JOBRADAR_HTTP_CACHE",".cache/jobradar-http"))
_DOMAIN_LIMITERS={}
def clean(value): return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",value or ""))).strip()
def client(timeout=20):
    return httpx.AsyncClient(timeout=httpx.Timeout(timeout,connect=min(timeout,8)),follow_redirects=True,headers=HEADERS,limits=httpx.Limits(max_connections=24,max_keepalive_connections=12),transport=httpx.AsyncHTTPTransport(retries=1))

def request_bucket(url):
    """Group tenant hosts by ATS family so one provider cannot be flooded."""
    parsed=urlparse(url); host=(parsed.hostname or "").lower()
    if host=="myworkdayjobs.com" or host.endswith(".myworkdayjobs.com"):
        return "workday-listings" if parsed.path.rstrip("/").endswith("/jobs") else "workday-details"
    for family in ("myworkdayjobs.com","greenhouse.io","lever.co","ashbyhq.com","smartrecruiters.com","jobvite.com"):
        if host==family or host.endswith("."+family): return family
    return host

def domain_limiter(url):
    """Bound requests per ATS family while allowing unrelated employers to overlap."""
    loop=asyncio.get_running_loop(); bucket=request_bucket(url)
    key=(id(loop),bucket)
    if key not in _DOMAIN_LIMITERS:
        if bucket=="workday-listings": setting,default="JOBRADAR_WORKDAY_LISTING_CONCURRENCY","5"
        elif bucket=="workday-details": setting,default="JOBRADAR_WORKDAY_DETAIL_CONCURRENCY","10"
        elif bucket=="jobvite.com": setting,default="JOBRADAR_JOBVITE_CONCURRENCY","1"
        else: setting,default="JOBRADAR_DOMAIN_CONCURRENCY","6"
        _DOMAIN_LIMITERS[key]=asyncio.Semaphore(int(os.getenv(setting,default)))
    return _DOMAIN_LIMITERS[key]

async def request(x,method,url,**kwargs):
    # Only read operations may be replayed: Workday's search is a POST.
    parsed=urlparse(url)
    replayable=method.upper() in {"GET","HEAD"} or (
        method.upper()=="POST" and (parsed.hostname or "").endswith(".myworkdayjobs.com")
        and parsed.path.startswith("/wday/cxs/") and parsed.path.endswith("/jobs"))
    for attempt in range(3 if replayable else 1):
        try:
            async with domain_limiter(url):
                response=await x.request(method,url,**kwargs)
        except (httpx.TimeoutException,httpx.NetworkError):
            if not replayable or attempt==2: raise
        else:
            if response.status_code not in {500,502,503,504,520,521,522,523,524} or not replayable or attempt==2:
                return response
            await response.aclose()
        # Release the provider semaphore while backing off; never retry 403/429.
        await asyncio.sleep(0.5 * 2**attempt)

def _cache_path(url): return CACHE_ROOT/(sha256(url.encode()).hexdigest()+".json")

async def cached_get(x,url,ttl_hours=30):
    """Cache immutable job-detail pages; listing feeds are always fetched live."""
    path=_cache_path(url)
    try:
        saved=json.loads(path.read_text(encoding="utf-8"))
        if time.time()-float(saved["saved_at"]) < ttl_hours*3600:
            return httpx.Response(200,text=saved["text"],headers=saved.get("headers",{}),request=httpx.Request("GET",url))
    except (OSError,ValueError,KeyError,TypeError,json.JSONDecodeError):
        pass
    response=await request(x,"GET",url)
    if response.status_code==200:
        try:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(json.dumps({"saved_at":time.time(),"text":response.text,"headers":{"content-type":response.headers.get("content-type","")}}),encoding="utf-8")
        except OSError:
            pass
    return response
def epoch_ms(value):
    try: return datetime.fromtimestamp(int(value)/1000,tz=timezone.utc).isoformat()
    except (TypeError,ValueError,OSError): return None
def likely_role(title):
    return bool(re.search(r"\b(engineer|developer|devops|devsecops|sre|sde|swe|sdet|qa|quality assurance|platform|cloud|infrastructure|operations|support|release|build|site reliability|security|cybersecurity|data|analytics|etl|graduate|trainee|associate|intern|internship|apprentice|co[ -]?op)\b",str(title),re.I))

def likely_target(title, location):
    return bool(likely_role(title) and re.search(r"\b(bangalore|bengaluru|hyderabad)\b",str(location),re.I))

def location_text(*values):
    """Flatten ATS primary and secondary locations without guessing a city."""
    found=[]
    def add(value):
        if isinstance(value,str) and value.strip(): found.append(value.strip())
        elif isinstance(value,list):
            for item in value: add(item)
        elif isinstance(value,dict):
            for key in ("name","Name","location","city","region","country","addressLocality"):
                if key in value: add(value.get(key))
    for value in values: add(value)
    return " · ".join(dict.fromkeys(found))

def iso_date(value):
    if not value: return None
    try:
        parsed=datetime.fromisoformat(str(value).replace("Z","+00:00"))
        if parsed.tzinfo is None: parsed=parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat()
    except (TypeError,ValueError): return None

def parse_posting(value, now=None):
    """Return exact timestamps separately from employer-reported relative labels.

    "Posted today" must never become "posted just now". Relative labels carry an
    age estimate for policy evaluation while the UI preserves the original label.
    """
    if not value: return None,None,"unknown",None
    raw=clean(str(value)); exact=iso_date(raw)
    if exact:
        precision="day" if re.fullmatch(r"\d{4}-\d{2}-\d{2}",raw) else "exact"
        return exact,None,precision,None
    reference=now or datetime.now(timezone.utc)
    label=raw.lower()
    if re.search(r"\b(posted\s+)?today\b",label):
        return None,"Posted today","day",None
    match=re.search(r"\b(\d+)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\s+ago\b",label)
    if match:
        amount=int(match.group(1)); unit=match.group(2)
        if unit.startswith(("second","sec")): hours=amount/3600
        elif unit.startswith(("minute","min")): hours=amount/60
        else: hours=float(amount)
        return None,raw,"relative",hours
    if re.search(r"\bfew\s+hours?\s+ago\b",label):
        return None,"Posted a few hours ago","relative",3.0
    return None,raw,"unknown",None

def parse_posted_at(value, now=None):
    """Compatibility helper returning only a genuine employer timestamp."""
    return parse_posting(value,now)[0]

def posting_fields(value, now=None):
    return parse_posting(value,now)

def make_job(*args, posting=None, **kwargs):
    job=Job(*args,**kwargs)
    job.posted_at,job.posted_label,job.posted_precision,job.reported_age_hours=posting_fields(posting)
    return job

class JobSource(ABC):
    @abstractmethod
    async def fetch_jobs(self, company: Company) -> list[Job]: ...

class GreenhouseAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await request(x,"GET",f"https://boards-api.greenhouse.io/v1/boards/{c.ats_identifier}/jobs",params={"content":"true"}); response.raise_for_status(); data=response.json()
            async def convert(j):
                url=j.get("absolute_url",c.careers_url); posting=None
                location=location_text(j.get("location"),j.get("offices"))
                # The list omits posting dates; the public detail API provides
                # first_published, including boards with JavaScript-only job pages.
                if likely_target(j.get("title",""),location):
                    try:
                        detail=await cached_get(x,f"https://boards-api.greenhouse.io/v1/boards/{c.ats_identifier}/jobs/{j['id']}")
                        if detail.status_code==200:
                            posting=detail.json().get("first_published")
                        if not posting:
                            page=await cached_get(x,url)
                            if page.status_code==200:
                                item=next(jsonld_objects(BeautifulSoup(page.text,"html.parser")),None)
                                if item: posting=item.get("datePosted")
                    except (httpx.HTTPError,ValueError):
                        pass
                return make_job(str(j["id"]),j["title"],c.name,location,clean(j.get("content","")),"greenhouse","company_career",url,url,c.careers_url,posting=posting)
            jobs=list(await asyncio.gather(*(convert(j) for j in data.get("jobs",[]))))
            return jobs,len(data.get("jobs",[]))

class LeverAdapter(JobSource):
    async def fetch_jobs(self,c):
        parts=c.ats_identifier.split("|")
        slug=parts[-1]
        region="eu." if len(parts)==2 and parts[0]=="eu" else ""
        if not re.fullmatch(r"[\w.-]+",slug) or (len(parts)>1 and not region):
            raise ValueError("Invalid public Lever board identifier")
        async with client() as x:
            response=await request(x,"GET",f"https://api.{region}lever.co/v0/postings/{slug}",params={"mode":"json"}); response.raise_for_status(); data=response.json()
        if not isinstance(data,list): raise ValueError("Lever public board returned an unexpected schema")
        identifiers=[j.get('id') for j in data]
        if any(not isinstance(i,str) or not i for i in identifiers) or len(set(identifiers))!=len(data):
            raise ValueError('Lever public board omitted or repeated job identifiers')
        def description(j):
            sections=[j.get('descriptionPlain') or j.get('description','')]
            for section in j.get('lists') or []:
                sections.extend([section.get('text',''),section.get('content','')])
            sections.append(j.get('additionalPlain') or j.get('additional',''))
            return clean(' '.join(sections))
        jobs=[make_job(str(j["id"]),j["text"],c.name,location_text(j.get("categories",{}).get("location",""),j.get("categories",{}).get("allLocations",[])),description(j),"lever","company_career",j.get("hostedUrl",c.careers_url),j.get("applyUrl") or j.get("hostedUrl",c.careers_url),c.careers_url,posting=epoch_ms(j.get("createdAt"))) for j in data]
        missing=sum(likely_role(job.title) and not job.description for job in jobs)
        warning=f'Limited coverage: {missing} relevant Lever jobs lack full requirements' if missing else None
        return JobBatch(jobs,warning),len(data)

class AshbyAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await request(x,"GET",f"https://api.ashbyhq.com/posting-api/job-board/{c.ats_identifier}"); response.raise_for_status(); data=response.json()
        listed=[j for j in data.get("jobs",[]) if j.get("isListed",True)]
        jobs=[make_job(str(j.get("id") or j["jobUrl"]),j["title"],c.name,location_text(j.get("location",""),j.get("secondaryLocations",[])),clean(j.get("descriptionPlain") or j.get("descriptionHtml","")),"ashby","company_career",j.get("jobUrl",c.careers_url),j.get("applyUrl") or j.get("jobUrl",c.careers_url),c.careers_url,posting=j.get("publishedAt")) for j in listed]
        return jobs,len(listed)

def amazon_location(item):
    locations=[item.get("location"),item.get("normalized_location")]
    for value in item.get("locations") or []:
        if isinstance(value,str):
            try: value=json.loads(value)
            except (ValueError,TypeError): continue
        if isinstance(value,dict):
            locations.extend([value.get("location"),value.get("normalizedLocation"),value.get("city")])
    return location_text(*locations)

class AmazonCareerAdapter(JobSource):
    """Read the employer's public search feed, scoped to our target cities."""
    async def fetch_jobs(self,c):
        found={}
        async with client(timeout=45) as x:
            for city in ("Bengaluru","Hyderabad"):
                offset=0; seen=set()
                while offset<2000:
                    response=await request(x,"GET","https://www.amazon.jobs/en/search.json",
                        params={"country":"IND","city":city,"result_limit":100,"offset":offset,"sort":"recent"},
                        headers={"Accept-Encoding":"gzip, deflate"})
                    response.raise_for_status(); data=response.json()
                    if data.get("error") or not isinstance(data.get("jobs"),list):
                        raise ValueError("Amazon public search returned an unexpected schema")
                    batch=data["jobs"]
                    if not batch: break
                    ids={str(j.get("id_icims") or j.get("id") or j.get("job_path")) for j in batch}
                    if ids & seen: raise ValueError("Amazon public search pagination repeated jobs")
                    seen.update(ids)
                    for item in batch:
                        external=str(item.get("id_icims") or item.get("id") or item.get("job_path"))
                        found[external]=item
                    offset+=len(batch)
                    if offset>=int(data.get("hits",offset)) or len(batch)<100: break
                else:
                    raise ValueError("Amazon target-city search exceeded the bounded scan; narrow the query")
        jobs=[]
        for external,item in found.items():
            location=amazon_location(item)
            if not likely_target(item.get("title",""),location): continue
            path=item.get("job_path") or ""
            if not path.startswith("/en/jobs/"): continue
            url=urljoin("https://www.amazon.jobs",path)
            description=" ".join(clean(item.get(k,"")) for k in ("description","basic_qualifications","preferred_qualifications"))
            posting=None
            try: posting=datetime.strptime(clean(item.get("posted_date","")),"%B %d, %Y").date().isoformat()
            except ValueError: pass
            jobs.append(make_job(external,item.get("title",""),c.name,location,description,"amazon","company_career",url,url,c.careers_url,posting=posting))
        return jobs,len(found)

class SmartRecruitersAdapter(JobSource):
    async def fetch_jobs(self,c):
        base=f"https://api.smartrecruiters.com/v1/companies/{c.ats_identifier}/postings"
        async with client() as x:
            content=[]; offset=0
            while offset<1000:
                response=await request(x,"GET",base,params={"limit":100,"offset":offset}); response.raise_for_status(); data=response.json()
                batch=data.get("content",[]); content.extend(batch)
                if len(batch)<100: break
                offset+=100
            semaphore=asyncio.Semaphore(8)
            async def convert(item):
                item_location=item.get("location") or {}
                location_hint=", ".join(str(item_location.get(k,"")) for k in ("city","region","country") if item_location.get(k))
                if not likely_target(item.get("name",""),location_hint): return None
                async with semaphore: detail_response=await cached_get(x,f"{base}/{item['id']}")
                if detail_response.status_code != 200: return None
                detail=detail_response.json(); sections=detail.get("jobAd",{}).get("sections",{})
                description=" ".join(clean((sections.get(k) or {}).get("text","")) for k in ("jobDescription","qualifications","additionalInformation"))
                location=", ".join(x for x in ((detail.get("location") or {}).get("city"),(detail.get("location") or {}).get("region"),(detail.get("location") or {}).get("country")) if x)
                public_url=f"https://jobs.smartrecruiters.com/{c.ats_identifier}/{item['id']}"
                return make_job(str(item["id"]),item.get("name",""),c.name,location,description,"smartrecruiters","company_career",public_url,detail.get("applyUrl") or public_url,c.careers_url,posting=item.get("releasedDate") or detail.get("releasedDate"))
            converted=await asyncio.gather(*(convert(item) for item in content))
            jobs=[job for job in converted if job]
        return jobs,len(content)

def workday_config(c):
    parsed=urlparse(c.careers_url)
    parts=[p for p in parsed.path.split("/") if p and not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?",p)]
    configured=[p.strip() for p in c.ats_identifier.split("|") if p.strip()]
    tenant=configured[0] if configured else parsed.hostname.split(".")[0]
    site=configured[1] if len(configured)>1 else (parts[0] if parts else "")
    if not parsed.hostname or not tenant or not site: raise ValueError("Workday requires a board URL and tenant|site identifier")
    return f"https://{parsed.hostname}",tenant,site

def workday_country_facets(nodes,country):
    """Prefer an exact employer-published country facet over location suffixes."""
    countries={}; locations=[]
    def visit(entries):
        for node in entries:
            parameter=node.get("facetParameter","")
            if re.sub(r"[^a-z]","",parameter.lower()).endswith("country"):
                ids=[value["id"] for value in node.get("values",[])
                     if value.get("descriptor","").casefold()==country.casefold() and value.get("id")]
                if ids: countries[parameter]=ids
            if parameter=="locations":
                locations.extend(value["id"] for value in node.get("values",[])
                                 if value.get("id") and re.search(r",\s*"+re.escape(country)+r"$",value.get("descriptor",""),re.I))
            visit(node.get("values",[]))
    visit(nodes)
    return countries or ({"locations":locations} if locations else {})

class WorkdayAdapter(JobSource):
    def __init__(self, complete=False):
        self.complete=complete

    async def fetch_jobs(self,c):
        origin,tenant,site=workday_config(c); api=f"{origin}/wday/cxs/{tenant}/{site}"
        async with client() as x:
            postings=[]; offset=0; facets={}; expected=None; identifiers=set()
            bound=2000 if self.complete else 1000
            country=c.ats_identifier.split("|")[2] if len(c.ats_identifier.split("|"))>2 else None
            if country:
                response=await request(x,"POST",f"{api}/jobs",json={"appliedFacets":{},"limit":20,"offset":0,"searchText":""})
                response.raise_for_status()
                facets=workday_country_facets(response.json().get("facets",[]),country)
                if not facets: raise ValueError("Workday does not expose the configured country locations")
            while offset < bound:
                response=await request(x,"POST",f"{api}/jobs",json={"appliedFacets":facets,"limit":20,"offset":offset,"searchText":""}); response.raise_for_status(); page=response.json()
                batch=page.get("jobPostings",[])
                if self.complete:
                    total=page.get("total")
                    if not isinstance(total,int) or isinstance(total,bool) or total<0 or total>bound:
                        raise ValueError("Workday complete listing exceeds its bound or omits its total")
                    if expected is None: expected=total
                    paths=[item.get("externalPath","") for item in batch]
                    if offset and total not in (0,expected):
                        raise SnapshotChanged(f"Workday complete pagination total changed: {expected} -> {total}")
                    if ((offset and total not in (0,expected)) or (not offset and total!=expected)
                            or len(batch)!=min(20,max(0,expected-offset))
                            or any(not path.startswith("/job/") for path in paths)
                            or len(set(paths))!=len(paths) or identifiers.intersection(paths)):
                        raise ValueError(f"Workday complete pagination changed, repeated or omitted records: offset={offset}, total={total}, expected={expected}, rows={len(batch)}, first_path={paths[0] if paths else None}")
                    identifiers.update(paths)
                postings.extend(batch)
                if len(batch)<20: break
                offset+=20
            if self.complete:
                if len(postings)!=expected:
                    raise ValueError("Workday listing does not match its complete count")
                # Workday returns total=0 on later pages to omit recounting.
                # Verify the first page again after collecting the entire list.
                check=await request(x,"POST",f"{api}/jobs",json={"appliedFacets":facets,"limit":20,"offset":0,"searchText":""})
                check.raise_for_status(); snapshot=check.json()
                if (snapshot.get("total")!=expected or [item.get("externalPath") for item in snapshot.get("jobPostings",[])]
                        !=[item.get("externalPath") for item in postings[:20]]):
                    raise SnapshotChanged("Workday complete listing changed during final verification")
            semaphore=asyncio.Semaphore(8); missing=[]
            async def convert(item):
                # Complete mode reads relevant titles even if listing locations hide
                # secondary offices; actual detail fields alone establish the city.
                relevant=likely_role(item.get("title","")) if self.complete else likely_target(item.get("title",""),item.get("locationsText",""))
                if not country and not relevant: return None
                path=item.get("externalPath")
                if not path: return None
                async with semaphore: detail_response=await cached_get(x,f"{api}{path}")
                if detail_response.status_code in (404,410):
                    if self.complete: missing.append(path)
                    return None
                if self.complete: detail_response.raise_for_status()
                elif detail_response.status_code != 200: return None
                info=detail_response.json().get("jobPostingInfo",{})
                if self.complete and (not info.get("jobDescription") or not info.get("title")):
                    raise ValueError("Workday complete detail omitted its full description or title")
                public_url=urljoin(origin,f"/{site}{path}")
                posting=item.get("postedOn") or info.get("startDate")
                location=location_text(info.get("location"),info.get("additionalLocations"),item.get("locationsText"))
                return make_job(str(info.get("jobReqId") or info.get("jobPostingId") or path),info.get("title") or item.get("title",""),c.name,location,clean(info.get("jobDescription","")),"workday","company_career",public_url,info.get("externalUrl") or public_url,c.careers_url,posting=posting)
            converted=await asyncio.gather(*(convert(item) for item in postings))
            jobs=[job for job in converted if job]
        if self.complete:
            warning=f"Limited coverage: {len(missing)} relevant Workday details disappeared during collection" if missing else None
            return JobBatch(jobs,warning),len(postings)
        return jobs,len(postings)

def jobvite_config(c):
    parsed=urlparse(c.careers_url)
    slug=next((part for part in parsed.path.split("/") if part),"")
    configured=[part.strip() for part in c.ats_identifier.split("|") if part.strip()]
    if configured: slug=configured[0]
    eid=configured[1] if len(configured)>1 else None
    if not slug: raise ValueError("Jobvite requires a board slug")
    return slug,eid

def parse_jobvite_xml(xml,company,careers_url):
    root=ET.fromstring(xml); jobs=[]
    for item in root.findall(".//job"):
        value=lambda name: clean(item.findtext(name) or "")
        title=value("title"); detail=value("detail-url"); apply=value("apply-url"); url=detail or apply
        if not title or not url: continue
        if url.startswith("http://"): url="https://"+url[7:]
        try:
            if urlparse(url).scheme!="https": continue
        except ValueError: continue
        posting=value("date") or None
        if posting:
            try: posting=datetime.strptime(posting,"%m/%d/%Y").replace(tzinfo=timezone.utc).isoformat()
            except ValueError: pass
        apply_url=apply or url
        if apply_url.startswith("http://"): apply_url="https://"+apply_url[7:]
        try:
            if urlparse(apply_url).scheme!="https": apply_url=url
        except ValueError: apply_url=url
        external=value("id") or url
        jobs.append(make_job(external,title,company,value("location"),value("description"),"jobvite","company_career",url,apply_url,careers_url,posting=posting))
    return jobs

class JobviteAdapter(JobSource):
    async def fetch_jobs(self,c):
        slug,eid=jobvite_config(c)
        async with client(timeout=45) as x:
            if not eid:
                board=await request(x,"GET",f"https://jobs.jobvite.com/{slug}",params={"fr":"true","nl":"1"}); board.raise_for_status()
                match=re.search(r"companyEId\s*[:=]\s*['\"]([A-Za-z0-9_-]{4,40})['\"]",board.text)
                if not match: raise ValueError(f"Jobvite companyEId not found for {slug}")
                eid=match.group(1)
            feed_url="https://app.jobvite.com/CompanyJobs/Xml.aspx"
            response=None
            for attempt in range(2):
                response=await request(x,"GET",feed_url,params={"c":eid})
                if response.status_code!=429: break
                if attempt==0: await asyncio.sleep(min(30,max(1,int(response.headers.get("Retry-After","30")))))
            if response is None: raise RuntimeError("Jobvite feed request did not run")
            if response.url.path.lower().endswith("/nojobs.htm"): return [],0
            response.raise_for_status(); jobs=parse_jobvite_xml(response.text,c.name,c.careers_url)
            return jobs,len(jobs)

def employer_posted_date(soup):
    """Read employer posting dates; never substitute an expiry or fetch time."""
    values=[]
    for item in jsonld_objects(soup):
        if item.get("datePosted"): values.append((item["datePosted"], ""))
    for node in soup.select('[itemprop="datePosted"]'):
        values.append((node.get("content") or node.get_text(" ",strip=True), ""))
    for label in soup.select(".joblayouttoken-label"):
        if label.get_text(" ",strip=True).lower().rstrip(": ") not in {"date","posting start date"}: continue
        value=label.find_next_sibling("span")
        if value: values.append((value.get_text(" ",strip=True),value.get("lang", "")))
    for value,locale in values:
        if iso_date(value): return value
        for pattern in ("%a %b %d %H:%M:%S %Z %Y","%b %d, %Y","%B %d, %Y"):
            try: return datetime.strptime(value,pattern).date().isoformat()
            except (ValueError,TypeError): pass
        patterns=("%m/%d/%y","%m/%d/%Y") if locale=="en-US" else ("%d/%m/%Y","%d/%m/%y") if locale=="en-GB" else ()
        for pattern in patterns:
            try: return datetime.strptime(value,pattern).date().isoformat()
            except (ValueError,TypeError): pass
    return None


def parse_public_xml(xml,company,careers_url):
    root=ET.fromstring(xml)
    if root.tag.split("}")[-1].lower() not in {"rss","jobs","joblist"}:
        raise ValueError("Expected a public RSS or XML job feed")
    jobs=[]; items=root.findall(".//item") or root.findall(".//job")
    for item in items:
        fields={node.tag.split("}")[-1]:node.text or "" for node in item}
        title=clean(fields.get("title")); url=fields.get("link") or fields.get("url")
        if not title or not url: continue
        parsed=urlparse(url)
        if parsed.scheme=="http" and parsed.hostname==urlparse(careers_url).hostname:
            url=parsed._replace(scheme="https").geturl(); parsed=urlparse(url)
        if parsed.scheme!="https" or not parsed.hostname: continue
        location=clean(fields.get("location")) or location_text(fields.get("locationCity"),fields.get("locationState"),fields.get("locationCountry"))
        if location and title.endswith(f" ({location})"): title=title[:-(len(location)+3)]
        description=clean(html.unescape(fields.get("description", "")))
        posting=fields.get("datePosted") or fields.get("publish_date")
        jobs.append(make_job(str(fields.get("id") or fields.get("guid") or url),title,company,location,description,
                             "xml","company_career",url,url,careers_url,posting=posting))
    return list({job.external_job_id:job for job in jobs}.values()),len(items)


class PublicXMLAdapter(JobSource):
    async def fetch_jobs(self,c):
        parsed=urlparse(c.ats_identifier)
        if parsed.scheme!="https" or not parsed.hostname: raise ValueError("Public XML feed requires an HTTPS URL")
        # Listings remain live. Only employer detail pages reuse the detail cache.
        async with client(timeout=45) as x:
            response=await request(x,"GET",c.ats_identifier); response.raise_for_status()
            jobs,count=parse_public_xml(response.content,c.name,c.careers_url)
            targets=[job for job in jobs if likely_target(job.title,job.location)]
            semaphore=asyncio.Semaphore(6)
            async def dated(job):
                if job.posted_at: return job
                async with semaphore:
                    try:
                        detail=await cached_get(x,job.job_url)
                        if detail.status_code==200:
                            posting=employer_posted_date(BeautifulSoup(detail.text,"html.parser"))
                            job.posted_at,job.posted_label,job.posted_precision,job.reported_age_hours=posting_fields(posting)
                    except (httpx.HTTPError,ValueError): pass
                return job
            return list(await asyncio.gather(*(dated(job) for job in targets))),count


def oracle_config(c):
    parsed=urlparse(c.careers_url)
    match=re.search(r"/sites/([\w-]+)",parsed.path)
    configured=c.ats_identifier.split("|")
    site=configured[-1] if c.ats_identifier else (match.group(1) if match else "")
    if len(configured)>1 and configured[0].lower()!=(parsed.hostname or "").lower():
        raise ValueError("Oracle identifier hostname differs from career site")
    if parsed.scheme!="https" or not parsed.hostname or not re.fullmatch(r"[\w-]+",site):
        raise ValueError("Oracle requires an official HTTPS career site and site identifier")
    return f"https://{parsed.netloc}",site


class OracleCareerAdapter(JobSource):
    async def fetch_jobs(self,c):
        origin,site=oracle_config(c); base=origin+"/hcmRestApi/resources/latest/"
        async with client(timeout=30) as x:
            postings={}; offset=0
            while offset<1000:
                params={"onlyData":"true","expand":"requisitionList.secondaryLocations",
                        "finder":f"findReqs;siteNumber={site},limit=50,offset={offset},sortBy=POSTING_DATES_DESC"}
                response=await request(x,"GET",base+"recruitingCEJobRequisitions",params=params); response.raise_for_status()
                data=response.json()
                if not isinstance(data.get("items"),list) or not data["items"]:
                    raise ValueError("Oracle career listing schema changed")
                result=data["items"][0]; batch=result.get("requisitionList")
                if not isinstance(batch,list): raise ValueError("Oracle requisition list missing")
                if not batch: break
                fresh={str(item["Id"]):item for item in batch if item.get("Id")}
                if not fresh.keys()-postings.keys(): raise ValueError("Oracle pagination repeated the same jobs")
                postings.update(fresh); offset+=len(batch)
                total=result.get("TotalJobsCount")
                if isinstance(total,int) and offset>=total: break
                if total is None and len(batch)<50: break
            semaphore=asyncio.Semaphore(6)
            async def convert(item):
                location=location_text(item.get("PrimaryLocation"),item.get("secondaryLocations"))
                if not likely_target(item.get("Title", ""),location): return None
                identifier=str(item["Id"])
                params={"onlyData":"true","expand":"all","finder":f'ById;Id="{identifier}",siteNumber={site}'}
                detail_url=base+"recruitingCEJobRequisitionDetails?"+urlencode(params)
                async with semaphore: detail=await cached_get(x,detail_url)
                detail.raise_for_status(); records=detail.json().get("items")
                if not records: raise ValueError("Oracle public job detail missing")
                info=records[0]
                description=" ".join(clean(info.get(key, "")) for key in ("ExternalDescriptionStr","ExternalQualificationsStr","ExternalResponsibilitiesStr"))
                location=location_text(info.get("PrimaryLocation"),info.get("secondaryLocations"),item.get("PrimaryLocation"),item.get("secondaryLocations"))
                url=f"{origin}/hcmUI/CandidateExperience/en/sites/{site}/job/{identifier}"
                return make_job(identifier,info.get("Title") or item.get("Title", ""),c.name,location,description,
                                "oracle","company_career",url,url,c.careers_url,
                                posting=info.get("ExternalPostedStartDate") or item.get("PostedDate"))
            converted=await asyncio.gather(*(convert(item) for item in postings.values()))
            return [job for job in converted if job],len(postings)


def jsonld_objects(soup):
    def postings(value):
        if isinstance(value, list):
            for item in value: yield from postings(item)
        elif isinstance(value, dict):
            types=value.get("@type", [])
            if types=="JobPosting" or (isinstance(types,list) and "JobPosting" in types):
                yield value
            else:
                for child in value.values():
                    if isinstance(child,(list,dict)): yield from postings(child)
    for script in soup.find_all("script",type="application/ld+json"):
        # Some employer templates put literal newlines in description strings.
        # JSON decoding remains data-only; tolerate those control characters.
        try: value=json.loads(script.string or "",strict=False)
        except (json.JSONDecodeError,TypeError): continue
        yield from postings(value)

ATS_HOSTS=("greenhouse.io","lever.co","ashbyhq.com","myworkdayjobs.com","smartrecruiters.com","jobvite.com","icims.com","oraclecloud.com")
ATS_BOARD_HOSTS={"greenhouse":{"boards.greenhouse.io","job-boards.greenhouse.io"},
                 "lever":{"jobs.lever.co","jobs.eu.lever.co"},"ashby":{"jobs.ashbyhq.com"},
                 "smartrecruiters":{"jobs.smartrecruiters.com","careers.smartrecruiters.com"},
                 "jobvite":{"jobs.jobvite.com"}}
ATS_PATTERNS=(
    ("greenhouse",re.compile(r"(?:boards|job-boards)\.greenhouse\.io/([\w.-]+)",re.I)),
    ("lever",re.compile(r"jobs\.(?:eu\.)?lever\.co/([\w.-]+)",re.I)),
    ("ashby",re.compile(r"jobs\.ashbyhq\.com/([\w.-]+)",re.I)),
    ("smartrecruiters",re.compile(r"(?:jobs|careers)\.smartrecruiters\.com/([\w.-]+)",re.I)),
    ("jobvite",re.compile(r"jobs\.jobvite\.com/([\w.-]+)",re.I)),
)
def discover_ats(soup,base_url):
    """Find a public ATS linked or embedded by an employer's official page."""
    values=[]
    for tag in soup.find_all(True):
        for attribute in ("href","ph-href","data-href","data-ph-href","data-src"):
            if tag.get(attribute): values.append(tag.get(attribute))
    for tag in soup.find_all("form",action=True): values.append(tag.get("action"))
    for tag in soup.find_all(["iframe","script"],src=True): values.append(tag.get("src"))
    values.extend(script.string or "" for script in soup.find_all("script"))
    for value in values:
        raw=html.unescape(str(value or "")).replace("\\/","/")
        raw=re.sub(r"\\u002[fF]", "/", raw)
        candidates=re.findall(r"https?://[^\s\"'<>\\]+",raw,re.I)
        if not candidates and len(raw)<2048:
            try: candidates=[urljoin(base_url,raw)]
            except ValueError: continue
        for absolute in candidates:
            try: parsed=urlparse(absolute); hostname=(parsed.hostname or "").lower()
            except ValueError: continue
            if parsed.scheme not in {"https","http"}: continue
            if hostname.endswith(".oraclecloud.com"):
                site=re.search(r"/CandidateExperience/[a-z-]+/sites/([\w-]+)",parsed.path,re.I)
                if site: return "oracle",f"{hostname}|{site.group(1)}",absolute
                # Branded Oracle boards expose their public backend in career assets.
                branded=re.search(r"/sites/([\w-]+)",urlparse(base_url).path)
                number=parse_qs(parsed.query).get("siteNumber",[""])[0]
                identifier=branded.group(1) if branded else number
                if identifier and re.fullmatch(r"[\w-]+",identifier) and ("/hcmRestApi/CandidateExperience/" in parsed.path or "/hcmUI/CandExpStatic/" in parsed.path):
                    return "oracle",f"{hostname}|{identifier}",f"https://{parsed.netloc}/hcmUI/CandidateExperience/en/sites/{identifier}"
            if hostname=="boards-api.greenhouse.io":
                board=re.search(r"/v1/boards/([\w.-]+)/jobs",parsed.path)
                if board: return "greenhouse",board.group(1),absolute
            if hostname=="my.greenhouse.io":
                token=parse_qs(parsed.query).get("job_board",[""])[0]
                if re.fullmatch(r"[\w.-]+",token): return "greenhouse",token,absolute
            if hostname in {"boards.greenhouse.io","job-boards.greenhouse.io"} and parsed.path.startswith("/embed/"):
                token=parse_qs(parsed.query).get("for",[""])[0]
                if re.fullmatch(r"[\w.-]+",token):
                    return "greenhouse",token,absolute
                continue
            if hostname.endswith(".myworkdayjobs.com"):
                parts=[part for part in parsed.path.split("/") if part and not re.fullmatch(r"[a-z]{2}(?:-[a-z]{2})?",part,re.I)]
                if parts:
                    tenant=parsed.hostname.split(".")[0]
                    return "workday",f"{tenant}|{parts[0]}",absolute
            for provider,pattern in ATS_PATTERNS:
                if hostname not in ATS_BOARD_HOSTS[provider]: continue
                match=pattern.search(hostname+parsed.path)
                if match:
                    identifier=("eu|" if provider=="lever" and hostname=="jobs.eu.lever.co" else "")+match.group(1)
                    return provider,identifier,absolute
    return None
def job_like_url(url,base_host):
    parsed=urlparse(url); host=(parsed.hostname or "").lower(); path=parsed.path.lower()
    same=host==base_host or host.endswith("."+base_host)
    known=any(host==domain or host.endswith("."+domain) for domain in ATS_HOSTS)
    return (known and path not in {"","/"}) or (same and bool(re.search(r"/(job|jobs|career|careers|position|positions|opening|openings)(/|\?|$)",path,re.I)))

class CustomCareerAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client(timeout=float(os.getenv("JOBRADAR_CUSTOM_TIMEOUT","12"))) as x:
            listing=await request(x,"GET",c.careers_url); listing.raise_for_status()
            soup=BeautifulSoup(listing.text,"html.parser")
            detected=discover_ats(soup,str(listing.url))
            if detected:
                provider,identifier,board_url=detected
                source_url=board_url if provider in {"workday","oracle"} else c.careers_url
                indexed=Company(c.name,source_url,provider,identifier,c.priority,c.enabled)
                return await ADAPTERS[provider].fetch_jobs(indexed)
            urls=[]; seen={str(listing.url)}; base_host=(urlparse(str(listing.url)).hostname or "").lower()
            for link in soup.find_all("a",href=True):
                url=urljoin(str(listing.url),link["href"]); parsed=urlparse(url)
                if job_like_url(url,base_host) and url not in seen:
                    seen.add(url); urls.append(url)
                if len(urls)>=80: break
            jobs=[]
            semaphore=asyncio.Semaphore(8)
            async def fetch(url):
                async with semaphore:
                    try:return await cached_get(x,url)
                    except httpx.HTTPError:return None
            responses=[listing,*await asyncio.gather(*(fetch(url) for url in urls))]
            for response in responses[1:]:
                if response is None or response.status_code!=200: continue
                detected=discover_ats(BeautifulSoup(response.text,"html.parser"),str(response.url))
                if detected:
                    provider,identifier,board_url=detected
                    indexed=Company(c.name,board_url if provider in {"workday","oracle"} else c.careers_url,provider,identifier,c.priority,c.enabled)
                    return await ADAPTERS[provider].fetch_jobs(indexed)
            for url,response in zip([str(listing.url),*urls],responses):
                if response is None or response.status_code!=200: continue
                for item in jsonld_objects(BeautifulSoup(response.text,"html.parser")):
                    locations=item.get("jobLocation") or []
                    if not isinstance(locations,list): locations=[locations]
                    addresses=[entry.get("address",{}) for entry in locations if isinstance(entry,dict)]
                    location=" · ".join(dict.fromkeys(", ".join(str(address.get(k,"")) for k in ("addressLocality","addressRegion","addressCountry") if address.get(k)) for address in addresses if isinstance(address,dict)))
                    apply_url=item.get("url") or url
                    identifier=item.get("identifier")
                    external=str((identifier.get("value") if isinstance(identifier,dict) else identifier) or apply_url)
                    jobs.append(make_job(external,item.get("title",""),c.name,location,clean(item.get("description","")),"custom","company_career",apply_url,apply_url,c.careers_url,posting=item.get("datePosted")))
        unique={}
        for job in jobs: unique[job.external_job_id]=job
        jobs=list(unique.values())
        reported=soup.select_one('#js-job-search-results[data-results]')
        if reported:
            total=reported.get('data-results','')
            if not total.isdigit() or len(jobs)!=int(total):
                warning=f"Limited coverage: public board reports {total} jobs; generic collector read {len(jobs)} structured details"
                return JobBatch(jobs,coverage_warning=warning),len(jobs)
        return jobs,len(jobs)

from .public_platforms import PhenomCareerAdapter, WorkableCareerAdapter
from .eightfold import EightfoldCareerAdapter
from .eightfold_legacy import LegacyEightfoldCareerAdapter
from .talentbrew import TalentBrewCareerAdapter
from .avature import AvatureCareerAdapter
from .paylocity import PaylocityCareerAdapter
from .phb import PHBCareerAdapter
from .icims import ICIMSCareerAdapter
from .infosys import InfosysCareerAdapter
from .successfactors import SuccessFactorsCareerAdapter
from .adidas import AdidasCareerAdapter

from .mynexthire import MyNextHireCareerAdapter
from .career_widgets import JuspayCareerAdapter, KulaCareerAdapter, BambooCareerAdapter, PyjamaCareerAdapter

ADAPTERS={"greenhouse":GreenhouseAdapter(),"lever":LeverAdapter(),"ashby":AshbyAdapter(),"smartrecruiters":SmartRecruitersAdapter(),"workday":WorkdayAdapter(),"jobvite":JobviteAdapter(),"custom":CustomCareerAdapter(),"xml":PublicXMLAdapter(),"oracle":OracleCareerAdapter(),"amazon":AmazonCareerAdapter(),"phenom":PhenomCareerAdapter(),"workable":WorkableCareerAdapter(),"eightfold":EightfoldCareerAdapter(),"talentbrew":TalentBrewCareerAdapter(),"mynexthire":MyNextHireCareerAdapter()}
ADAPTERS.update(workday_complete=WorkdayAdapter(complete=True),phb=PHBCareerAdapter(),eightfold_legacy=LegacyEightfoldCareerAdapter(),paylocity=PaylocityCareerAdapter(),avature=AvatureCareerAdapter(),juspay=JuspayCareerAdapter(),kula=KulaCareerAdapter(),bamboohr=BambooCareerAdapter(),pyjamahr=PyjamaCareerAdapter(),icims=ICIMSCareerAdapter())
ADAPTERS['infosys'] = InfosysCareerAdapter()
ADAPTERS['successfactors'] = SuccessFactorsCareerAdapter()
ADAPTERS['adidas'] = AdidasCareerAdapter()

from .thoughtspot import ThoughtSpotCareerAdapter
ADAPTERS["thoughtspot"] = ThoughtSpotCareerAdapter()

from .jibe import JibeCareerAdapter
ADAPTERS["jibe"] = JibeCareerAdapter()

from .public_career_json import PublicCareerJSONAdapter
ADAPTERS["atlassian"] = PublicCareerJSONAdapter("atlassian")
ADAPTERS["avalara"] = PublicCareerJSONAdapter("avalara")
