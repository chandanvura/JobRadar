import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.adidas import AdidasCareerAdapter
from scraper.adidas_search import SEARCH, official, records
from scraper.models import Company
from scraper.snapshot import SnapshotChanged

SOURCE = Company('Adidas', SEARCH, 'adidas', SEARCH)


def page(start=1, end=1, total=1, identifier='123', next_page=False):
    return (f'<span class="paginationLabel">Results <b>{start} – {end}</b> of <b>{total}</b></span>'
            f'<tr class="data-row"><td><a class="jobTitle-link" href="/job/Role/{identifier}/">Software Engineer</a></td>'
            '<td><span class="jobLocation">Bengaluru, KA, IN</span></td></tr>'
            + (f'<ul class="pagination"><a href="?locationsearch=India&amp;startrow={end}">Next</a></ul>' if next_page else ''))


def detail(identifier='550170'):
    return ('<span itemprop="title">Software Engineer</span>'
            '<div class="jobdescription">Build Java APIs. Required experience: 0–2 years.</div>'
            + ''.join(f'<span data-careersite-propertyid="{k}">{v}</span>' for k, v in
                      {'adcode': identifier, 'city': 'Bengaluru', 'country': 'IN', 'state': 'KA', 'date': 'Oct 22, 2026'}.items()))


class Client:
    async def __aenter__(self): return self
    async def __aexit__(self, *args): pass


def run(monkeypatch, failure=None):
    calls = []
    async def request(client, method, url, **kwargs):
        calls.append(url)
        if '/job/' in url:
            content = detail('550170' if '/123/' in url else '550171')
            if failure == 'description': content = content.replace('jobdescription', 'missing')
            if failure == 'country': content = content.replace('>IN<', '>US<')
            if failure == 'requisition': content = detail('550170')
        elif 'startrow=' in url:
            content = page(2, 2, 2, '124')
            if failure == 'overlap': content = page(2, 2, 2, '123')
            if failure == 'count': content = page(2, 2, 3, '124')
        else:
            content = page(1, 1, 2, next_page=True)
            if failure == 'final' and calls.count(SEARCH) > 1:
                content = page(1, 1, 2, '125', next_page=True)
        return httpx.Response(200, text=content, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, 'client', lambda **kwargs: Client())
    monkeypatch.setattr(adapters, 'request', request)
    return asyncio.run(AdidasCareerAdapter().fetch_jobs(SOURCE)), calls


def test_published_search_recovers_with_complete_details_and_original_requisition_ids(monkeypatch):
    (jobs, count), calls = run(monkeypatch)
    assert count == len(jobs) == 2
    assert [j.external_job_id for j in jobs] == ['550170', '550171']
    assert jobs[0].posted_at == '2026-10-22T00:00:00+00:00'
    assert jobs[0].posted_precision == 'day'
    assert 'Required experience' in jobs[0].description
    assert calls[-1] == SEARCH  # snapshot validation follows all full details


@pytest.mark.parametrize('failure', ['description', 'country', 'requisition', 'overlap', 'count', 'final'])
def test_incomplete_or_changed_search_never_returns_a_successful_batch(monkeypatch, failure):
    with pytest.raises((ValueError, SnapshotChanged)):
        run(monkeypatch, failure)


@pytest.mark.parametrize('url,search', [
    ('https://unrelated.test/job/Role/123/', False),
    ('https://jobs.adidas-group.com@unrelated.test/job/Role/123/', False),
    ('https://jobs.adidas-group.com/search/?locationsearch=US', True),
    ('https://jobs.adidas-group.com/search/?startrow=50', True),
])
def test_urls_cannot_escape_employer_or_drop_india_filter(url, search):
    with pytest.raises(ValueError): official(url, search)


def test_maintenance_page_and_missing_pagination_are_not_empty_success():
    with pytest.raises(ValueError): records('<h1>We will be back online soon</h1>', SEARCH, 0)
    with pytest.raises(ValueError): records(page(1, 1, 2), SEARCH, 0)
