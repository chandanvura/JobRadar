import asyncio
import json

import httpx
import pytest

from scraper import adapters
from scraper.models import Company


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def test_amazon_pages_both_cities_deduplicates_and_keeps_original_day(monkeypatch):
    calls=[]
    def item(i, **kwargs):
        return dict(id_icims=str(i),title='Software Engineer',location='IN, KA, Bengaluru',
                    job_path=f'/en/jobs/{i}/software-engineer',description='<p>Develop Java services</p>',
                    basic_qualifications='0-2 years',preferred_qualifications='Python',
                    posted_date='October  5, 2026',updated_time='about 1 hour',**kwargs)
    first=[item(i) for i in range(100)]
    secondary=item(100,locations=[json.dumps({'city':'Hyderabad','location':'IN, TS, Hyderabad'})])
    secondary['location']='IN, MH, Pune'
    async def request(client, method, url, **kwargs):
        p=kwargs['params'];calls.append((p['city'],p['offset']))
        batch=first if p['city']=='Bengaluru' and p['offset']==0 else [secondary]
        return httpx.Response(200,json={'jobs':batch,'hits':101 if p['city']=='Bengaluru' else 1},request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    jobs,count=asyncio.run(adapters.AmazonCareerAdapter().fetch_jobs(Company('Amazon','https://www.amazon.jobs/en/search','amazon','amazon-india')))
    assert calls==[('Bengaluru',0),('Bengaluru',100),('Hyderabad',0)]
    assert count==101 and len(jobs)==101
    assert jobs[0].posted_precision=='day' and jobs[0].posted_at=='2026-10-05T00:00:00+00:00'
    assert jobs[0].description=='Develop Java services 0-2 years Python'
    assert 'Hyderabad' in jobs[-1].location
    assert jobs[0].job_url=='https://www.amazon.jobs/en/jobs/0/software-engineer'


@pytest.mark.parametrize('data',[
    {'error':'unavailable','jobs':[]}, {'hits':10,'content':[]},
    {'jobs':[{'id':'same','title':'HR'}]*100,'hits':300},
])
def test_amazon_rejects_failed_schema_and_repeated_pages(monkeypatch,data):
    async def request(client, method, url, **kwargs):
        return httpx.Response(200,json=data,request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError):
        asyncio.run(adapters.AmazonCareerAdapter().fetch_jobs(Company('Amazon','https://www.amazon.jobs/en/search','amazon','amazon-india')))


def test_amazon_does_not_use_update_time_as_posting_date(monkeypatch):
    async def request(client, method, url, **kwargs):
        return httpx.Response(200,json={'hits':1,'jobs':[dict(id='a',title='Software Engineer',location='Bengaluru',job_path='/en/jobs/a/engineer',posted_date='',updated_time='about 1 hour')]},request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client())
    monkeypatch.setattr(adapters,'request',request)
    jobs,_=asyncio.run(adapters.AmazonCareerAdapter().fetch_jobs(Company('Amazon','https://www.amazon.jobs/en/search','amazon','amazon-india')))
    assert jobs[0].posted_at is None and jobs[0].posted_precision=='unknown'
