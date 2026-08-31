from abc import ABC, abstractmethod
from datetime import datetime, timezone
import html, re, httpx
from .models import Company, Job

HEADERS={"User-Agent":"JobRadar/1.0 (+personal job monitor; responsible hourly polling)","Accept":"application/json"}
def clean(value): return re.sub(r"\s+"," ",html.unescape(re.sub(r"<[^>]+>"," ",value or ""))).strip()
def client(): return httpx.AsyncClient(timeout=httpx.Timeout(25,connect=10),follow_redirects=True,headers=HEADERS,transport=httpx.AsyncHTTPTransport(retries=3))
def epoch_ms(value):
    try: return datetime.fromtimestamp(int(value)/1000,tz=timezone.utc).isoformat()
    except (TypeError,ValueError,OSError): return None

class JobSource(ABC):
    @abstractmethod
    async def fetch_jobs(self, company: Company) -> list[Job]: ...

class GreenhouseAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await x.get(f"https://boards-api.greenhouse.io/v1/boards/{c.ats_identifier}/jobs",params={"content":"true"}); response.raise_for_status(); data=response.json()
        return [Job(str(j["id"]),j["title"],c.name,j.get("location",{}).get("name","") ,clean(j.get("content","")),"greenhouse","company_career",j.get("absolute_url",c.careers_url),j.get("absolute_url",c.careers_url),c.careers_url,None) for j in data.get("jobs",[])]

class LeverAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await x.get(f"https://api.lever.co/v0/postings/{c.ats_identifier}",params={"mode":"json"}); response.raise_for_status(); data=response.json()
        return [Job(str(j["id"]),j["text"],c.name,j.get("categories",{}).get("location","") ,clean(j.get("descriptionPlain") or j.get("description","")),"lever","company_career",j.get("hostedUrl",c.careers_url),j.get("applyUrl") or j.get("hostedUrl",c.careers_url),c.careers_url,epoch_ms(j.get("createdAt"))) for j in data]

class AshbyAdapter(JobSource):
    async def fetch_jobs(self,c):
        async with client() as x:
            response=await x.get(f"https://api.ashbyhq.com/posting-api/job-board/{c.ats_identifier}"); response.raise_for_status(); data=response.json()
        return [Job(str(j.get("id") or j["jobUrl"]),j["title"],c.name,j.get("location","") ,clean(j.get("descriptionPlain") or j.get("descriptionHtml","")),"ashby","company_career",j.get("jobUrl",c.careers_url),j.get("applyUrl") or j.get("jobUrl",c.careers_url),c.careers_url,j.get("publishedAt")) for j in data.get("jobs",[]) if j.get("isListed",True)]

ADAPTERS={"greenhouse":GreenhouseAdapter(),"lever":LeverAdapter(),"ashby":AshbyAdapter()}
