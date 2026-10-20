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
