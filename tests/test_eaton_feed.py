import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.eightfold import EightfoldCareerAdapter
from scraper.models import Company

EATON_COMPANY = Company(
    'Eaton',
    'https://eaton.eightfold.ai/careers?domain=eaton.com',
    'eightfold',
    'eaton.eightfold.ai|eaton.com',
    4,
    True
)

def test_eaton_eightfold_feed_success(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        req = httpx.Request(method, url)
        if url == 'https://eaton.eightfold.ai/careers?domain=eaton.com':
            return httpx.Response(200, text='<code id="pcsx-data">{"domain":"eaton.com"}</code>', request=req)
        if '/api/pcsx/search' in url:
            params = kwargs.get('params', {})
            assert params.get('domain') == 'eaton.com'
            assert params.get('sort_by') == 'relevance'
            return httpx.Response(200, json={
                'data': {
                    'count': 2,
                    'positions': [
                        {
                            'id': 687239381356,
                            'name': 'Senior Software Engineer',
                            'locations': ['Pune, Maharashtra, IND'],
                            'standardizedLocations': ['Pune, MH, IN'],
                            'isPrivate': False
                        },
                        {
                            'id': 687239452042,
                            'name': 'Associate Cloud Engineer',
                            'locations': ['Hadapsar, Pune, IND'],
                            'standardizedLocations': ['Pune, MH, IN'],
                            'isPrivate': False
                        }
                    ]
                }
            }, request=req)
        return httpx.Response(404, request=req)

    async def mock_detail(client, url):
        req = httpx.Request('GET', url)
        from urllib.parse import parse_qs, urlsplit
        pos_id = parse_qs(urlsplit(url).query).get('position_id', [''])[0]
        title = 'Associate Cloud Engineer' if pos_id == '687239452042' else 'Senior Software Engineer'
        return httpx.Response(200, json={
            'data': {
                'id': int(pos_id),
                'atsJobId': f'EATON-{pos_id}',
                'name': title,
                'locations': ['Pune, India'],
                'jobDescription': 'Full requirements; 0 to 2 years experience with AWS and Terraform.',
                'postedTs': 1791450000
            }
        }, request=req)

    monkeypatch.setattr(adapters, 'request', mock_request)
    monkeypatch.setattr(adapters, 'fetch_detail', mock_detail)

    adapter = EightfoldCareerAdapter(complete=False)
    jobs, total = asyncio.run(adapter.fetch_jobs(EATON_COMPANY))
    assert total == 2
    assert len(jobs) == 2
    assert any(j.title == 'Associate Cloud Engineer' for j in jobs)

def test_eaton_eightfold_feed_empty(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        req = httpx.Request(method, url)
        if url.endswith('/careers?domain=eaton.com'):
            return httpx.Response(200, text='<code id="pcsx-data">{"domain":"eaton.com"}</code>', request=req)
        return httpx.Response(200, json={'data': {'count': 0, 'positions': []}}, request=req)

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = EightfoldCareerAdapter(complete=False)
    jobs, total = asyncio.run(adapter.fetch_jobs(EATON_COMPANY))
    assert total == 0
    assert len(jobs) == 0

def test_eaton_eightfold_feed_missing_pcsx_data_raises_value_error(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(200, text='<html><body>No config</body></html>', request=httpx.Request(method, url))

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = EightfoldCareerAdapter(complete=False)
    with pytest.raises(ValueError, match='Eightfold public career configuration does not match the employer'):
        asyncio.run(adapter.fetch_jobs(EATON_COMPANY))

def test_eaton_eightfold_feed_error_500(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(500, text='Server Error', request=httpx.Request(method, url))

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = EightfoldCareerAdapter(complete=False)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(adapter.fetch_jobs(EATON_COMPANY))
