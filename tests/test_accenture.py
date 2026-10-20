import asyncio
import copy
import json
import httpx
import pytest
from scraper import adapters
from scraper.accenture import AccentureCareerAdapter,OFFICIAL,SEARCH
from scraper.models import Company

ROW={'guid':'REQ-1_en','requisitionId':'REQ-1','title':'Java Engineer','country':'India','location':['Bengaluru'],'jobDescriptionClean':'Required experience: 5 years. Java and Spring Boot.','qualificationClean':'Bachelor degree','updateDate':'2026-10-20T10:00:00Z','postedDateText':'Posted within last 24 hours','jobDetailUrl':'https://www.accenture.com/{0}/careers/jobdetails?id=REQ-1_en&title=Java+Engineer'}
class Client:
    async def __aenter__(self):return self
    async def __aexit__(self,*args):pass

@pytest.mark.parametrize('fault',[None,'country','host','requirements','duplicate'])
def test_official_search_validates_identity_and_never_uses_index_update_as_posting(monkeypatch,fault):
    row=copy.deepcopy(ROW)
    if fault=='country':row['country']='United States'
    if fault=='host':row['jobDetailUrl']=row['jobDetailUrl'].replace('www.accenture.com','unrelated.test')
    if fault=='requirements':row['jobDescriptionClean']=''
    payload={'data':[row,row] if fault=='duplicate' else [row],'totalHits':{'total':2 if fault=='duplicate' else 1}}
    async def request(client,method,url,**kwargs):
        assert method=='POST' and url==SEARCH
        assert kwargs['files']['jobCountry']==(None,'India')
        return httpx.Response(200,json=payload,request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request)
    operation=AccentureCareerAdapter().fetch_jobs(Company('Accenture',OFFICIAL,'accenture',SEARCH))
    if fault:
        with pytest.raises(ValueError):asyncio.run(operation)
    else:
        jobs,count=asyncio.run(operation)
        assert count==len(jobs)==1
        assert jobs[0].posted_at is None and jobs[0].posted_precision=='unknown'
        assert jobs[0].posted_label=='Posted within last 24 hours'
        assert jobs[0].external_job_id=='REQ-1'
        assert 'Spring Boot' in jobs[0].description
        assert jobs.coverage_warning.startswith('Limited coverage:')


@pytest.mark.parametrize('proof',['valid','wrong_employer','unavailable'])
def test_only_matching_employer_jobposting_can_verify_date(monkeypatch,proof):
    row={**ROW,'jobDescriptionClean':'Required experience: 1-2 years. Java.'}
    async def request(client,method,url,**kwargs):return httpx.Response(200,json={'data':[row],'totalHits':{'total':1}},request=httpx.Request(method,url))
    async def detail(client,url):
        if proof=='unavailable':raise httpx.ConnectError('unavailable')
        item={'@type':'JobPosting','title':row['title'],'url':url,'hiringOrganization':{'name':'Other' if proof=='wrong_employer' else 'Accenture'},'datePosted':'2026-10-20T10:00:00Z'}
        return httpx.Response(200,text='<script type="application/ld+json">'+json.dumps(item)+'</script>',request=httpx.Request('GET',url))
    monkeypatch.setattr(adapters,'client',lambda **kwargs:Client());monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'fetch_detail',detail)
    jobs,count=asyncio.run(AccentureCareerAdapter().fetch_jobs(Company('Accenture',OFFICIAL,'accenture',SEARCH)))
    assert count==1
    assert bool(jobs[0].posted_at)==(proof=='valid')
