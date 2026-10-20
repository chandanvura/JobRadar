import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company
from scraper.normalization import enrich
from scraper.experience import analyze_experience


@pytest.mark.parametrize('item,expected',[
    ({'location':'India','isRemote':True},'Remote (India)'),
    ({'location':'India (Anywhere)','workplaceType':'Remote'},'Remote (India)'),
    ({'location':'United States','isRemote':True,'secondaryLocations':[{'location':'India','address':{'postalAddress':{'addressCountry':'India'}}}]},'Remote (India)'),
    ({'location':'Remote','isRemote':True,'address':{'postalAddress':{'addressCountry':'IN'}}},'Remote (India)'),
    ({'location':'India','isRemote':False},'Other India'),
    ({'location':'United States','isRemote':True},None),
    ({'location':'Remote','isRemote':True},None),
    ({'location':'India','isRemote':'false'},'Other India'),
    ({'location':'India','isRemote':True,'workplaceType':'Hybrid'},'Other India'),
    ({'location':'India','isRemote':False,'workplaceType':'Remote'},'Other India'),
])
def test_remote_requires_published_india_and_remote_evidence(item,expected):
    job=adapters.make_job('1','DevOps Engineer','Example',adapters.ashby_location(item),'Required: 1-2 years.','ashby','company_career','https://jobs.example/1','https://jobs.example/1','https://jobs.example')
    assert enrich(job).city==expected


class Client:
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass


@pytest.mark.parametrize('payload',[{}, {'jobs':{}}, {'jobs':[None]}, {'jobs':[{'id':'same'},{'id':'same'}]}])
def test_invalid_board_cannot_become_verified_empty_inventory(monkeypatch,payload):
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,json=payload,request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda:Client())
    monkeypatch.setattr(adapters,'request',request)
    with pytest.raises(ValueError,match='Ashby public board'):
        asyncio.run(adapters.AshbyAdapter().fetch_jobs(Company('Example','https://jobs.ashbyhq.com/example','ashby','example')))


def test_full_jd_and_employer_date_are_preserved_and_missing_jd_is_limited(monkeypatch):
    payload={'jobs':[{'id':'1','title':'Java Engineer','location':'India','isRemote':True,'descriptionPlain':'Required experience: 1-2 years. Java and Spring Boot.','publishedAt':'2026-10-19T10:00:00Z','jobUrl':'https://jobs.ashbyhq.com/example/1'},
                     {'id':'2','title':'DevOps Engineer','location':'Bengaluru','jobUrl':'https://jobs.ashbyhq.com/example/2'},
                     {'id':'3','title':'Hidden','isListed':False}]}
    async def request(client,method,url,**kwargs):return httpx.Response(200,json=payload,request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda:Client());monkeypatch.setattr(adapters,'request',request)
    jobs,count=asyncio.run(adapters.AshbyAdapter().fetch_jobs(Company('Example','https://jobs.ashbyhq.com/example','ashby','example')))
    assert count==len(jobs)==2
    assert jobs[0].description==payload['jobs'][0]['descriptionPlain']
    assert jobs[0].posted_at.startswith('2026-10-19T10:00:00')
    assert jobs[1].posted_at is None
    assert jobs.coverage_warning=='Limited coverage: 1 relevant Ashby jobs lack full requirements'


@pytest.mark.parametrize('item',[
    {'descriptionPlain':"What You'll Bring\nMust have\n1–3 years of professional software engineering experience\nNice to have\n5 years of cloud experience preferred"},
    {'descriptionHtml':"<h3>What You'll Bring</h3><p>Must have</p><ul><li><strong>1–3 years</strong> of professional software engineering experience</li></ul><h3>Nice to have</h3><p>5 years of cloud experience preferred</p>"},
])
def test_required_and_preferred_experience_keep_distinct_jd_boundaries(item):
    analysis=analyze_experience(adapters.ashby_description(item))
    assert (analysis['min'],analysis['max'])==(1,3)
    assert len(analysis['required'])==1
    assert analysis['preferred'][0]['min']==5
