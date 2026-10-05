import asyncio
import json

import httpx
import pytest

from scraper import adapters
from scraper.eightfold import EightfoldCareerAdapter
from scraper.talentbrew import TalentBrewCareerAdapter
from scraper.models import Company


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def response(url, *, data=None, text=None):
    return httpx.Response(200, json=data, text=text, request=httpx.Request('GET', url))


@pytest.mark.parametrize("posted, expected", [(1791158400, "2026-10-05T00:00:00+00:00"), (None, None)])
def test_eightfold_current_search_pages_details_and_original_dates(monkeypatch, posted, expected):
    calls=[]
    async def request(client, method, url, **kwargs):
        if url.endswith('/careers'):
            return response(url,text='<code id="pcsx-data">{"domain":"example.com"}</code>')
        offset=kwargs['params']['start'];calls.append(offset)
        return response(url,data={'data':{'count':2,'positions':[{'id':offset+1,'name':'Software Engineer','locations':['India'],'standardizedLocations':['Bengaluru, KA, IN']}]}})
    async def cached(client,url):
        from urllib.parse import parse_qs,urlparse
        identifier=parse_qs(urlparse(url).query)['position_id'][0]
        return response(url,data={'data':{'id':int(identifier),'name':'Software Engineer','locations':['Bengaluru, India'],'jobDescription':'Java; 0-2 years','postedTs':posted,'creationTs':1791244800}})
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',cached)
    jobs,count=asyncio.run(EightfoldCareerAdapter().fetch_jobs(Company('Example','https://example.eightfold.ai/careers','eightfold','example.eightfold.ai|example.com')))
    assert calls==[0,1] and count==2 and len(jobs)==2
    assert jobs[0].posted_at==expected
    assert jobs[0].description=='Java; 0-2 years'
    assert jobs[0].job_url.endswith('?domain=example.com')


def test_eightfold_rejects_wrong_employer_configuration(monkeypatch):
    async def request(client,method,url,**kwargs):
        return response(url,text='<code id="pcsx-data">{"domain":"unrelated.com"}</code>')
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='configuration'):
        asyncio.run(EightfoldCareerAdapter().fetch_jobs(Company('Example','https://example.eightfold.ai/careers','eightfold','example.eightfold.ai|example.com')))


def test_eightfold_rejects_repeated_pages(monkeypatch):
    async def request(client,method,url,**kwargs):
        if url.endswith('/careers'):return response(url,text='<code id="pcsx-data">{"domain":"example.com"}</code>')
        return response(url,data={'data':{'count':20,'positions':[{'id':1}]}})
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='pagination repeated'):
        asyncio.run(EightfoldCareerAdapter().fetch_jobs(Company('Example','https://example.eightfold.ai/careers','eightfold','example.eightfold.ai|example.com')))


def talentbrew_page(identifier, next_url=None):
    next_link=f'<nav class="pagination"><a class="next" href="{next_url}">Next</a></nav>' if next_url else ''
    return f'<section id="search-results" data-organization-ids="123" data-total-results="2"><section id="search-results-list"><a data-job-id="{identifier}" href="/job/hyderabad/{identifier}"><h2>Software Engineer</h2><span class="job-location">Hyderabad, India</span></a></section></section>{next_link}'


def test_talentbrew_pages_and_reads_full_public_jobposting(monkeypatch):
    calls=[]
    async def request(client,method,url,**kwargs):
        calls.append(url)
        return response(url,text=talentbrew_page('2') if url.endswith('/2') else talentbrew_page('1','/search/2'))
    async def cached(client,url):
        job={'@type':'JobPosting','title':'Software Engineer','description':'Python APIs; 0-2 years','datePosted':'2026-10-5','jobLocation':{'address':{'addressLocality':'Hyderabad','addressCountry':'India'}}}
        return response(url,text='<script type="application/ld+json">'+json.dumps(job)+'</script>')
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',cached)
    jobs,count=asyncio.run(TalentBrewCareerAdapter().fetch_jobs(Company('Example','https://careers.example/search','talentbrew','123')))
    assert len(calls)==2 and count==2 and len(jobs)==2
    assert jobs[0].posted_at=='2026-10-05T00:00:00+00:00' and jobs[0].posted_precision=='day'
    assert jobs[0].location=='Hyderabad · India'


def test_talentbrew_rejects_unrelated_pagination_host(monkeypatch):
    async def request(client,method,url,**kwargs):return response(url,text=talentbrew_page('1','https://unrelated.example/jobs'))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='official career host'):
        asyncio.run(TalentBrewCareerAdapter().fetch_jobs(Company('Example','https://careers.example/search','talentbrew','123')))


def test_workday_detection_accepts_lowercase_locale():
    from bs4 import BeautifulSoup
    detected=adapters.discover_ats(BeautifulSoup('<a href="https://ghr.wd1.myworkdayjobs.com/en-us/lateral-apac/login">Jobs</a>','html.parser'),'https://example.com/careers')
    assert detected[1]=='ghr|lateral-apac'


def test_public_missing_details_keep_partial_coverage_visible(monkeypatch):
    from scraper.main import scrape
    from scraper.models import JobBatch
    class Source:
        async def fetch_jobs(self,company):
            job=adapters.make_job('1','Software Engineer',company.name,'Hyderabad, India','Java; 0-2 years','phenom','company_career','https://example.com/job/1','https://example.com/job/1',company.careers_url,posting='2026-10-05')
            return JobBatch([job],'Limited coverage: one employer description is missing'),2
    monkeypatch.setitem(adapters.ADAPTERS,'partial-test',Source())
    jobs,status,error,count=asyncio.run(scrape(Company('Example','https://example.com','partial-test','example'),asyncio.Semaphore(1),asyncio.Semaphore(1)))
    assert len(jobs)==1 and count==2 and error is None
    assert status['warning'].startswith('Limited coverage:')
    assert status['jobs_found']==2


def test_talentbrew_duplicate_view_link_and_sibling_location(monkeypatch):
    async def request(client,method,url,**kwargs):
        return response(url,text='<section id="search-results" data-organization-ids="123"><section id="search-results-list"><li><h2><a data-job-id="1" href="/job/1">Software Engineer</a></h2><span class="location">Bengaluru, India</span><a data-job-id="1" href="/job/1">View Role</a></li></section></section>')
    async def cached(client,url):
        return response(url,text='<div class="ats-description">Full requirements: Java; 0-2 years</div>')
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',cached)
    jobs,count=asyncio.run(TalentBrewCareerAdapter().fetch_jobs(Company('Example','https://careers.example/search','talentbrew','123')))
    assert count==1 and len(jobs)==1
    assert jobs[0].location=='Bengaluru, India' and jobs[0].description=='Full requirements: Java; 0-2 years'
    assert jobs[0].posted_at is None
