import asyncio
import json

import httpx
import pytest

from scraper import adapters
from scraper.models import Company
from scraper.successfactors import SuccessFactorsCareerAdapter, public_posting


SOURCE = Company('PayU', 'https://careers.payu.in/PayU/go/_/514880/', 'successfactors', 'PayU')


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def page(start, end, total, identifier, location='Bengaluru, IN', next_url=None):
    row = f'<tr class="data-row"><td><a class="jobTitle-link" href="/PayU/job/Software-Engineer/{identifier}/">Software Engineer</a></td><td class="colLocation"><span class="jobLocation">{location}</span></td></tr>' if identifier else ''
    pagination = f'<div class="pagination"><a href="{next_url}">Next</a></div>' if next_url else ''
    return f'<span class="paginationLabel">Results {start} – {end} of {total}</span>{row}{pagination}'


def response(url, body):
    return httpx.Response(200, text=body, request=httpx.Request('GET', url))


def install(monkeypatch, listing, detail):
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', listing)
    monkeypatch.setattr(adapters, 'cached_get', detail)


def test_collects_small_pages_and_reads_authoritative_microdata(monkeypatch):
    calls = []
    async def listing(client, method, url, **kwargs):
        calls.append(url)
        if '/1/' in url: return response(url, page(2, 2, 2, '102'))
        return response(url, page(1, 1, 2, '101', next_url='/PayU/go/_/514880/1/'))
    async def detail(client, url):
        return response(url, '<span itemprop="title">Software Engineer</span><span itemprop="description">Build Java APIs. Required experience: 0-2 years.</span><span itemprop="jobLocation"><meta itemprop="streetAddress" content="Bengaluru, IN"></span><meta itemprop="datePosted" content="Tue Oct 06 02:00:00 UTC 2026">')
    install(monkeypatch, listing, detail)
    jobs, count = asyncio.run(SuccessFactorsCareerAdapter().fetch_jobs(SOURCE))
    assert count == 2 and len(jobs) == 2 and len(calls) == 3
    assert jobs[0].posted_at == '2026-10-06T02:00:00+00:00'
    assert jobs[0].location == 'Bengaluru, IN'
    assert not jobs.coverage_warning


@pytest.mark.parametrize('failure', ['repeat', 'missing_next', 'external_next', 'changed_count', 'malformed'])
def test_rejects_incomplete_or_unrelated_listing(monkeypatch, failure):
    async def listing(client, method, url, **kwargs):
        if failure == 'malformed': return response(url, '<html>Loading...</html>')
        if '/1/' in url:
            return response(url, page(2, 2, 3 if failure == 'changed_count' else 2,
                                      '101' if failure == 'repeat' else '102'))
        next_url = None if failure == 'missing_next' else ('https://other.example/PayU/go/_/514880/1/' if failure == 'external_next' else '/PayU/go/_/514880/1/')
        return response(url, page(1, 1, 2, '101', next_url=next_url))
    async def detail(client, url): pytest.fail('Incomplete listing must not fetch details')
    install(monkeypatch, listing, detail)
    with pytest.raises(ValueError): asyncio.run(SuccessFactorsCareerAdapter().fetch_jobs(SOURCE))


def test_fetches_hidden_target_location_and_keeps_missing_date_unknown(monkeypatch):
    async def listing(client, method, url, **kwargs): return response(url, page(1, 1, 1, '101', location='Mumbai, IN +2 more…'))
    async def detail(client, url):
        data = {'@type': 'JobPosting', 'title': 'Software Engineer', 'description': 'Build Java services, 0-2 years.',
                'jobLocation': [{'address': {'addressLocality': 'Mumbai'}}, {'address': {'addressLocality': 'Hyderabad'}}]}
        return response(url, '<script type="application/ld+json">' + json.dumps(data) + '</script>')
    install(monkeypatch, listing, detail)
    jobs, count = asyncio.run(SuccessFactorsCareerAdapter().fetch_jobs(SOURCE))
    assert count == 1 and len(jobs) == 1
    assert 'Hyderabad' in jobs[0].location and jobs[0].posted_at is None


def test_incomplete_relevant_detail_retains_coverage_warning(monkeypatch):
    async def listing(client, method, url, **kwargs): return response(url, page(1, 1, 1, '101'))
    async def detail(client, url): return response(url, '<span itemprop="title">Software Engineer</span>')
    install(monkeypatch, listing, detail)
    jobs, count = asyncio.run(SuccessFactorsCareerAdapter().fetch_jobs(SOURCE))
    assert count == 1 and not jobs and jobs.coverage_warning.startswith('Limited coverage:')


def test_explicit_zero_results_is_complete(monkeypatch):
    async def listing(client, method, url, **kwargs): return response(url, page(0, 0, 0, None))
    async def detail(client, url): pytest.fail('No jobs')
    install(monkeypatch, listing, detail)
    jobs, count = asyncio.run(SuccessFactorsCareerAdapter().fetch_jobs(SOURCE))
    assert count == 0 and not jobs and jobs.coverage_warning is None


def test_date_without_explicit_timezone_is_not_assigned_one():
    assert public_posting('6 Oct 2026') == '6 Oct 2026'
