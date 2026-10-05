import asyncio
import json

import httpx
from bs4 import BeautifulSoup

from scraper import adapters
from scraper.models import Company


def test_embedded_boards_escaped_scripts_and_data_links():
    cases = [
        ('<script src="//boards.greenhouse.io/embed/job_board/js?for=netskope"></script>', ('greenhouse', 'netskope')),
        ('<a data-ph-href="https://mastercard.wd1.myworkdayjobs.com/CorporateCareers">Jobs</a>', ('workday', 'mastercard|CorporateCareers')),
        (r'<script>{"url":"https:\/\/jobs.ashbyhq.com\/example"}</script>', ('ashby', 'example')),
        (r'<script>{"url":"https:\u002F\u002Fjobs.lever.co\u002Fexample"}</script>', ('lever', 'example')),
    ]
    for markup, expected in cases:
        assert adapters.discover_ats(BeautifulSoup(markup, 'html.parser'), 'https://employer.test/careers')[:2] == expected


def test_discovery_rejects_lookalike_hosts_and_embeds_without_tokens():
    for url in ['https://eviljobs.lever.co/example', 'https://jobs.lever.co.evil.test/example',
                'https://boards.greenhouse.io/embed/job_board/js', 'https://evil.test/jobs.lever.co/example']:
        assert adapters.discover_ats(BeautifulSoup(f'<a href="{url}">Jobs</a>', 'html.parser'), 'https://employer.test') is None


def test_nested_jobposting_and_type_arrays():
    item = {'@type': ['JobPosting', 'Thing'], 'title': 'Engineer'}
    markup = '<script type="application/ld+json">' + json.dumps({'@type': 'ItemList', 'itemListElement': [{'item': item}]}) + '</script>'
    assert list(adapters.jsonld_objects(BeautifulSoup(markup, 'html.parser'))) == [item]


def test_custom_source_discovers_board_on_secondary_official_page(monkeypatch):
    calls = []
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
    async def get(client, method, url, **kwargs):
        calls.append(url)
        return httpx.Response(200, text='<a href="/careers/openings">View jobs</a>', request=httpx.Request(method, url))
    async def detail(client, url):
        return httpx.Response(200, text='<iframe src="https://jobs.lever.co/example"></iframe>', request=httpx.Request('GET', url))
    class Feed:
        async def fetch_jobs(self, company):
            assert company.ats_identifier == 'example'
            return [], 42
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', get)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    monkeypatch.setitem(adapters.ADAPTERS, 'lever', Feed())
    assert asyncio.run(adapters.CustomCareerAdapter().fetch_jobs(Company('Example', 'https://employer.test/careers', 'custom', 'example'))) == ([], 42)
    assert len(calls) == 1


def test_custom_jobs_preserve_secondary_locations_and_url_identity(monkeypatch):
    entries = [dict(title='Engineer', identifier={}, url=f'https://employer.test/jobs/{number}',
                    jobLocation=[{'address': {'addressLocality': 'London'}}, {'address': {'addressLocality': 'Bengaluru'}}]) for number in (1, 2)]
    for item in entries: item['@type'] = 'JobPosting'
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
    async def get(client, method, url, **kwargs):
        markup = '<script type="application/ld+json">' + json.dumps(entries) + '</script>'
        return httpx.Response(200, text=markup, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', get)
    jobs, count = asyncio.run(adapters.CustomCareerAdapter().fetch_jobs(Company('Example', 'https://employer.test/careers', 'custom', 'example')))
    assert count == 2
    assert {job.external_job_id for job in jobs} == {item['url'] for item in entries}
    assert all(job.location == 'London · Bengaluru' for job in jobs)


def test_greenhouse_public_detail_date_handles_javascript_only_pages(monkeypatch):
    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
    async def get(client, method, url, **kwargs):
        return httpx.Response(200, json={'jobs': [{'id': 123, 'title': 'Graduate Software Engineer',
                              'location': {'name': 'Bengaluru'}, 'absolute_url': 'https://employer.test/job/123'}]},
                              request=httpx.Request(method, url))
    async def detail(client, url):
        assert url == 'https://boards-api.greenhouse.io/v1/boards/example/jobs/123'
        return httpx.Response(200, json={'first_published': '2026-10-05T10:00:00Z'}, request=httpx.Request('GET', url))
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', get)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    jobs, count = asyncio.run(adapters.GreenhouseAdapter().fetch_jobs(Company('Example', 'https://employer.test/careers', 'greenhouse', 'example')))
    assert count == 1
    assert jobs[0].posted_at == '2026-10-05T10:00:00+00:00'


def test_employer_jsonld_with_literal_description_newlines():
    from bs4 import BeautifulSoup
    from scraper.adapters import jsonld_objects
    markup='<script type="application/ld+json">{"@type":"JobPosting","title":"Software Engineer","description":"Build services\n0-2 years","datePosted":"2026-10-05"}</script>'
    items=list(jsonld_objects(BeautifulSoup(markup,'html.parser')))
    assert len(items)==1 and items[0]['description']=='Build services\n0-2 years'
    assert items[0]['datePosted']=='2026-10-05'
