import asyncio
import json

import httpx
import pytest

from scraper.eightfold_legacy import LegacyEightfoldCareerAdapter, career_config, posted_date, search_page
from scraper.models import Company


def payload(ids, count=11):
    return {'domain': 'employer.example', 'query': {'location': 'India'}, 'count': count,
            'positions': [{'id': i, 'name': 'Software Engineer', 'location': 'Bengaluru, India', 'isPrivate': False} for i in ids]}


def test_legacy_search_validates_identity_count_filter_and_privacy():
    assert search_page(payload([1]), 'employer.example')[1] == 11
    for change in [{'domain': 'other'}, {'query': {'location': ''}}, {'count': 2001}, {'count': 12}]:
        with pytest.raises(ValueError, match='count or employer'):
            search_page(dict(payload([1]), **change), 'employer.example', 11)
    with pytest.raises(ValueError, match='identifiers'):
        search_page(payload([1, 1]), 'employer.example')
    private = payload([1]); private['positions'][0]['isPrivate'] = True
    with pytest.raises(ValueError, match='private'):
        search_page(private, 'employer.example')
    with pytest.raises(ValueError, match='configuration'):
        career_config('<code id="smartApplyData">{"domain":"employer.example"}</code>', 'employer.example')


def posting(identifier=1):
    data = {'@type': 'JobPosting', 'title': 'Software Engineer', 'datePosted': '2026-10-06',
            'url': f'https://jobs.example/careers?domain=employer.example&pid={identifier}'}
    return '<script type="application/ld+json">' + json.dumps(data) + '</script>'


def test_legacy_original_date_requires_matching_public_job_posting():
    assert posted_date(posting(), 'jobs.example', 'employer.example', '1', 'Software Engineer') == '2026-10-06'
    assert posted_date('<p>Updated today</p>', 'jobs.example', 'employer.example', '1', 'Software Engineer') is None
    with pytest.raises(ValueError, match='listing'):
        posted_date(posting(2), 'jobs.example', 'employer.example', '1', 'Software Engineer')


def test_legacy_pagination_collects_all_pages_and_full_details(monkeypatch):
    from scraper import adapters
    calls = []
    async def request(client, method, url, **kwargs):
        if '/api/' not in url:
            text = '<code id="smartApplyData">{"domain":"employer.example","excludePrivatePositions":true}</code>'
            return httpx.Response(200, request=httpx.Request(method, url), text=text)
        offset = kwargs['params']['start']; calls.append(offset)
        data = payload(range(1, 11) if offset == 0 else [11])
        return httpx.Response(200, request=httpx.Request(method, url), json=data)
    async def detail(client, url):
        if '/api/' in url:
            identifier = int(url.split('/jobs/')[1].split('?')[0])
            data = {'id': identifier, 'isPrivate': False, 'name': 'Software Engineer',
                    'location': 'Bengaluru, India', 'job_description': 'Full Java requirements: 0 to 2 years experience',
                    't_update': 9999999999, 't_create': 9999999999}
            return httpx.Response(200, request=httpx.Request('GET', url), json=data)
        identifier = int(url.split('pid=')[1])
        return httpx.Response(200, request=httpx.Request('GET', url), text=posting(identifier))
    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    company = Company('Employer', 'https://jobs.example/careers?domain=employer.example',
                      'eightfold_legacy', 'jobs.example|employer.example')
    jobs, count = asyncio.run(LegacyEightfoldCareerAdapter().fetch_jobs(company))
    assert count == 11 and len(jobs) == 11 and calls == [0, 10]
    assert all(j.posted_at.startswith('2026-10-06') and '0 to 2' in j.description for j in jobs)


def test_legacy_adapter_rejects_duplicates_between_pages(monkeypatch):
    from scraper import adapters
    async def request(client, method, url, **kwargs):
        if '/api/' not in url:
            return httpx.Response(200, request=httpx.Request(method, url), text='<code id="smartApplyData">{"domain":"employer.example","excludePrivatePositions":true}</code>')
        ids = range(1, 11) if kwargs['params']['start'] == 0 else [1]
        return httpx.Response(200, request=httpx.Request(method, url), json=payload(ids))
    monkeypatch.setattr(adapters, 'request', request)
    company = Company('Employer', 'https://jobs.example/careers?domain=employer.example',
                      'eightfold_legacy', 'jobs.example|employer.example')
    with pytest.raises(ValueError, match='pagination repeated'):
        asyncio.run(LegacyEightfoldCareerAdapter().fetch_jobs(company))
