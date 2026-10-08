import asyncio
import copy
import httpx
import pytest
from scraper import adapters
from scraper.keka import KekaCareerAdapter, listing_records, verify_detail
from scraper.models import Company
from scraper.snapshot import SnapshotChanged

BOARD = 'https://employer.keka.com/careers/'
TENANT = 'b5279857-cf81-4dde-a215-fc48957ee2b5'
ROW = {'id': 42, 'title': 'DevOps Engineer', 'description': '<p>Real requirements</p>',
       'jobLocations': [{'name': 'Office A', 'city': 'Bengaluru', 'countryName': 'India'}],
       'publishedOn': '2026-09-11T06:25:22.443Z'}
DETAIL = '<h1>DevOps Engineer</h1><div selectedJobId="42"></div><div class="job-description-container"><p>Real requirements</p></div>'


def install_transport(monkeypatch, rows, *, published=True, detail=DETAIL, final=None):
    listing_calls = 0
    def handle(req):
        nonlocal listing_calls
        if req.url.host == 'employer.example':
            text = f'<a href="{BOARD}">All openings</a>' if published else '<p>Careers</p>'
            return httpx.Response(200, text=text)
        if req.url.path.rstrip('/') == '/careers':
            return httpx.Response(200, text="<script>fetch('/ats/documents/tenant/careerportal/live.html')</script>")
        if '/careerportal/' in req.url.path:
            return httpx.Response(200, text=f"<script>khConfig={{identifier: '{TENANT}',domain: '{BOARD}'}}</script><script src='{BOARD}api/embedjobs/js/{TENANT}'></script>")
        if '/embedjobs/js/' in req.url.path:
            return httpx.Response(200, text='api/embedjobs/${portalName}/active/ khConfig.portalName ?? "default" bindJobs(jobList) '+"'jobdetails/' + job.id")
        if '/active/' in req.url.path:
            listing_calls += 1
            return httpx.Response(200, json=final if final is not None and listing_calls > 1 else rows)
        if '/jobdetails/' in req.url.path:
            return httpx.Response(200, text=detail)
        raise AssertionError(f'Unexpected request {req.url}')
    monkeypatch.setattr(adapters, 'client', lambda **kw: httpx.AsyncClient(transport=httpx.MockTransport(handle)))


COMPANY = Company('Employer', 'https://employer.example/careers', 'keka', BOARD+'|'+TENANT)


def test_complete_feed_preserves_actual_location_and_date(monkeypatch):
    install_transport(monkeypatch, [ROW])
    jobs, total = asyncio.run(KekaCareerAdapter().fetch_jobs(COMPANY))
    assert total == len(jobs) == 1
    assert jobs[0].external_job_id == '42'
    assert jobs[0].location == 'Office A · Bengaluru · India'
    assert jobs[0].posted_at == '2026-09-11T06:25:22.443000+00:00'


def test_missing_date_and_location_remain_unknown(monkeypatch):
    row = {**ROW, 'jobLocations': [], 'publishedOn': None}
    install_transport(monkeypatch, [row])
    jobs, _ = asyncio.run(KekaCareerAdapter().fetch_jobs(COMPANY))
    assert jobs[0].location == ''
    assert jobs[0].posted_at is None


def test_verified_stable_empty_array_is_valid(monkeypatch):
    install_transport(monkeypatch, [])
    assert asyncio.run(KekaCareerAdapter().fetch_jobs(COMPANY)) == ([], 0)


def test_unowned_board_never_collects(monkeypatch):
    install_transport(monkeypatch, [ROW], published=False)
    with pytest.raises(ValueError, match='Employer no longer publishes'):
        asyncio.run(KekaCareerAdapter().fetch_jobs(COMPANY))


def test_changed_snapshot_fails_instead_of_returning_partial_jobs(monkeypatch):
    install_transport(monkeypatch, [ROW], final=[])
    with pytest.raises(SnapshotChanged):
        asyncio.run(KekaCareerAdapter().fetch_jobs(COMPANY))


@pytest.mark.parametrize('payload', [{}, [ROW, ROW], [{**ROW, 'id': True}], [{**ROW, 'description': ''}]])
def test_malformed_or_duplicate_inventory_is_not_empty_success(payload):
    with pytest.raises(ValueError):
        listing_records(payload)


@pytest.mark.parametrize('detail', [DETAIL.replace('42', '43'), DETAIL.replace('Real requirements', 'Summary only'), '<p>Temporarily unavailable</p>'])
def test_wrong_or_partial_details_are_rejected(detail):
    with pytest.raises(ValueError):
        verify_detail(detail, copy.deepcopy(ROW))
