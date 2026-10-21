import asyncio
import httpx
import pytest
from scraper.workday_partitions import category_postings
from scraper.snapshot import SnapshotChanged


@pytest.mark.parametrize('fault',[None,'bad_counts','overlap','truncated','changed'])
def test_published_categories_must_reconcile_every_unique_global_job(fault):
    initial={'total':3,'facets':[{'facetParameter':'jobFamilyGroup','values':[{'id':'engineering','count':2},{'id':'operations','count':1}]}]}
    if fault=='bad_counts':initial['total']=4
    calls={}
    async def request(client,method,url,**kwargs):
        payload=kwargs['json'];category=payload['appliedFacets']['jobFamilyGroup'][0]
        calls[category]=calls.get(category,0)+1
        ids=[1,2] if category=='engineering' else [1 if fault=='overlap' else 3]
        if fault=='changed' and calls[category]>1:ids=ids[::-1] if len(ids)>1 else [4]
        if fault=='truncated' and category=='engineering':ids=[1]
        data={'total':2 if category=='engineering' else 1,'jobPostings':[{'externalPath':f'/job/India/{i}','title':'Java Engineer'} for i in ids]}
        return httpx.Response(200,json=data,request=httpx.Request(method,url))
    if fault:
        with pytest.raises((ValueError,SnapshotChanged)):
            asyncio.run(category_postings(None,'https://example.test',initial,request))
    else:
        rows,total=asyncio.run(category_postings(None,'https://example.test',initial,request))
        assert total==len(rows)==3
        assert len({row['externalPath'] for row in rows})==3
        assert calls=={'engineering':2,'operations':2}


@pytest.mark.parametrize('fault', ['duplicate_once', 'duplicate_always', 'missing_id'])
def test_category_snapshot_retry_discards_bad_attempt_and_is_bounded(monkeypatch, fault):
    from scraper import adapters
    from scraper.main import fetch_company_jobs
    from scraper.models import Company
    import scraper.main as main

    attempts = 0
    category_calls = 0
    rows = [{'externalPath': f'/job/India/Software-Engineer_R{i}',
             'title': 'Software Engineer', 'locationsText': 'Bengaluru, India'} for i in [1, 2]]

    async def request(client, method, url, **kwargs):
        nonlocal attempts, category_calls
        req = httpx.Request(method, url)
        if method == 'GET':
            return httpx.Response(200, request=req, json={'jobPostingInfo': {
                'jobReqId': url.rsplit('_', 1)[-1], 'title': 'Software Engineer',
                'location': 'Bengaluru, India', 'jobDescription': 'Java; 0 to 2 years experience.'}})
        category = kwargs['json']['appliedFacets'].get('jobFamilyGroup')
        if not category:
            # Initial global listing plus final global verification on success.
            if category_calls == 0:
                attempts += 1
            return httpx.Response(200, request=req, json={'total': 2, 'jobPostings': rows,
                'facets': [{'facetParameter': 'jobFamilyGroup', 'values': [
                    {'id': 'published-category', 'count': 2}]}]})
        category_calls += 1
        batch = list(rows)
        if fault == 'duplicate_always' or (fault == 'duplicate_once' and attempts == 1):
            batch = [rows[0], rows[0]]
            category_calls = 0
        if fault == 'missing_id':
            batch = [rows[0], {**rows[1], 'externalPath': ''}]
        return httpx.Response(200, request=req, json={'total': 2, 'jobPostings': batch})

    async def sleep(_):
        pass

    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'fetch_detail', lambda client, url: request(client, 'GET', url))
    monkeypatch.setattr(main.asyncio, 'sleep', sleep)
    company = Company('Maersk', 'https://maersk.wd3.myworkdayjobs.com/en-US/Maersk_Careers',
                      'workday_complete', 'maersk|Maersk_Careers')
    if fault == 'duplicate_once':
        jobs, total = asyncio.run(fetch_company_jobs(company))
        assert attempts == 2 and total == len(jobs) == 2
        assert len({j.external_job_id for j in jobs}) == 2
    elif fault == 'duplicate_always':
        with pytest.raises(SnapshotChanged, match='category=published-category, offset=0'):
            asyncio.run(fetch_company_jobs(company))
        assert attempts == 2
    else:
        with pytest.raises(ValueError) as error:
            asyncio.run(fetch_company_jobs(company))
        assert not isinstance(error.value, SnapshotChanged)
        assert attempts == 1
