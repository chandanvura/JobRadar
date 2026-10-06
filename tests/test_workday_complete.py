import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company


def employer():
    return Company('Employer','https://employer.wd1.myworkdayjobs.com/Jobs','workday_complete','employer|Jobs')


def test_complete_workday_reads_secondary_locations_and_all_pages(monkeypatch):
    offsets=[]
    async def request(client,method,url,**kwargs):
        offset=kwargs['json']['offset'];offsets.append(offset)
        ids=range(offset,min(offset+20,21))
        rows=[{'externalPath':f'/job/Location/Engineer_R{i}','title':'Software Engineer','locationsText':'2 Locations'} for i in ids]
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':21 if offset==0 else 0,'jobPostings':rows})
    async def detail(client,url):
        return httpx.Response(200,request=httpx.Request('GET',url),json={'jobPostingInfo':{'jobReqId':url.rsplit('_',1)[-1],'title':'Software Engineer','jobDescription':'Java requirements; 0 to 2 years experience','location':'London','additionalLocations':['Bengaluru, India'],'startDate':'2026-10-06'}})
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',detail)
    jobs,count=asyncio.run(adapters.WorkdayAdapter(complete=True).fetch_jobs(employer()))
    assert offsets==[0,20,0] and count==21 and len(jobs)==21
    assert all('Bengaluru, India' in job.location and 'Java requirements' in job.description for job in jobs)


@pytest.mark.parametrize('failure',['cap','short','duplicate','changed'])
def test_complete_workday_rejects_truncation_and_inconsistent_pages(monkeypatch,failure):
    async def request(client,method,url,**kwargs):
        offset=kwargs['json']['offset'];total=21
        rows=[{'externalPath':f'/job/X/R{i}','title':'Sales','locationsText':'London'} for i in range(offset,min(offset+20,21))]
        if failure=='cap':total=2001
        if failure=='short':rows=rows[:1]
        if failure=='duplicate' and offset:rows=[{'externalPath':'/job/X/R0','title':'Sales'}]
        if failure=='changed' and offset:total=22
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':total,'jobPostings':rows})
    monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='bound|pagination'):
        asyncio.run(adapters.WorkdayAdapter(complete=True).fetch_jobs(employer()))


def test_complete_workday_missing_requirements_fail_visibly(monkeypatch):
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':1,'jobPostings':[{'externalPath':'/job/X/R1','title':'Software Engineer','locationsText':'2 Locations'}]})
    async def detail(client,url):
        return httpx.Response(200,request=httpx.Request('GET',url),json={'jobPostingInfo':{'title':'Software Engineer','location':'Bengaluru'}})
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',detail)
    with pytest.raises(ValueError,match='description'):
        asyncio.run(adapters.WorkdayAdapter(complete=True).fetch_jobs(employer()))


def test_complete_workday_final_recheck_detects_changed_first_page(monkeypatch):
    calls=[]
    async def request(client,method,url,**kwargs):
        calls.append(url)
        path='/job/X/R1' if len(calls)==1 else '/job/X/R2'
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':1,'jobPostings':[{'externalPath':path,'title':'Sales','locationsText':'London'}]})
    monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='final verification'):
        asyncio.run(adapters.WorkdayAdapter(complete=True).fetch_jobs(employer()))


def test_complete_workday_removed_relevant_detail_keeps_coverage_warning(monkeypatch):
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':1,'jobPostings':[{'externalPath':'/job/X/R1','title':'Software Engineer','locationsText':'Bengaluru'}]})
    async def detail(client,url):
        return httpx.Response(410,request=httpx.Request('GET',url))
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',detail)
    jobs,count=asyncio.run(adapters.WorkdayAdapter(complete=True).fetch_jobs(employer()))
    assert count==1 and len(jobs)==0
    assert 'Limited coverage' in jobs.coverage_warning
