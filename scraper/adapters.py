from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin, urlparse
import asyncio, html, json, re
import httpx
from bs4 import BeautifulSoup
from .models import Company, Job

HEADERS={"User-Agent":"JobRadar/1.1 (+personal job monitor; responsible hourly polling)","Accept":"application/json,text/html;q=0.9"}
def clean(value): return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",value or ""))).strip()
def client(): return httpx.AsyncClient(timeout=httpx.Timeout(30,connect=10),follow_redirects=True,headers=HEADERS,transport=httpx.AsyncHTTPTransport(retries=3))
def epoch_ms(value):
    try: return datetime.fromtimestamp(int(value)/1000,tz=timezone.utc).isoformat()
    except (TypeError,ValueError,OSError): return None
def likely_target(title, location):
    return bool(re.search(r"\b(engineer|developer|devops|devsecops|sre|platform|cloud|infrastructure|operations|release|build|site reliability|graduate|trainee|sde)\b",str(title),re.I) and re.search(r"\b(bangalore|bengaluru|hyderabad)\b",str(location),re.I))

def location_text(*values):
    """Flatten ATS primary and secondary locations without guessing a city."""
    found=[]
    def add(value):
        if isinstance(value,str) and value.strip(): found.append(value.strip())
        elif isinstance(value,list):
            for item in value: add(item)
        elif isinstance(value,dict):
            for key in ("name","location","city","region","country","addressLocality"):
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
            response=await x.get(f"https://boards-api.greenhouse.io/v1/boards/{c.ats_identifier}/jobs",params={"content":"true"}); response.raise_for_status(); data=response.json()
            async def convert(j):
                url=j.get("absolute_url",c.careers_url); posting=None
                location=location_text(j.get("location"),j.get("offices"))
                # Greenhouse's board API omits the posting timestamp. Its public
                # job page normally exposes the employer date in JobPosting JSON-LD.
                if likely_target(j.get("title",""),location):
                    try:
                        detail=await x.get(url)
                        if detail.status_code==200:
                            item=next(jsonld_objects(BeautifulSoup(detail.text,"html.parser")),None)
                            if item: posting=item.get("datePosted")
                    except httpx.HTTPError:
                        pass
                return make_job(str(j["id"]),j["title"],c.name,location,clean(j.get("content","")),"greenhouse","company_career",url,url,c.careers_url,posting=posting)
            jobs=list(await asyncio.gather(*(convert(j) for j in data.get("jobs",[]))))
            return jobs,len(data.get("jobs",[]))

class LeverAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await x.get(f"https://api.lever.co/v0/postings/{c.ats_identifier}",params={"mode":"json"}); response.raise_for_status(); data=response.json()
        jobs=[make_job(str(j["id"]),j["text"],c.name,location_text(j.get("categories",{}).get("location",""),j.get("categories",{}).get("allLocations",[])),clean(j.get("descriptionPlain") or j.get("description","")),"lever","company_career",j.get("hostedUrl",c.careers_url),j.get("applyUrl") or j.get("hostedUrl",c.careers_url),c.careers_url,posting=epoch_ms(j.get("createdAt"))) for j in data]
        return jobs,len(data)

class AshbyAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await x.get(f"https://api.ashbyhq.com/posting-api/job-board/{c.ats_identifier}"); response.raise_for_status(); data=response.json()
        listed=[j for j in data.get("jobs",[]) if j.get("isListed",True)]
        jobs=[make_job(str(j.get("id") or j["jobUrl"]),j["title"],c.name,location_text(j.get("location",""),j.get("secondaryLocations",[])),clean(j.get("descriptionPlain") or j.get("descriptionHtml","")),"ashby","company_career",j.get("jobUrl",c.careers_url),j.get("applyUrl") or j.get("jobUrl",c.careers_url),c.careers_url,posting=j.get("publishedAt")) for j in listed]
        return jobs,len(listed)

class SmartRecruitersAdapter(JobSource):
    async def fetch_jobs(self,c):
        base=f"https://api.smartrecruiters.com/v1/companies/{c.ats_identifier}/postings"
        async with client() as x:
            content=[]; offset=0
            while offset<1000:
                response=await x.get(base,params={"limit":100,"offset":offset}); response.raise_for_status(); data=response.json()
                batch=data.get("content",[]); content.extend(batch)
                if len(batch)<100: break
                offset+=100
            jobs=[]
            for item in content:
                item_location=item.get("location") or {}
                location_hint=", ".join(str(item_location.get(k,"")) for k in ("city","region","country") if item_location.get(k))
                if not likely_target(item.get("name",""),location_hint): continue
                detail_response=await x.get(f"{base}/{item['id']}")
                if detail_response.status_code != 200: continue
                detail=detail_response.json(); sections=detail.get("jobAd",{}).get("sections",{})
                description=" ".join(clean((sections.get(k) or {}).get("text","")) for k in ("jobDescription","qualifications","additionalInformation"))
                location=", ".join(x for x in ((detail.get("location") or {}).get("city"),(detail.get("location") or {}).get("region"),(detail.get("location") or {}).get("country")) if x)
                public_url=f"https://jobs.smartrecruiters.com/{c.ats_identifier}/{item['id']}"
                jobs.append(make_job(str(item["id"]),item.get("name",""),c.name,location,description,"smartrecruiters","company_career",public_url,detail.get("applyUrl") or public_url,c.careers_url,posting=item.get("releasedDate") or detail.get("releasedDate")))
        return jobs,len(content)

