import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.kissflow import BOARD, KissflowCareerAdapter, detail_record, listing_records
from scraper.models import Company
from scraper.snapshot import SnapshotChanged

URL = BOARD + 'solution-advisor'
LIST = '<h2>Open Positions</h2><div class="career-col"><a class="career-in-row" href="'+URL+'"><h6>Solution Advisor</h6><p>Experience: 8 - 12 years</p></a></div>'
DETAIL = '<link rel="canonical" href="'+URL+'"><h1 class="job-title">Solution Advisor</h1><p>Experience: 8 - 12 years</p><p>Work Location: Delhi&amp;Mumbai</p><a>Apply now</a><div class="jd"><p>Real job description.</p><h3>Required Skills</h3><p>Java engineering experience.</p></div>'
MODULE = BOARD + 'module_Career_job_list.min.js'
MODULE_TEXT = '$(".career-viewbody").next(".dnd-career-all").hide()'
C = Company('Kissflow', BOARD, 'kissflow', 'kissflow')


def install(monkeypatch, *, final=LIST, detail=DETAIL, owned=True, module=MODULE_TEXT):
    listing_calls = 0
    def handle(req):
        nonlocal listing_calls
        if req.url.host == 'kissflow.com':
            return httpx.Response(200, text=f'<a href="{BOARD}">Careers</a>' if owned else '<p>Homepage</p>')
        if str(req.url) == MODULE:
            return httpx.Response(200, text=module)
        if str(req.url) == BOARD:
            listing_calls += 1
            return httpx.Response(200, text=(LIST if listing_calls == 1 else final) + f'<script src="{MODULE}"></script>')
        if str(req.url) == URL:
            return httpx.Response(200, text=detail)
        raise AssertionError(str(req.url))
    monkeypatch.setattr(adapters, 'client', lambda **kw: httpx.AsyncClient(transport=httpx.MockTransport(handle)))


def test_all_details_and_real_multilocation_without_invented_dates(monkeypatch):
    install(monkeypatch)
    jobs, count = asyncio.run(KissflowCareerAdapter().fetch_jobs(C))
    assert count == len(jobs) == 1
    assert jobs[0].location == 'Delhi&Mumbai'
    assert jobs[0].posted_at is None
    assert 'Java engineering experience.' in jobs[0].description
    assert '8 - 12 years' in jobs[0].description


@pytest.mark.parametrize('text', [LIST+LIST, LIST.replace('careers.kissflow.com','other.example'), LIST.replace('<h6>Solution Advisor</h6>',''), '<h2>Open Positions</h2>', LIST+'<a rel="next">Next</a>'])
def test_incomplete_or_misattributed_inventory_fails(text):
    with pytest.raises(ValueError):
        listing_records(text)


@pytest.mark.parametrize('text', [DETAIL.replace('Solution Advisor','Other Role'), DETAIL.replace('class="jd"','class="summary"'), DETAIL.replace('Required Skills','Overview'), DETAIL.replace(URL,BOARD+'other'), DETAIL.replace('Work Location:','Office:')])
def test_partial_wrong_detail_or_unknown_location_fails(text):
    with pytest.raises(ValueError):
        detail_record(text, URL, 'Solution Advisor', 'Experience: 8 - 12 years')


def test_moving_inventory_is_never_complete(monkeypatch):
    install(monkeypatch, final=LIST.replace('Solution Advisor','Changed Role'))
    with pytest.raises(SnapshotChanged):
        asyncio.run(KissflowCareerAdapter().fetch_jobs(C))


@pytest.mark.parametrize('options', [{'owned':False}, {'module':MODULE_TEXT+' fetch("/jobs")'}, {'detail':DETAIL.replace('Required Skills','Summary')}])
def test_removed_ownership_or_changed_consumer_is_unresolved(monkeypatch, options):
    install(monkeypatch, **options)
    with pytest.raises(ValueError):
        asyncio.run(KissflowCareerAdapter().fetch_jobs(C))
