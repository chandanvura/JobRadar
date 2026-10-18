import asyncio
import pytest
from scraper.talentbrew import TalentBrewCareerAdapter, TalentBrewPaginationChanged


def test_restarts_an_incomplete_scan_once(monkeypatch):
    adapter = TalentBrewCareerAdapter()
    calls = []
    async def scan(company, **kwargs):
        calls.append(company)
        if len(calls) == 1:
            raise TalentBrewPaginationChanged('count changed')
        return ['complete'], 1
    monkeypatch.setattr(adapter, '_fetch_jobs', scan)
    assert asyncio.run(adapter.fetch_jobs('employer')) == (['complete'], 1)
    assert calls == ['employer', 'employer']


def test_persistent_gaps_and_other_errors_remain_failures(monkeypatch):
    adapter = TalentBrewCareerAdapter()
    for error, expected_calls in [(TalentBrewPaginationChanged('incomplete'), 2), (ValueError('wrong employer'), 1)]:
        calls = []
        async def scan(company, **kwargs):
            calls.append(company)
            raise error
        monkeypatch.setattr(adapter, '_fetch_jobs', scan)
        with pytest.raises(type(error), match=str(error)):
            asyncio.run(adapter.fetch_jobs('employer'))
        assert len(calls) == expected_calls


def test_reported_count_must_match_unique_jobs(monkeypatch):
    import httpx
    from scraper import adapters
    from scraper.models import Company
    calls = []
    async def request(client, method, url, **kwargs):
        calls.append(url)
        return httpx.Response(200, request=httpx.Request('GET', url), text=
            '<section id="search-results" data-organization-ids="123" data-total-results="2">'
            '<section id="search-results-list"><a data-job-id="1" href="/job/1">Role</a></section></section>')
    monkeypatch.setattr(adapters, 'request', request)
    with pytest.raises(TalentBrewPaginationChanged, match='reported count'):
        asyncio.run(TalentBrewCareerAdapter().fetch_jobs(Company('Employer', 'https://careers.example/search', 'talentbrew', '123')))
    assert len(calls) == 2


def test_snapshot_retry_preserves_india_and_checks_complete_count(monkeypatch):
    import httpx
    from scraper import adapters
    from scraper.models import Company
    calls = []
    page = '<section id="search-results" data-organization-ids="123" data-total-results="2" data-ajax-url="/search-jobs/results" data-facet-term="1269750" data-facet-type="2"><section id="search-results-list"><a data-job-id="1" href="/job/1">Unrelated role</a></section></section><section id="search-filters"><input class="filter-checkbox" checked data-id="1269750" data-facet-type="2"></section>'
    async def request(client, method, url, **kwargs):
        calls.append(url)
        if url.endswith('/results'):
            assert kwargs['params']['FacetFilters[0].ID'] == '1269750'
            assert kwargs['params']['FacetFilters[0].IsApplied'] == 'true'
            assert kwargs['params']['RecordsPerPage'] == 2000
            return httpx.Response(200, request=httpx.Request('GET', url), json={'results': page.replace('data-total-results="2"', 'data-total-results="1"')})
        return httpx.Response(200, request=httpx.Request('GET', url), text=page)
    monkeypatch.setattr(adapters, 'request', request)
    jobs, count = asyncio.run(TalentBrewCareerAdapter().fetch_jobs(Company('Employer', 'https://careers.example/search', 'talentbrew', '123')))
    assert jobs == [] and count == 1
    assert len(calls) == 3


@pytest.mark.parametrize('fresh_status,fresh_description', [(200, 'Java and 2 years experience'), (200, ''), (404, ''), (503, '')])
def test_missing_cached_requirements_revalidate_once_without_accepting_incomplete_jobs(monkeypatch, fresh_status, fresh_description):
    import httpx
    from scraper import adapters
    from scraper.models import Company
    calls = []
    listing = ('<section id="search-results" data-organization-ids="123" data-total-results="1">'
               '<ul id="search-results-list"><li><a data-job-id="1" href="/job/1"><h2>Software Engineer</h2></a>'
               '<span class="location">Hyderabad</span></li></ul></section>')
    async def request(client, method, url, **kwargs):
        return httpx.Response(200, text=listing, request=httpx.Request(method, url))
    async def cached(client, url, **kwargs):
        calls.append(kwargs)
        if len(calls) == 1:
            return httpx.Response(200, text='<title>Temporarily unavailable</title>', request=httpx.Request('GET', url))
        return httpx.Response(fresh_status, text='<div id="job-description">' + fresh_description + '</div>', request=httpx.Request('GET', url))
    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'cached_get', cached)
    company = Company('Employer', 'https://careers.example/search', 'talentbrew', '123')
    if fresh_status == 503:
        with pytest.raises(httpx.HTTPStatusError):
            asyncio.run(TalentBrewCareerAdapter().fetch_jobs(company))
    elif fresh_status == 200 and not fresh_description:
        with pytest.raises(ValueError, match='missing the full description'):
            asyncio.run(TalentBrewCareerAdapter().fetch_jobs(company))
    else:
        jobs, count = asyncio.run(TalentBrewCareerAdapter().fetch_jobs(company))
        assert count == 1
        assert len(jobs) == (0 if fresh_status == 404 else 1)
        if jobs:
            assert jobs[0].description == fresh_description
            assert jobs[0].posted_at is None
    assert calls == [{}, {'ttl_hours': 0}]
