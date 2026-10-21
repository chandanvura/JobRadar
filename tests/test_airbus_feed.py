import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company
from scraper.snapshot import SnapshotChanged

AIRBUS_COMPANY = Company(
    'Airbus',
    'https://ag.wd3.myworkdayjobs.com/Airbus?locationCountry=c4f78be1a8f14da0ab49ce1162348a5e',
    'workday_complete',
    'ag|Airbus|India',
    4,
    True
)

AIRBUS_FACETS = [
    {'facetParameter': 'startDate', 'values': [{'descriptor': '1 Day', 'id': 'sd1'}]},
    {
        'facetParameter': 'locationMainGroup',
        'values': [
            {
                'facetParameter': 'locationCountry',
                'values': [
                    {'descriptor': 'France', 'id': 'fr1'},
                    {'descriptor': 'Germany', 'id': 'de1'},
                    {'descriptor': 'India', 'id': 'c4f78be1a8f14da0ab49ce1162348a5e'}
                ]
            },
            {
                'facetParameter': 'locations',
                'values': [
                    {'descriptor': 'Bangalore Area', 'id': 'loc_bgl'}
                ]
            }
        ]
    }
]

def test_workday_country_facets_extracts_nested_airbus_country_facet():
    facets = adapters.workday_country_facets(AIRBUS_FACETS, 'India')
    assert facets == {'locationCountry': ['c4f78be1a8f14da0ab49ce1162348a5e']}

def test_workday_country_facets_missing_country_raises_error():
    facets = adapters.workday_country_facets(AIRBUS_FACETS, 'Japan')
    assert facets == {}

def test_airbus_complete_feed_success(monkeypatch):
    requests = []
    async def mock_request(client, method, url, **kwargs):
        requests.append((method, url, kwargs.get('json')))
        body = kwargs.get('json', {})
        offset = body.get('offset', 0)
        applied = body.get('appliedFacets', {})
        if not applied:
            return httpx.Response(200, request=httpx.Request(method, url), json={'total': 2000, 'facets': AIRBUS_FACETS, 'jobPostings': []})
        # Filtered query
        assert applied == {'locationCountry': ['c4f78be1a8f14da0ab49ce1162348a5e']}
        jobs = [
            {'externalPath': f'/job/Bangalore-Area/Software-Engineer_JR1000{i}', 'title': f'Software Engineer {i}', 'locationsText': 'Bangalore Area'}
            for i in range(offset, min(offset + 20, 2))
        ]
        return httpx.Response(200, request=httpx.Request(method, url), json={'total': 2 if offset == 0 else 0, 'jobPostings': jobs})

    async def mock_detail(client, url):
        return httpx.Response(200, request=httpx.Request('GET', url), json={
            'jobPostingInfo': {
                'jobReqId': url.rsplit('_', 1)[-1],
                'title': 'Software Engineer',
                'jobDescription': 'Full software development responsibilities; 0 to 2 years experience with Python.',
                'location': 'Bangalore Area',
                'additionalLocations': [],
                'startDate': '2026-10-15'
            }
        })

    monkeypatch.setattr(adapters, 'request', mock_request)
    monkeypatch.setattr(adapters, 'fetch_detail', mock_detail)

    adapter = adapters.WorkdayAdapter(complete=True)
    jobs, count = asyncio.run(adapter.fetch_jobs(AIRBUS_COMPANY))
    assert count == 2
    assert len(jobs) == 2
    assert all(j.company == 'Airbus' for j in jobs)
    assert all('Bangalore Area' in j.location for j in jobs)

def test_airbus_complete_feed_empty_response(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        body = kwargs.get('json', {})
        applied = body.get('appliedFacets', {})
        if not applied:
            return httpx.Response(200, request=httpx.Request(method, url), json={'total': 2000, 'facets': AIRBUS_FACETS, 'jobPostings': []})
        return httpx.Response(200, request=httpx.Request(method, url), json={'total': 0, 'jobPostings': []})

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = adapters.WorkdayAdapter(complete=True)
    jobs, count = asyncio.run(adapter.fetch_jobs(AIRBUS_COMPANY))
    assert count == 0
    assert len(jobs) == 0

def test_airbus_feed_error_response_500(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(500, request=httpx.Request(method, url), text='Internal Server Error')

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = adapters.WorkdayAdapter(complete=True)
    with pytest.raises(httpx.HTTPStatusError):
        asyncio.run(adapter.fetch_jobs(AIRBUS_COMPANY))

def test_airbus_feed_missing_facets_raises_value_error(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(200, request=httpx.Request(method, url), json={'total': 0, 'facets': [], 'jobPostings': []})

    monkeypatch.setattr(adapters, 'request', mock_request)

    adapter = adapters.WorkdayAdapter(complete=True)
    with pytest.raises(ValueError, match='Workday does not expose the configured country locations'):
        asyncio.run(adapter.fetch_jobs(AIRBUS_COMPANY))
