import asyncio
import json

import httpx
import pytest
from bs4 import BeautifulSoup

from scraper import adapters
from scraper.models import Company


def test_xml_feed_preserves_descriptions_locations_and_identity_without_expiry_dates():
    xml = '''<rss xmlns:g="http://base.google.com/ns/1.0"><channel>
    <item><title>Graduate Software Engineer (Bengaluru, IN)</title>
    <description>&amp;lt;p&amp;gt;Fresh graduates; Java&amp;lt;/p&amp;gt;</description>
    <link>https://jobs.example/job/123</link><guid>123</guid>
    <g:location>Bengaluru, IN</g:location><g:expiration_date>2026-11-04</g:expiration_date></item>
    <item><title>HR</title><link>https://jobs.example/job/124</link><guid>124</guid><g:location>London</g:location></item>
    </channel></rss>'''
    jobs, count = adapters.parse_public_xml(xml, 'Example', 'https://jobs.example')
    assert count == 2
    assert jobs[0].external_job_id == '123'
    assert jobs[0].title == 'Graduate Software Engineer'
    assert jobs[0].description == 'Fresh graduates; Java'
    assert jobs[0].posted_at is None
    with pytest.raises(ValueError):
        adapters.parse_public_xml('<html><body>Blocked</body></html>', 'Example', 'https://jobs.example')


@pytest.mark.parametrize('markup,expected', [
    ('<meta itemprop="datePosted" content="Fri Sep 25 00:00:00 UTC 2026">', '2026-09-25'),
    ('<span class="joblayouttoken-label">Posting Start Date:</span><span lang="en-US">11/14/25</span>', '2025-11-14'),
    ('<span class="joblayouttoken-label">Posting Start Date:</span><span lang="en-US">10/05/2026</span>', '2026-10-05'),
    ('<span class="joblayouttoken-label">Posting Start Date:</span><span lang="en-GB">05/10/2026</span>', '2026-10-05'),
    ('<span class="joblayouttoken-label">Posting End Date:</span><span lang="en-GB">05/10/2026</span>', None),
    ('<meta itemprop="validThrough" content="2026-11-04">', None),
    ('<span class="joblayouttoken-label">Posting Start Date:</span><span>05/10/2026</span>', None),
])
def test_employer_dates_respect_locale_and_ignore_expiry(markup, expected):
    assert adapters.employer_posted_date(BeautifulSoup(markup, 'html.parser')) == expected


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def test_xml_only_fetches_relevant_details_and_preserves_unknown_dates(monkeypatch):
    detail_calls = []
    xml = '<rss><channel><item><title>Software Engineer</title><location>Bengaluru</location><link>https://jobs.example/job/123</link><guid>123</guid></item><item><title>Software Engineer</title><location>London</location><link>https://jobs.example/job/124</link></item></channel></rss>'
    async def get(client, method, url, **kwargs):
        return httpx.Response(200, text=xml, request=httpx.Request(method, url))
    async def detail(client, url):
        detail_calls.append(url)
        return httpx.Response(200, text='<meta itemprop="validThrough" content="2026-11-04">', request=httpx.Request('GET', url))
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', get)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    jobs, count = asyncio.run(adapters.PublicXMLAdapter().fetch_jobs(Company('Example', 'https://jobs.example', 'xml', 'https://jobs.example/googlefeed.xml')))
    assert count == 2 and len(jobs) == 1
    assert jobs[0].posted_at is None
    assert detail_calls == ['https://jobs.example/job/123']


def test_oracle_pagination_details_and_secondary_city(monkeypatch):
    calls = []
    pages = [dict(TotalJobsCount=3, requisitionList=[
        dict(Id='123', Title='Software Engineer', PrimaryLocation='Pune', secondaryLocations=[dict(Name='Bengaluru, India')]),
        dict(Id='124', Title='Software Engineer', PrimaryLocation='London')]),
        dict(TotalJobsCount=3, requisitionList=[dict(Id='125', Title='HR Manager', PrimaryLocation='Bengaluru')])]
    async def get(client, method, url, **kwargs):
        calls.append(kwargs['params'])
        return httpx.Response(200, json={'items': [pages[len(calls)-1]]}, request=httpx.Request(method, url))
    async def detail(client, url):
        assert 'ById%3BId%3D%22123%22%2CsiteNumber%3DCX_1' in url
        return httpx.Response(200, json={'items': [dict(Title='Software Engineer', PrimaryLocation='Pune',
                              secondaryLocations=[dict(Name='Bengaluru, India')], ExternalDescriptionStr='<p>Develop services</p>',
                              ExternalQualificationsStr='<p>0-2 years; Java</p>', ExternalPostedStartDate='2026-10-05T10:20:00Z')]},
                              request=httpx.Request('GET', url))
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', get)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    jobs, count = asyncio.run(adapters.OracleCareerAdapter().fetch_jobs(Company('Example', 'https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1', 'oracle', 'CX_1')))
    assert count == 3 and len(jobs) == 1
    assert 'offset=2' in calls[1]['finder']
    assert 'Bengaluru' in jobs[0].location
    assert '0-2 years; Java' in jobs[0].description
    assert jobs[0].posted_at == '2026-10-05T10:20:00+00:00'
    assert jobs[0].job_url == 'https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/123'


def test_oracle_repeated_pages_fail_instead_of_looping_or_claiming_complete(monkeypatch):
    async def get(client, method, url, **kwargs):
        return httpx.Response(200, json={'items': [dict(TotalJobsCount=100, requisitionList=[dict(Id='123', Title='HR Manager')])]}, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', get)
    with pytest.raises(ValueError, match='pagination repeated'):
        asyncio.run(adapters.OracleCareerAdapter().fetch_jobs(Company('Example', 'https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1', 'oracle', 'CX_1')))


def test_embedded_public_api_and_new_provider_discovery():
    cases = [
        ('https://boards-api.greenhouse.io/v1/boards/druva/jobs', ('greenhouse', 'druva')),
        ('https://my.greenhouse.io/users/sign_in?job_board=veeamsoftware', ('greenhouse', 'veeamsoftware')),
        ('https://acme.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1', ('oracle', 'acme.fa.oraclecloud.com|CX_1')),
        ('https://careers.smartrecruiters.com/WesternDigital', ('smartrecruiters', 'WesternDigital')),
        ('https://acme.fa.oraclecloud.com/hcmRestApi/CandidateExperience/siteFavicon/favicon.png?siteNumber=CX_1', ('oracle', 'acme.fa.oraclecloud.com|CX_1')),
    ]
    for url, expected in cases:
        assert adapters.discover_ats(BeautifulSoup(f'<a href="{url}">Careers</a>', 'html.parser'), 'https://employer.test')[:2] == expected
    assert adapters.discover_ats(BeautifulSoup('<a href="https://evil.test/hcmUI/CandidateExperience/en/sites/CX_1">Jobs</a>', 'html.parser'), 'https://employer.test') is None
