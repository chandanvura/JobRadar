import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company

def test_discovery_detail_cap_returns_truthful_partial_results_instead_of_losing_everything(monkeypatch):
    monkeypatch.setattr(adapters,'WORKDAY_DETAIL_LIMIT',2)
    calls=[]
    async def request(client,method,url,**kwargs):
        rows=[{'externalPath':f'/job/Bengaluru/R{i}','title':'Java Engineer','locationsText':'Bengaluru','postedOn':'Posted Today'} for i in range(5)]
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':5,'jobPostings':rows})
    async def detail(client,url):
        calls.append(url)
        return httpx.Response(200,request=httpx.Request('GET',url),json={'jobPostingInfo':{'title':'Java Engineer','jobReqId':url.rsplit('/',1)[-1],'jobDescription':'Required experience: 1-2 years.','location':'Bengaluru'}})
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'fetch_detail',detail)
    jobs,count=asyncio.run(adapters.WorkdayAdapter().fetch_jobs(Company('Example','https://example.wd1.myworkdayjobs.com/Jobs','workday','example|Jobs')))
    assert count==5 and len(calls)==len(jobs)==2
    assert [job.external_job_id for job in jobs]==['R0','R1']
    assert jobs.coverage_warning.startswith('Limited coverage:') and '2 of 5' in jobs.coverage_warning

def test_detail_budget_cancels_slow_requests_and_preserves_completed_records(monkeypatch):
    monkeypatch.setattr(adapters,'WORKDAY_DETAIL_BUDGET_SECONDS',0.02)
    cancelled=[]
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':2,'jobPostings':[{'externalPath':f'/job/Bengaluru/R{i}','title':'Java Engineer','locationsText':'Bengaluru'} for i in range(2)]})
    async def detail(client,url):
        if url.endswith('R1'):
            try:await asyncio.sleep(60)
            except asyncio.CancelledError:cancelled.append(url);raise
        return httpx.Response(200,request=httpx.Request('GET',url),json={'jobPostingInfo':{'title':'Java Engineer','jobReqId':'R0','jobDescription':'Required experience: 1-2 years.','location':'Bengaluru'}})
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'fetch_detail',detail)
    jobs,count=asyncio.run(adapters.WorkdayAdapter().fetch_jobs(Company('Example','https://example.wd1.myworkdayjobs.com/Jobs','workday','example|Jobs')))
    assert count==2 and len(jobs)==len(cancelled)==1
    assert jobs.coverage_warning.startswith('Limited coverage:') and 'bounded verification time' in jobs.coverage_warning

def test_source_cancellation_leaves_no_detail_requests_running(monkeypatch):
    async def scenario():
        started=asyncio.Event();cancelled=asyncio.Event()
        async def request(client,method,url,**kwargs):
            return httpx.Response(200,request=httpx.Request(method,url),json={'total':1,'jobPostings':[{'externalPath':'/job/Bengaluru/R1','title':'Java Engineer','locationsText':'Bengaluru'}]})
        async def detail(client,url):
            started.set()
            try:await asyncio.Event().wait()
            except asyncio.CancelledError:cancelled.set();raise
        monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'fetch_detail',detail)
        task=asyncio.create_task(adapters.WorkdayAdapter().fetch_jobs(Company('Example','https://example.wd1.myworkdayjobs.com/Jobs','workday','example|Jobs')))
        await started.wait();task.cancel()
        with pytest.raises(asyncio.CancelledError):await task
        assert cancelled.is_set()
    asyncio.run(scenario())
