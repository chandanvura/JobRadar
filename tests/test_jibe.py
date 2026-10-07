import asyncio
import copy
import httpx
import pytest
from scraper import adapters
from scraper.jibe import JibeCareerAdapter, board_identity, listing_records, detail_record
from scraper.models import Company
from scraper.snapshot import SnapshotChanged


def row(i):
    return dict(slug=str(i), req_id=f'R{i}', language='en-us', title=f'Engineer {i}', internal=False,
                searchable=True, country='India', full_location='Bengaluru, India')


@pytest.mark.parametrize('failure', ['wrong_total','truncated','duplicate','internal','language_scope'])
def test_reject_incomplete_or_nonpublic_listing(failure):
    payload=dict(count=2,totalCount=2,jobs=[{'data':row(i)} for i in (1,2)])
    if failure=='wrong_total':payload['count']=True
    if failure=='truncated':payload['jobs'].pop()
    if failure=='duplicate':payload['jobs'][1]=copy.deepcopy(payload['jobs'][0])
    if failure=='internal':payload['jobs'][0]['data']['internal']=True
    if failure=='language_scope':payload['totalCount']=3
    with pytest.raises(ValueError):listing_records(payload,1)


def test_identity_and_mutating_total():
    with pytest.raises(ValueError):board_identity('window._jibe = {"cid":"other"};','employer')
    with pytest.raises(SnapshotChanged):listing_records(dict(count=0,totalCount=0,jobs=[]),1,1)
    with pytest.raises(ValueError):detail_record(dict(row(1),client_code='other',description='Requirements'),row(1),'employer')


@pytest.mark.parametrize('failure', [None,'duplicate_page','changed_total','missing_detail','changed_first','wrong_detail','missing_requirements'])
def test_complete_pages_all_details_and_snapshot(monkeypatch,failure):
    calls=[];detail_ids=[]
    async def request(client,method,url,**kwargs):
        if url.endswith('/careers-home/jobs'):
            body='<script>window._jibe = {"cid":"employer"};</script><script src="https://app.jibecdn.com/prod/search/v/main.js"></script>'
            return httpx.Response(200,text=body,request=httpx.Request(method,url))
        if 'jibecdn' in url:
            return httpx.Response(200,text='this.http.get("/api/jobs" searchJobBySlug',request=httpx.Request(method,url))
        if url.endswith('/api/jobs'):
            page=kwargs['params']['page'];calls.append(page)
            ids=list(range(1,21)) if page==1 else [21]
            if failure=='duplicate_page' and page==2:ids=[1]
            if failure=='changed_first' and len(calls)==3:ids[-1]=99
            total=22 if failure=='changed_total' and page==2 else 21
            return httpx.Response(200,json=dict(count=total,totalCount=total,jobs=[{'data':row(i)} for i in ids]),request=httpx.Request(method,url))
        i=int(url.split('/')[-2]);detail_ids.append(i)
        payload=dict(row(i),client_code='employer',description='<p>Java developer requirements</p>',additional_locations=[dict(full_location='Hyderabad, India')],create_date='2026-01-01')
        if failure=='wrong_detail':payload['req_id']='Other'
        if failure=='missing_requirements':payload['description']=''
        return httpx.Response(404 if failure=='missing_detail' else 200,json=payload,request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'request',request)
    company=Company('Employer','https://official.test/careers-home/jobs','jibe','employer')
    if failure:
        with pytest.raises((ValueError,SnapshotChanged)):asyncio.run(JibeCareerAdapter().fetch_jobs(company))
    else:
        jobs,count=asyncio.run(JibeCareerAdapter().fetch_jobs(company))
        assert count==len(jobs)==21 and set(detail_ids)==set(range(1,22)) and calls==[1,2,1]
        assert all('Hyderabad' in j.location and 'Bengaluru' in j.location and j.posted_at is None for j in jobs)
