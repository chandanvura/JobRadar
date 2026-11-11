import asyncio
import json
import httpx
from scraper import adapters
from scraper.google_careers import GoogleCareersAdapter, extract_results_payload, parse_google_job
from scraper.models import Company


def _make_row(job_id, title, city="Bengaluru, Karnataka, India", ts=1794299998):
    return [
        job_id,
        title,
        f"https://www.google.com/about/careers/applications/signin?jobId={job_id}",
        [None, "<ul><li>Build distributed systems.</li></ul>"],
        [None, "<h3>Minimum qualifications:</h3><ul><li>0-2 years experience with Python or Go.</li></ul>"],
        "projects/gweb-careers-proto/tenants/1/companies/1",
        None,
        "Google",
        "en-US",
        [[city, ["Bengaluru"]]],
        [None, "<p>Join Google Core engineering.</p>"],
        [2, 3],
        [ts, 0],
    ]


def _make_html(rows, total, page_size=2):
    payload = [rows, None, str(total), str(page_size)]
    return (
        "<html><script nonce='abc'>AF_initDataCallback({key: 'ds:1', hash: '2', data:"
        + json.dumps(payload)
        + ", sideChannel: {}});</script></html>"
    )


def test_extract_payload_and_parse_google_job():
    html_text = _make_html([_make_row("1001", "Software Engineer I")], total=1, page_size=20)
    rows, total, page_size = extract_results_payload(html_text)
    assert total == 1 and page_size == 20 and len(rows) == 1
    job = parse_google_job(rows[0], "Google", "https://www.google.com/about/careers/applications/jobs/results/")
    assert job is not None
    assert job.external_job_id == "1001"
    assert job.ats_provider == "google_careers"
    assert "Bengaluru, Karnataka, India" in job.location
    assert "0-2 years experience with Python or Go." in job.description
    assert job.posted_at is not None


def test_google_careers_adapter_paginates_cleanly(monkeypatch):
    pages_requested = []

    async def mock_request(client, method, url, **kwargs):
        pn = (kwargs.get("params") or {}).get("page")
        pages_requested.append(pn)
        rows = [_make_row("101", "Software Engineer")] if pn == "1" else [_make_row("102", "Cloud Engineer", "Hyderabad, Telangana, India")]
        return httpx.Response(200, text=_make_html(rows, total=2, page_size=1), request=httpx.Request(method, url))

    monkeypatch.setattr(adapters, "request", mock_request)
    company = Company("Google", "https://www.google.com/about/careers/applications/jobs/results/", "google_careers", "India")
    jobs, count = asyncio.run(GoogleCareersAdapter().fetch_jobs(company))
    assert count == 2 and len(jobs) == 2
    assert pages_requested == ["1", "2"]
