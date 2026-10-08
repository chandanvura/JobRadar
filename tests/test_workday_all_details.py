import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company


@pytest.mark.parametrize('failure',[None,'duplicate_id','missing_detail','missing_description','changed_title','changed_final'])
def test_full_scope_reads_non_target_jobs_and_rechecks_after_details(monkeypatch,failure):
    listings=0;details=[]
    async def request(client,method,url,**kwargs):
        nonlocal listings
        req=httpx.Request(method,url)
        if method=='POST':
            listings+=1
            rows=[{'title':'Sales Manager','externalPath':'/job/Sales_R1','locationsText':'Mumbai Remote','postedOn':'Posted Today'},
                  {'title':'Recruiter','externalPath':'/job/Recruiter_R2','locationsText':'London','postedOn':'Posted Yesterday'}]
            if failure=='changed_final' and listings==3:rows[0]['title']='Different role'
            return httpx.Response(200,json={'total':2,'jobPostings':rows},request=req)
        ident='1' if url.endswith('_R1') else '2';details.append(ident)
        info={'title':'Sales Manager' if ident=='1' else 'Recruiter','jobReqId':'1' if failure=='duplicate_id' else ident,
              'location':'Mumbai Remote' if ident=='1' else 'London','jobDescription':'Actual full requirements'}
        if failure=='changed_title':info['title']='Changed role'
        if failure=='missing_description':info['jobDescription']=''
        return httpx.Response(404 if failure=='missing_detail' else 200,json={'jobPostingInfo':info},request=req)
    monkeypatch.setattr(adapters,'request',request)
    async def cache(*_):raise AssertionError('Full public details must be freshly collected')
    monkeypatch.setattr(adapters,'cached_get',cache)
    company=Company('Employer','https://employer.wd1.myworkdayjobs.com/External','workday_all','employer|External')
    adapter=adapters.ADAPTERS['workday_all']
    if failure in ['duplicate_id','missing_description','changed_title','changed_final']:
        with pytest.raises(ValueError):asyncio.run(adapter.fetch_jobs(company))
    else:
        jobs,total=asyncio.run(adapter.fetch_jobs(company))
        assert total==2 and set(details)=={'1','2'}
        if failure=='missing_detail':assert jobs.coverage_warning.startswith('Limited coverage') and len(jobs)==0
        else:
            assert len(jobs)==2 and listings==3 and {j.location for j in jobs}=={'Mumbai Remote','London'}
            assert all(j.posted_at is None for j in jobs)
