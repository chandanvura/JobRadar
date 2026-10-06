import asyncio
import copy
import json
import httpx
import pytest
from scraper import adapters
from scraper.models import Company
from scraper.snapshot import SnapshotChanged
from scraper.thoughtspot import OFFICIAL, LISTING, ThoughtSpotCareerAdapter, listing_records, detail_record

ROW = dict(id='one', name='Software Engineer', url='https://ats.rippling.com/thoughtspot/jobs/one',
           locations=[{'name': 'Bengaluru, India'}, {'name': 'Hyderabad, India'}])

def detail(row=ROW):
    board = dict(companyName='ThoughtSpot', slug='thoughtspot', boardURL=OFFICIAL)
    job = dict(uuid=row['id'], name=row['name'], url=row['url'], companyName='ThoughtSpot',
               unlistedFromSearch=False, workLocations=[v['name'] for v in row['locations']],
               description=dict(company='<p>ThoughtSpot</p>', role='<p>Java; 0 to 2 years experience</p>'),
               createdOn='2026-10-06T01:00:00Z')
    return dict(jobBoard=board, jobPost=job)

def html(api):
    return '<script id="__NEXT_DATA__" type="application/json">'+json.dumps({'props': {'pageProps': {'apiData': api}}})+'</script>'

@pytest.mark.parametrize('mutation', ['duplicate', 'host', 'path', 'missing_name', 'missing_locations', 'cap'])
def test_listing_rejects_incomplete_or_unrelated_boards(mutation):
    row=copy.deepcopy(ROW);rows=[row]
    if mutation=='duplicate': rows.append(dict(row, name='Different Engineer'))
    elif mutation=='host':row['url']='https://example.com/thoughtspot/jobs/one'
    elif mutation=='path':row['url']='https://ats.rippling.com/other/jobs/one'
    elif mutation=='missing_name':row['name']=''
    elif mutation=='missing_locations':row['locations']=None
    else:rows=[row]*1001
    with pytest.raises(ValueError):listing_records({'data':rows})

@pytest.mark.parametrize('mutation', ['employer','backlink','id','requirements','location','unlisted'])
def test_detail_identity_and_completeness(mutation):
    api=detail()
    if mutation=='employer':api['jobBoard']['companyName']='Other'
    elif mutation=='backlink':api['jobBoard']['boardURL']='https://example.com/careers'
    elif mutation=='id':api['jobPost']['uuid']='different'
    elif mutation=='requirements':api['jobPost']['description']['role']=''
    elif mutation=='location':api['jobPost']['workLocations']=['London']
    else:api['jobPost']['unlistedFromSearch']=True
    with pytest.raises(ValueError):detail_record(html(api),ROW)

@pytest.mark.parametrize('changed', [False,True])
def test_complete_array_all_details_and_final_snapshot(monkeypatch,changed):
    calls=[]
    async def request(x,method,url,**kwargs):
        calls.append(url)
        if url==LISTING:
            rows=[] if changed and calls.count(LISTING)>1 else [ROW]
            return httpx.Response(200,json={'data':rows},request=httpx.Request(method,url))
        return httpx.Response(200,text=html(detail()),request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'request',request)
    c=Company('ThoughtSpot',OFFICIAL,'thoughtspot',LISTING)
    if changed:
        with pytest.raises(SnapshotChanged):asyncio.run(ThoughtSpotCareerAdapter().fetch_jobs(c))
    else:
        jobs,count=asyncio.run(ThoughtSpotCareerAdapter().fetch_jobs(c))
        assert count==len(jobs)==1 and jobs[0].posted_at is None
        assert 'Bengaluru' in jobs[0].location and 'Hyderabad' in jobs[0].location
        assert '0 to 2 years' in jobs[0].description
        assert calls==[LISTING,ROW['url'],LISTING]


def test_location_variants_merge_only_identical_job_identity():
    other = dict(ROW, locations=[{'name': 'London, United Kingdom'}])
    records = listing_records({'data': [ROW, other]})
    assert len(records) == 1
    assert [v['name'] for v in records['one']['locations']] == ['Bengaluru, India', 'Hyderabad, India', 'London, United Kingdom']
    api = detail(records['one'])
    api['jobPost']['workLocations'].reverse()
    assert detail_record(html(api), records['one'])['uuid'] == 'one'