def workday_config(c):
    parsed=urlparse(c.careers_url)
    parts=[p for p in parsed.path.split("/") if p and not re.fullmatch(r"[a-z]{2}(?:-[A-Z]{2})?",p)]
    configured=[p.strip() for p in c.ats_identifier.split("|") if p.strip()]
    tenant=configured[0] if configured else parsed.hostname.split(".")[0]
    site=configured[1] if len(configured)>1 else (parts[0] if parts else "")
    if not parsed.hostname or not tenant or not site: raise ValueError("Workday requires a board URL and tenant|site identifier")
    return f"https://{parsed.hostname}",tenant,site

class WorkdayAdapter(JobSource):
    async def fetch_jobs(self,c):
        origin,tenant,site=workday_config(c); api=f"{origin}/wday/cxs/{tenant}/{site}"
        async with client() as x:
            postings=[]; offset=0
            while offset < 1000:
                response=await x.post(f"{api}/jobs",json={"appliedFacets":{},"limit":20,"offset":offset,"searchText":""}); response.raise_for_status(); page=response.json()
                batch=page.get("jobPostings",[])
                postings.extend(batch)
                if len(batch)<20: break
                offset+=20
            jobs=[]
            for item in postings:
                if not likely_target(item.get("title",""),item.get("locationsText","")): continue
                path=item.get("externalPath")
                if not path: continue
                detail_response=await x.get(f"{api}{path}")
                if detail_response.status_code != 200: continue
                info=detail_response.json().get("jobPostingInfo",{})
                public_url=urljoin(origin,f"/{site}{path}")
                posting=item.get("postedOn") or info.get("startDate")
                location=location_text(info.get("location"),info.get("additionalLocations"),item.get("locationsText"))
                jobs.append(make_job(str(info.get("jobReqId") or info.get("jobPostingId") or path),info.get("title") or item.get("title",""),c.name,location,clean(info.get("jobDescription","")),"workday","company_career",public_url,info.get("externalUrl") or public_url,c.careers_url,posting=posting))
        return jobs,len(postings)

def jsonld_objects(soup):
    for script in soup.find_all("script",type="application/ld+json"):
        try: value=json.loads(script.string or "")
        except (json.JSONDecodeError,TypeError): continue
        values=value if isinstance(value,list) else [value]
        for item in values:
            if isinstance(item,dict) and item.get("@type")=="JobPosting": yield item
            if isinstance(item,dict) and isinstance(item.get("@graph"),list):
                yield from (node for node in item["@graph"] if isinstance(node,dict) and node.get("@type")=="JobPosting")

ATS_HOSTS=("greenhouse.io","lever.co","ashbyhq.com","myworkdayjobs.com","smartrecruiters.com")
def job_like_url(url,base_host):
    parsed=urlparse(url); host=(parsed.hostname or "").lower(); path=parsed.path.lower()
    same=host==base_host or host.endswith("."+base_host)
    known=any(host==domain or host.endswith("."+domain) for domain in ATS_HOSTS)
    return (known and path not in {"","/"}) or (same and bool(re.search(r"/(job|jobs|career|careers|position|positions|opening|openings)(/|\?|$)",path,re.I)))

class CustomCareerAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            listing=await x.get(c.careers_url); listing.raise_for_status()
            soup=BeautifulSoup(listing.text,"html.parser")
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
                    try:return await x.get(url)
                    except httpx.HTTPError:return None
            responses=[listing,*await asyncio.gather(*(fetch(url) for url in urls))]
            for url,response in zip([str(listing.url),*urls],responses):
                if response is None or response.status_code!=200: continue
                for item in jsonld_objects(BeautifulSoup(response.text,"html.parser")):
                    location_data=item.get("jobLocation") or {}
                    if isinstance(location_data,list): location_data=location_data[0] if location_data else {}
                    address=(location_data.get("address") or {}) if isinstance(location_data,dict) else {}
                    location=", ".join(str(address.get(k,"")) for k in ("addressLocality","addressRegion","addressCountry") if address.get(k))
                    apply_url=item.get("url") or url; external=str(item.get("identifier",{}).get("value") if isinstance(item.get("identifier"),dict) else item.get("identifier") or apply_url)
                    jobs.append(make_job(external,item.get("title",""),c.name,location,clean(item.get("description","")),"custom","company_career",apply_url,apply_url,c.careers_url,posting=item.get("datePosted")))
        unique={}
        for job in jobs: unique[job.external_job_id]=job
        jobs=list(unique.values())
        return jobs,len(jobs)

ADAPTERS={"greenhouse":GreenhouseAdapter(),"lever":LeverAdapter(),"ashby":AshbyAdapter(),"smartrecruiters":SmartRecruitersAdapter(),"workday":WorkdayAdapter(),"custom":CustomCareerAdapter()}
