import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company


@pytest.mark.parametrize('duplicate', [False, True])
def test_lever_retains_requirement_lists_and_additional_sections(monkeypatch, duplicate):
    row = dict(id='one', text='Software Engineer', descriptionPlain='Build services',
               categories={'location': 'London', 'allLocations': ['Bengaluru, India']},
               lists=[{'text': 'Requirements', 'content': '<ul><li>Java; 0 to 2 years experience</li></ul>'}],
               additionalPlain='AWS and Kubernetes', hostedUrl='https://jobs.lever.co/example/one')
    async def request(client, method, url, **kwargs):
        return httpx.Response(200, request=httpx.Request(method, url), json=[row, row] if duplicate else [row])
    monkeypatch.setattr(adapters, 'request', request)
    company = Company('Example', 'https://jobs.lever.co/example', 'lever', 'example')
    if duplicate:
        with pytest.raises(ValueError, match='identifiers'):
            asyncio.run(adapters.LeverAdapter().fetch_jobs(company))
    else:
        jobs, count = asyncio.run(adapters.LeverAdapter().fetch_jobs(company))
        assert count == 1
        assert '0 to 2 years' in jobs[0].description and 'Kubernetes' in jobs[0].description
        assert 'Bengaluru, India' in jobs[0].location and jobs[0].posted_at is None
