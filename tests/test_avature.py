import pytest
from bs4 import BeautifulSoup
from scraper.avature import listing_page, detail_section


def page(ids, total=2):
    articles = ''.join(f'<article class="article--result"><h3><a href="/en_US/careers/JobDetail/Role/{i}">Software Engineer</a></h3><div class="article__header__text__subtitle">Bengaluru, India Posted 06-Oct-2026</div></article>' for i in ids)
    return f'<div>1-{len(ids)} of {total} jobs</div>{articles}'


def test_avature_validates_page_range_and_published_date():
    rows, start, end, total, more = listing_page(page([1, 2]), 'https://careers.example/jobs', 'careers.example')
    assert (start, end, total, more) == (1, 2, 2, None)
    assert rows['1']['posting'] == '2026-10-06'
    assert rows['2']['url'] == 'https://careers.example/en_US/careers/JobDetail/Role/2'


def test_avature_rejects_wrong_host_duplicates_and_capped_counts():
    with pytest.raises(ValueError, match='employer host'):
        listing_page(page([1]).replace('/en_US/careers/JobDetail/Role/1', 'https://wrong.example/JobDetail/1'), 'https://careers.example/', 'careers.example')
    with pytest.raises(ValueError, match='repeated'):
        listing_page(page([1, 1]), 'https://careers.example/', 'careers.example')
    with pytest.raises(ValueError, match='bounded'):
        listing_page(page([1]).replace('of 2 jobs', 'of 999+ jobs'), 'https://careers.example/', 'careers.example')


def test_avature_requires_full_description_section():
    soup = BeautifulSoup('<article class="article--details"><div class="article__header">General Information</div><div class="article__content">Preview</div></article><article class="article--details"><div class="article__header">Description &amp; Requirements</div><div class="article__content">Complete Java requirements</div></article>', 'html.parser')
    assert detail_section(soup) == 'Complete Java requirements'
    assert detail_section(BeautifulSoup('<p>Preview only</p>', 'html.parser')) == ''


def test_avature_query_identifier_and_explicit_office_and_posted_labels():
    html = '''<div>1-1 of 1 results</div><article class="article--result">
    <h3><a href="/en_US/careers/JobDetail?jobId=123">Software Engineer</a></h3>
    <div class="article__details__data"><img alt="Office Location:"><p>Bengaluru Office</p></div>
    <div class="article__details__data"><img alt="Posted Date:"><p>06 Oct 2026</p></div>
    <div class="article__details__data"><img alt="Job Category:"><p>London Finance</p></div></article>'''
    rows, start, end, count, more = listing_page(html, 'https://careers.example/jobs', 'careers.example')
    assert rows['123']['location'] == 'Bengaluru Office'
    assert rows['123']['posting'] == '2026-10-06'
    assert (start, end, count, more) == (1, 1, 1, None)


def test_avature_split_panels_require_responsibilities_and_requirements():
    html = '''<article class="article--details"><div class="article__content">Full introduction</div></article>
    <article class="article--details"><h3 class="article__header__text__title">What role will you play?</h3>
    <div class="article__content">Build Java services</div></article>
    <article class="article--details"><h3 class="article__header__text__title">What you offer</h3>
    <div class="article__content">Two years experience required</div></article>'''
    description = detail_section(BeautifulSoup(html, 'html.parser'))
    assert all(text in description for text in ['Full introduction', 'Java services', 'Two years'])
    assert detail_section(BeautifulSoup(html.replace('What you offer', 'Preview'), 'html.parser')) == ''


def test_avature_collects_all_advertised_offsets_and_full_details(monkeypatch):
    import asyncio
    import httpx
    from scraper import adapters
    from scraper.avature import AvatureCareerAdapter
    from scraper.models import Company
    calls = []
    async def request(client, method, url, **kwargs):
        calls.append(url)
        if 'jobOffset=1' in url:
            text = page([2]).replace('1-1 of 2 jobs', '2-2 of 2 jobs')
        else:
            text = page([1]) + '<a class="paginationNextLink" href="/jobs?jobRecordsPerPage=1&amp;jobOffset=1">Next</a>'
        return httpx.Response(200, request=httpx.Request('GET', url), text=text)
    async def detail(client, url):
        text = '<article class="article--details"><div class="article__header">Description and Requirements</div><div class="article__content">Java, AWS; zero to two years experience</div></article>'
        return httpx.Response(200, request=httpx.Request('GET', url), text=text)
    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    jobs, count = asyncio.run(AvatureCareerAdapter().fetch_jobs(Company('Employer', 'https://careers.example/jobs', 'avature', 'careers.example')))
    assert count == 2 and len(jobs) == 2
    assert len(calls) == 2 and 'jobOffset=1' in calls[1]
    assert all('zero to two years' in j.description for j in jobs)
