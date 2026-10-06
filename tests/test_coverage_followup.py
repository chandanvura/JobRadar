import asyncio
import json

import httpx
import pytest

from scraper import adapters
from scraper.icims import ICIMSCareerAdapter
from scraper.infosys import InfosysCareerAdapter
from scraper.models import Company
from scraper.public_platforms import PhenomCareerAdapter


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def response(url, **kwargs):
    return httpx.Response(200, request=httpx.Request('GET', url), **kwargs)


def test_infosys_uses_runtime_endpoint_and_preserves_experience_without_inventing_date(monkeypatch):
    calls = []
    async def request(client, method, url, **kwargs):
        calls.append((url, kwargs))
        if url.endswith('environment.json'):
            return response(url, json={'JobsUnAuthUrl': 'https://intapgateway.infosysapps.com/careersci/search/intapjbsrch/'})
        return response(url, json=[dict(postingId=123, sourceId=21, company='Infosys Limited', country='India',
            postingTitle='Java Software Engineer', location=' BANGALORE ', referenceCode='INFSYS-123',
            rolesResponsibilities='Build payment services', minExperienceLevel=0, maxExperienceLevel=2,
            createdOn='2026-10-06T00:00:00')])
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', request)
    jobs, count = asyncio.run(InfosysCareerAdapter().fetch_jobs(Company('Infosys', 'https://career.infosys.com/joblist', 'infosys', 'infosys-india')))
    assert count == 1 and len(jobs) == 1
    assert jobs[0].posted_at is None
    assert '0-2 years' in jobs[0].description
    assert 'jobReferenceCode=INFSYS-123' in jobs[0].job_url
    assert calls[-1][1]['params'] == {'sourceId': '1,21', 'searchText': 'ALL'}


@pytest.mark.parametrize('body', ['<html>Access denied</html>', '<div class="iCIMS_JobsTable"><div class="row">missing link</div></div>'])
def test_icims_does_not_count_blocked_or_malformed_pages_as_complete_empty(monkeypatch, body):
    async def request(client, method, url, **kwargs): return response(url, text=body)
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', request)
    with pytest.raises(ValueError):
        asyncio.run(ICIMSCareerAdapter().fetch_jobs(Company('Example', 'https://example.icims.com', 'icims', 'example')))


def test_icims_follows_next_even_with_small_page_and_rejects_repeats(monkeypatch):
    calls = []
    async def request(client, method, url, **kwargs):
        calls.append(url)
        return response(url, text='<div class="iCIMS_JobsTable"><div class="row"><h3><a href="/jobs/123/test/job">Sales</a></h3></div></div><a href="?pr=1"><span class="sr-only">Next page of results</span></a>')
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', request)
    with pytest.raises(ValueError, match='repeated'):
        asyncio.run(ICIMSCareerAdapter().fetch_jobs(Company('Example', 'https://example.icims.com', 'icims', 'example')))
    assert len(calls) == 2


def test_lowes_embedded_india_results_reject_premature_end(monkeypatch):
    config = dict(baseUrl='https://talent.lowes.com/in/en/', widgetApiEndpoint='https://talent.lowes.com/widgets',
                  refNum='LOWEUS', country='in', locale='en_in')
    async def request(client, method, url, **kwargs):
        assert method == 'GET'
        body = 'var phApp = phApp || ' + json.dumps(config) + ';'
        if 'search-results' in url:
            body += 'phApp.ddo = ' + json.dumps({'eagerLoadRefineSearch': {'status': 200, 'totalHits': 1, 'data': {'jobs': []}}})
        return response(url, text=body)
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', request)
    with pytest.raises(ValueError, match='ended before'):
        asyncio.run(PhenomCareerAdapter().fetch_jobs(Company("Lowe's India", config['baseUrl'], 'phenom', 'LOWEUS')))
