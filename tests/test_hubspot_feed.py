import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company

HUBSPOT_COMPANY = Company(
    'HubSpot',
    'https://job-boards.greenhouse.io/hubspotjobs',
    'greenhouse',
    'hubspotjobs',
    4,
    True
)

def test_hubspot_greenhouse_feed_success(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        assert 'boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs' in url
        data = {
            'jobs': [
                {
                    'id': 5990250,
                    'title': 'Account Executive - Enterprise',
                    'absolute_url': 'https://www.hubspot.com/careers/jobs/5990250?gh_jid=5990250',
                    'location': {'name': 'Remote - USA'},
                    'offices': [{'location': 'Cambridge, Massachusetts'}],
                    'content': '&lt;p&gt;Role overview and responsibilities&lt;/p&gt;'
                },
                {
                    'id': 5990251,
                    'title': 'Associate Software Engineer',
                    'absolute_url': 'https://www.hubspot.com/careers/jobs/5990251?gh_jid=5990251',
                    'location': {'name': 'Bengaluru, India'},
                    'offices': [{'location': 'Bengaluru'}],
                    'content': '&lt;p&gt;Software development; 0-2 years experience required.&lt;/p&gt;'
                }
            ]
        }
        return httpx.Response(200, request=httpx.Request(method, url), json=data)

    async def mock_detail(client, url):
        return httpx.Response(200, request=httpx.Request('GET', url), json={
            'first_published': '2026-10-18T10:00:00Z'
        })

    monkeypatch.setattr(adapters, 'request', mock_request)
    monkeypatch.setattr(adapters, 'fetch_detail', mock_detail)

    adapter = adapters.GreenhouseAdapter()
    jobs, total = asyncio.run(adapter.fetch_jobs(HUBSPOT_COMPANY))
    assert total == 2
    assert len(jobs) == 2
    assert jobs[0].company == 'HubSpot'
    assert jobs[0].external_job_id == '5990250'
    assert jobs[1].title == 'Associate Software Engineer'

def test_hubspot_greenhouse_feed_empty(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(200, request=httpx.Request(method, url), json={'jobs': []})

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = adapters.GreenhouseAdapter()
    jobs, total = asyncio.run(adapter.fetch_jobs(HUBSPOT_COMPANY))
    assert total == 0
    assert len(jobs) == 0

def test_hubspot_greenhouse_feed_404_error(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(404, request=httpx.Request(method, url), text='Not Found')

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = adapters.GreenhouseAdapter()
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(adapter.fetch_jobs(HUBSPOT_COMPANY))

def test_hubspot_greenhouse_feed_500_error(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(500, request=httpx.Request(method, url), text='Internal Server Error')

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = adapters.GreenhouseAdapter()
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(adapter.fetch_jobs(HUBSPOT_COMPANY))
