import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company
from scraper.normalization import enrich


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


def test_lever_missing_relevant_requirements_remain_partial(monkeypatch):
    async def request(client, method, url, **kwargs):
        return httpx.Response(200, request=httpx.Request(method, url), json=[dict(id='one', text='Software Engineer')])
    monkeypatch.setattr(adapters, 'request', request)
    jobs, count = asyncio.run(adapters.LeverAdapter().fetch_jobs(
        Company('Example', 'https://jobs.lever.co/example', 'lever', 'example')))
    assert count == 1 and jobs.coverage_warning.startswith('Limited coverage: 1 relevant Lever')


@pytest.mark.parametrize('country,workplace,expected', [('India','remote',True),('United States','remote',False),('India','hybrid',False),('India',None,False),('', 'remote',False)])
def test_employer_remote_flag_requires_an_explicit_india_location(monkeypatch,country,workplace,expected):
    row=dict(id='one',text='Java Engineer',categories={'location':country,'allLocations':[country]},
             workplaceType=workplace,descriptionPlain='Required experience: 1-2 years.',
             hostedUrl='https://jobs.lever.co/example/one',createdAt=1780000000000)
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,request=httpx.Request(method,url),json=[row])
    monkeypatch.setattr(adapters,'request',request)
    jobs,_=asyncio.run(adapters.LeverAdapter().fetch_jobs(Company('Example','https://jobs.lever.co/example','lever','example')))
    job=enrich(jobs[0])
    assert (job.city=='Remote (India)') is expected
    # A location fix cannot turn an old posting into an eligible job.
    assert not job.is_eligible
