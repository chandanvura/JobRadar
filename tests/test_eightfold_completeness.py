import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.eightfold import EightfoldCareerAdapter, search_records
from scraper.main import fetch_company_jobs
from scraper.models import Company
from scraper.snapshot import SnapshotChanged


@pytest.mark.parametrize('data',[{'count':True,'positions':[]},{'count':2001,'positions':[]},{'count':1,'positions':[{}]},{'count':2,'positions':[{'id':1},{'id':1}]}])
def test_malformed_pages_are_never_snapshot_retries(data):
    with pytest.raises(ValueError) as exc:search_records(data)
    assert not isinstance(exc.value,SnapshotChanged)


def test_advertised_count_change_discards_snapshot():
    with pytest.raises(SnapshotChanged):search_records({'count':2,'positions':[{'id':1}]},1)


@pytest.mark.parametrize('failure',[None,'overlap_once','overlap_always','missing_detail','changed_count','early_end','excess','changed_first','private','duplicate_external'])
def test_complete_mode_all_roles_counts_details_and_bounded_retry(monkeypatch,failure):
    attempts=0;offsets=[];details=[]
    async def request(client,method,url,**kwargs):
        nonlocal attempts
        req=httpx.Request(method,url)
        if url.endswith('/careers'):
            attempts+=1
            return httpx.Response(200,text='<code id="pcsx-data">{"domain":"example.com"}</code>',request=req)
        if '/position_details?' in url:
            from urllib.parse import parse_qs,urlsplit
            identifier=int(parse_qs(urlsplit(url).query)['position_id'][0]);details.append(identifier)
            data={'id':identifier,'atsJobId':'REQ' if failure=='duplicate_external' else f'R{identifier}','name':'Sales Representative','locations':['Delhi, India'],'jobDescription':'Full actual requirements','creationTs':1791450000}
            return httpx.Response(404 if failure=='missing_detail' else 200,json={'data':data},request=req)
        offset=kwargs['params']['start'];offsets.append(offset)
        identifier=offset+1
        if offset==1 and (failure=='overlap_always' or (failure=='overlap_once' and attempts==1)):identifier=1
        if failure=='changed_first' and offsets[-3:]==[0,1,0]:identifier=99
        rows=[{'id':identifier,'name':'Sales Representative','locations':['Delhi, India'],'isPrivate':failure=='private'}]
        if failure=='early_end' and offset==1:rows=[]
        if failure=='excess' and offset==1:rows.append({'id':3})
        count=3 if failure=='changed_count' and offset==1 else 2
        return httpx.Response(200,json={'data':{'count':count,'positions':rows}},request=req)
    monkeypatch.setattr(adapters,'request',request)
    monkeypatch.setitem(adapters.ADAPTERS,'complete-test',EightfoldCareerAdapter(complete=True))
    company=Company('Example','https://example.eightfold.ai/careers','complete-test','example.eightfold.ai|example.com')
    if failure not in (None,'overlap_once'):
        with pytest.raises(ValueError):asyncio.run(fetch_company_jobs(company))
        assert attempts<=2
    else:
        jobs,count=asyncio.run(fetch_company_jobs(company))
        assert count==len(jobs)==2 and set(details)=={1,2}
        assert all(j.posted_at is None and j.location=='Delhi, India' for j in jobs)
        assert attempts==(2 if failure=='overlap_once' else 1)
