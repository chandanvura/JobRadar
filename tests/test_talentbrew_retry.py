import asyncio
import pytest
from scraper.talentbrew import TalentBrewCareerAdapter, TalentBrewPaginationChanged


def test_restarts_an_incomplete_scan_once(monkeypatch):
    adapter = TalentBrewCareerAdapter()
    calls = []
    async def scan(company):
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
        async def scan(company):
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
