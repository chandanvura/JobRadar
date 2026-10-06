import asyncio

import httpx
import pytest

from scraper.phb import PHBCareerAdapter, detail, listing
from scraper.models import Company


def page(ids, first=1, total=2):
    cards = ''.join(f'<div class="card-job" data-id="{i}"><h2><a href="/en/jobs/{i}/software-engineer/">Software Engineer</a></h2><ul class="job-meta"><li>Bengaluru, India</li><li>Engineering</li></ul></div>' for i in ids)
    return f'<p>Displaying {first} to {first + len(ids) - 1} of {total} matching jobs</p><div id="js-job-search-results" data-results="{total}">{cards}</div>'


def full_detail(identifier=1):
    return f'''<h1>Software Engineer</h1><p class="hero-eyebrow">{identifier}</p>
    <ul><li class="job-meta-item">Date published <strong>Oct 06 2026</strong></li>
    <li class="job-meta-location">Location <strong>Bengaluru / India</strong></li></ul>
    <div id="js-job-detail">Full Java requirements, 0 to 2 years experience</div>'''


def test_phb_listing_validates_count_range_identity_and_locations():
    rows, first, last, total, next_link = listing(page([1, 2]), 'https://careers.example/en/jobs/', 'careers.example')
    assert (first, last, total, next_link) == (1, 2, 2, None)
    assert rows['1']['location'] == 'Bengaluru, India'
    for text, error in [(page([1, 1]), 'repeated'),
                        (page([1]).replace('data-results="2"', 'data-results="3"'), 'inconsistent'),
                        (page([1]).replace('of 2', 'of 3001').replace('data-results="2"', 'data-results="3001"'), 'bounded'),
                        (page([1]).replace('href="/en/jobs/1/', 'href="https://wrong.example/en/jobs/1/'), 'employer')]:
        with pytest.raises(ValueError, match=error):
            listing(text, 'https://careers.example/en/jobs/', 'careers.example')


def test_phb_detail_retains_full_requirements_and_original_date():
    description, location, posting = detail(full_detail(), '1', 'Software Engineer')
    assert '0 to 2 years' in description
    assert location == 'Bengaluru / India' and posting == '2026-10-06'
    assert detail(full_detail().replace('Date published', 'Updated'), '1', 'Software Engineer')[2] is None
    with pytest.raises(ValueError, match='listing'):
        detail(full_detail(2), '1', 'Software Engineer')
    with pytest.raises(ValueError, match='full description'):
        detail(full_detail().replace('id="js-job-detail"', 'id="preview"'), '1', 'Software Engineer')


def test_phb_complete_pagination_uses_browser_representation(monkeypatch):
    from scraper import adapters
    calls = []
    async def request(client, method, url, **kwargs):
        assert 'Chrome/' in kwargs['headers']['User-Agent']
        calls.append(url)
        if '/software-engineer/' in url:
            identifier = url.split('/jobs/')[1].split('/')[0]
            text = full_detail(identifier)
        elif 'page=2' in url:
            text = page([2], first=2)
        else:
            text = page([1]) + '<a href="/en/jobs/?page=2">Next</a>'
        return httpx.Response(200, request=httpx.Request(method, url), text=text)
    monkeypatch.setattr(adapters, 'request', request)
    jobs, count = asyncio.run(PHBCareerAdapter().fetch_jobs(Company('Employer', 'https://careers.example/en/jobs/', 'phb', 'careers.example')))
    assert count == 2 and len(jobs) == 2 and len(calls) == 4
    assert all('0 to 2 years' in j.description for j in jobs)


def test_phb_repeated_first_page_cannot_pass_as_complete(monkeypatch):
    from scraper import adapters
    async def request(client, method, url, **kwargs):
        text = page([1]) + '<a href="/en/jobs/?page=2">Next</a>'
        return httpx.Response(200, request=httpx.Request(method, url), text=text)
    monkeypatch.setattr(adapters, 'request', request)
    with pytest.raises(ValueError, match='reported range'):
        asyncio.run(PHBCareerAdapter().fetch_jobs(Company('Employer', 'https://careers.example/en/jobs/', 'phb', 'careers.example')))


def test_phb_regeneron_public_identifier_case_matches_detail():
    rows, _, _, _, _ = listing(page(['r49155'], total=1), 'https://careers.example/en/jobs/', 'careers.example')
    assert 'r49155' in rows
    assert detail(full_detail('R49155'), 'r49155', 'Software Engineer')[2] == '2026-10-06'
    with pytest.raises(ValueError, match='listing'):
        detail(full_detail('R51002'), 'r49155', 'Software Engineer')


def test_phb_restarts_once_after_inconsistent_pagination(monkeypatch):
    from scraper.phb import PHBPaginationError
    calls = []
    async def collect(self, company):
        calls.append(company.name)
        if len(calls) == 1:
            raise PHBPaginationError('changed range')
        return [], 0
    monkeypatch.setattr(PHBCareerAdapter, '_fetch_jobs', collect)
    assert asyncio.run(PHBCareerAdapter().fetch_jobs(Company('Employer', 'https://careers.example/en/jobs/', 'phb', 'careers.example'))) == ([], 0)
    assert calls == ['Employer', 'Employer']
