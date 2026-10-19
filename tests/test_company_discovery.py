import asyncio
import json
import httpx
import pytest
from scripts import discover_companies as discovery


def item(name='New Employer',location='Bengaluru, India',url='https://jobs.ashbyhq.com/new-employer/job-1'):
    return {'company': name, 'location': location, 'url': url, 'title': 'Java Developer', 'posted_at': '2026-10-19T00:00:00Z'}


def test_location_tags_and_existing_board_aliases_cannot_expand_registry():
    known = [{'company_name': 'HPE', 'careers_url': 'https://hpe.wd5.myworkdayjobs.com/Jobsathpe'}]
    payload = {'data': [item(location='Indianapolis, IN'), item(name='Hewlett Packard Enterprise', url='https://hpe.wd5.myworkdayjobs.com/en-US/Jobsathpe/job/Bangalore/Engineer_1'), item()]}
    result = discovery.review_candidates([payload], known)
    assert [row['company'] for row in result['candidates']] == ['New Employer']
    assert result['skipped']['wrong_location'] == result['skipped']['existing_source'] == 1
    assert result['production_writes'] == 0
    assert not result['candidates'][0]['enabled']
    assert not result['candidates'][0]['evidence'][0]['employer_date_verified']


def test_aliases_and_oracle_cx_sites_share_a_candidate_and_keep_original_timestamps():
    rows = [item(name=name,url=f'https://employer.fa.ocs.oraclecloud.com/hcmUI/CandidateExperience/en/sites/{site}/job/1?utm_source=freehire.me') for name,site in [('Employer','CX'),('Employer Limited','CX_1')]]
    result=discovery.review_candidates([{'data':rows}],[])
    assert len(result['candidates'])==1
    candidate=result['candidates'][0]
    assert candidate['aliases']==['Employer','Employer Limited']
    assert all(row['aggregator_posted_at']=='2026-10-19T00:00:00Z' for row in candidate['evidence'])
    assert all('utm_source' not in row['url'] for row in candidate['evidence'])


@pytest.mark.parametrize('url',['https://example.test/jobs','http://jobs.ashbyhq.com/tenant/1','https://user:pass@jobs.ashbyhq.com/tenant/1','https://jobs.ashbyhq.com:444/tenant/1','javascript:alert(1)',None,{},42])
def test_untrusted_urls_never_become_a_supported_source(url):
    assert discovery.source_identity(url) is None


def test_invalid_lists_and_over_budget_pages_fail():
    for payload in [{}, {'data':'bad'}, {'data':[None]}, {'data':[item()]*51}]:
        with pytest.raises(ValueError):discovery.review_candidates([payload],[])


def test_candidate_limit_reports_deferred_rows_without_enabling_them():
    payloads=[{'data':[item(name=f'Employer {i}',url=f'https://jobs.ashbyhq.com/employer-{i}/job-1') for i in range(start,start+40)]} for start in (0,40)]
    result=discovery.review_candidates(payloads,[])
    assert len(result['candidates'])==50 and result['deferred_candidates']==30
    assert all(row['status']=='needs_official_verification' and row['enabled'] is False for row in result['candidates'])


def test_source_outage_fails_once_and_does_not_turn_into_an_empty_success(monkeypatch):
    calls=[]
    class Client:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def get(self,url,**kwargs):
            calls.append(url);return httpx.Response(429,request=httpx.Request('GET',url))
    monkeypatch.setattr(discovery.httpx,'AsyncClient',Client)
    with pytest.raises(httpx.HTTPStatusError):asyncio.run(discovery.collect())
    assert len(calls)==1


def test_invalid_input_cannot_replace_a_last_good_report(monkeypatch,tmp_path):
    source=tmp_path/'source.json';source.write_text('{"data":"invalid"}')
    target=tmp_path/'candidates.json';target.write_text('last good report')
    monkeypatch.setattr('sys.argv',['discover_companies','--input',str(source),'--output',str(target)])
    with pytest.raises(ValueError):discovery.main()
    assert target.read_text()=='last good report'


def test_hung_discovery_stops_at_run_budget(monkeypatch):
    cancelled=[]
    class Client:
        def __init__(self,**kwargs):pass
        async def __aenter__(self):return self
        async def __aexit__(self,*args):pass
        async def get(self,*args,**kwargs):
            try:await asyncio.Event().wait()
            finally:cancelled.append(True)
    monkeypatch.setattr(discovery.httpx,'AsyncClient',Client)
    monkeypatch.setitem(discovery.CONFIG,'run_timeout_seconds',0.01)
    with pytest.raises(TimeoutError):asyncio.run(discovery.collect())
    assert cancelled==[True]
