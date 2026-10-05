import asyncio
import json

import httpx
import pytest

from scraper import adapters
from scraper.models import Company
from scraper.public_platforms import PhenomCareerAdapter, phenom_config


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self,*args): pass


def page(config):
    return 'var phApp = phApp || '+json.dumps(config)+';'


CONFIG={'baseUrl':'https://careers.example/global/en/','widgetApiEndpoint':'https://careers.example/widgets','refNum':'EXAMPLE','country':'global','locale':'en_global'}


@pytest.mark.parametrize('config',[
    {**CONFIG,'refNum':'OTHER'},
    {**CONFIG,'widgetApiEndpoint':'https://unrelated.example/widgets'},
    {**CONFIG,'baseUrl':'http://careers.example/global/en/'},
])
def test_phenom_rejects_wrong_employer_and_unrelated_endpoints(config):
    with pytest.raises(ValueError): phenom_config(page(config),CONFIG['baseUrl'],'EXAMPLE')


def test_phenom_pages_and_gets_full_descriptions_without_ingestion_dates(monkeypatch):
    calls=[];details=[]
    async def request(client,method,url,**kwargs):
        if method=='GET':return httpx.Response(200,text=page(CONFIG),request=httpx.Request(method,url))
        p=kwargs['json'];calls.append(p)
        job=dict(jobId=str(p['from']),jobSeqNo='EXAMPLE'+str(p['from']),title='Software Engineer',location='Pune',multi_location=['Hyderabad, India'],postedDate='2026-10-05',dateCreated='2026-10-06')
        return httpx.Response(200,json={'refineSearch':{'status':200,'totalHits':2,'data':{'jobs':[job]}}},request=httpx.Request(method,url))
    async def cached(client,url):
        details.append(url);seq=url.split('/')[-1]
        job=dict(jobId=seq,jobSeqNo=seq,title='Software Engineer',location='Pune',multi_location=['Hyderabad, India'],description='<p>Java services; 0-2 years</p>',dateCreated='2026-10-06')
        return httpx.Response(200,text='phApp.ddo = '+json.dumps({'jobDetail':{'data':{'job':job}}}),request=httpx.Request('GET',url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    monkeypatch.setattr(adapters,'cached_get',cached)
    jobs,count=asyncio.run(PhenomCareerAdapter().fetch_jobs(Company('Example',CONFIG['baseUrl'],'phenom','EXAMPLE')))
    assert count==2 and len(jobs)==2
    assert [p['from'] for p in calls]==[0,1]
    assert calls[0]['selected_fields']=={'country':['India','IND','INDIA','IN']}
    assert jobs[0].description=='Java services; 0-2 years'
    assert 'Hyderabad' in jobs[0].location
    assert jobs[0].posted_at=='2026-10-05T00:00:00+00:00'
    assert len(details)==2


def test_phenom_fails_repeated_public_pages(monkeypatch):
    async def request(client,method,url,**kwargs):
        if method=='GET':return httpx.Response(200,text=page(CONFIG),request=httpx.Request(method,url))
        return httpx.Response(200,json={'refineSearch':{'status':200,'totalHits':200,'data':{'jobs':[{'jobSeqNo':'same'}]}}},request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='pagination repeated'):
        asyncio.run(PhenomCareerAdapter().fetch_jobs(Company('Example',CONFIG['baseUrl'],'phenom','EXAMPLE')))


def test_workable_uses_opaque_tokens_and_full_public_requirements(monkeypatch):
    from scraper.public_platforms import WorkableCareerAdapter
    calls=[]
    async def request(client,method,url,**kwargs):
        calls.append(kwargs['json'])
        code='second' if kwargs['json'].get('token') else 'first'
        item={'shortcode':code,'title':'Software Engineer','location':{'city':'Pune'},'locations':[{'city':'Hyderabad'}],'state':'published','isInternal':False}
        return httpx.Response(200,json={'results':[item],'total':2,'nextPage':None if code=='second' else 'opaque-token'},request=httpx.Request(method,url))
    async def cached(client,url):
        code=url.split('/')[-1]
        return httpx.Response(200,json={'shortcode':code,'title':'Software Engineer','location':{'city':'Pune'},'locations':[{'city':'Hyderabad'}],'state':'published','isInternal':False,'description':'Build APIs','requirements':'0-2 years; Java','published':'2026-10-05T00:00:00Z'},request=httpx.Request('GET',url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    monkeypatch.setattr(adapters,'cached_get',cached)
    jobs,count=asyncio.run(WorkableCareerAdapter().fetch_jobs(Company('Example','https://apply.workable.com/example/','workable','example')))
    assert count==2 and len(jobs)==2
    assert calls[1]['token']=='opaque-token'
    assert jobs[0].description=='Build APIs 0-2 years; Java'
    assert 'Hyderabad' in jobs[0].location
    assert jobs[0].job_url=='https://apply.workable.com/example/j/first/'


def test_workable_rejects_repeated_public_pages(monkeypatch):
    from scraper.public_platforms import WorkableCareerAdapter
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,json={'results':[{'shortcode':'same'}],'nextPage':'same-token'},request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='repeated'):
        asyncio.run(WorkableCareerAdapter().fetch_jobs(Company('Example','https://apply.workable.com/example/','workable','example')))
