import json

import pytest

from scraper.paylocity import detail_description, page_data, public_jobs


BOARD = 'a432d829-f701-4cf3-9108-56ef703b2ac5'


def listing(rows):
    return {'Jobs': rows, 'ShowInternal': False, 'LeadJoinUrl': '/Recruiting/PublicLeads/New/' + BOARD}


def test_public_data_is_parsed_without_executing_javascript():
    data = listing([{'JobId': 123, 'IsInternal': False}])
    text = '<script>window.pageData = ' + json.dumps(data) + '; throw new Error("never execute");</script>'
    assert len(public_jobs(page_data(text), BOARD)) == 1
    with pytest.raises(ValueError, match='missing'):
        page_data('<script>window.pageDataOther = {};</script>')


def test_public_list_rejects_wrong_board_duplicates_and_internal_jobs():
    row = {'JobId': 123, 'IsInternal': False}
    with pytest.raises(ValueError, match='employer'):
        public_jobs(listing([row]), 'another-board')
    with pytest.raises(ValueError, match='repeated'):
        public_jobs(listing([row, row]), BOARD)
    with pytest.raises(ValueError, match='internal'):
        public_jobs(listing([dict(row, IsInternal=True)]), BOARD)
    with pytest.raises(ValueError, match='missing'):
        public_jobs(dict(listing([]), Jobs=None), BOARD)


def test_detail_retains_requirements_and_validates_identity():
    text = '''<meta property="og:url" content="https://recruiting.paylocity.com/Recruiting/Jobs/Details/123">
    <script>window.pageData = {"jobTitle":"Software Engineer"};</script>
    <div class="job-listing-header">Description</div><div>Build Java services</div>
    <div class="job-listing-header">Requirements</div><div>Two years experience required</div>'''
    result = detail_description(text, '123', 'Software Engineer')
    assert 'Java services' in result and 'Two years' in result
    with pytest.raises(ValueError, match='listing'):
        detail_description(text, '456', 'Software Engineer')
    with pytest.raises(ValueError, match='title'):
        detail_description(text, '123', 'Different role')


def test_adapter_reads_complete_list_and_fetches_full_target_detail(monkeypatch):
    import asyncio
    import httpx
    from scraper import adapters
    from scraper.models import Company
    from scraper.paylocity import PaylocityCareerAdapter
    rows = [{'JobId': 123, 'JobTitle': 'Software Engineer', 'LocationName': 'Bengaluru, India',
             'IsInternal': False, 'PublishedDate': '2026-10-06T10:00:00Z', 'Description': 'Preview only'},
            {'JobId': 456, 'JobTitle': 'Office Coordinator', 'LocationName': 'London', 'IsInternal': False}]
    async def request(client, method, url, **kwargs):
        return httpx.Response(200, request=httpx.Request(method, url), text='<script>window.pageData = ' + json.dumps(listing(rows)) + ';</script>')
    async def detail(client, url):
        return httpx.Response(200, request=httpx.Request('GET', url), text='''
        <meta property="og:url" content="https://recruiting.paylocity.com/Recruiting/Jobs/Details/123">
        <script>window.pageData = {"jobTitle":"Software Engineer"};</script>
        <div class="job-listing-header">Description</div><div>Full Java description</div>
        <div class="job-listing-header">Requirements</div><div>0 to 2 years experience</div>''')
    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    jobs, count = asyncio.run(PaylocityCareerAdapter().fetch_jobs(Company('Employer',
        'https://recruiting.paylocity.com/recruiting/jobs/all/' + BOARD, 'paylocity', BOARD)))
    assert count == 2 and len(jobs) == 1
    assert '0 to 2 years' in jobs[0].description and 'Preview only' not in jobs[0].description
    assert jobs[0].posted_at.startswith('2026-10-06')
