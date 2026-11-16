import asyncio
import httpx
import pytest

from scraper.adapters import ADAPTERS
from scraper.darwinbox import DarwinboxCareerAdapter, parse_darwinbox_jobs
from scraper.models import Company
from scraper.normalization import enrich

SAMPLE_DARWINBOX_DATA = [
    {
        "_id": "6a73450956b2c4235d01cbe3",
        "id": "a6a73450948a95",
        "title": "Software Development Engineer - Backend",
        "designation_display_name": "Software Development Engineer - Backend",
        "department_name": "Engineering",
        "experience": "1 - 3 Years",
        "officelocation_show_arr": "Bengaluru, Karnataka, India (IND_BLR)",
        "jd": "<p>We are hiring an SDE Backend in Bangalore to build microservices.</p>",
        "posted_on": 1794508200,
    },
    {
        "_id": "6a73450956b2c4235d01cbe4",
        "id": "a6a73450948a96",
        "title": "QA Automation Engineer",
        "designation_display_name": "QA Automation Engineer",
        "department_name": "Quality Assurance",
        "experience": "0 - 2 Years",
        "locations": "Hyderabad, Telangana, India",
        "jd": "<p>Looking for a QA Automation Engineer in Hyderabad.</p>",
        "created_on": "2026-11-01T10:00:00.000Z",
    },
]

COMPANY = Company(
    "Moneyview",
    "https://moneyview.darwinbox.in/ms/candidate/careers",
    "darwinbox",
    "moneyview",
    4,
    True,
)


def test_parse_darwinbox_jobs():
    jobs = parse_darwinbox_jobs(
        {"status": "success", "data": SAMPLE_DARWINBOX_DATA, "job_counts": 2},
        COMPANY,
        "moneyview",
    )
    assert len(jobs) == 2

    j0 = jobs[0]
    assert j0.external_job_id == "a6a73450948a95"
    assert j0.title == "Software Development Engineer - Backend"
    assert j0.company == "Moneyview"
    assert "Bengaluru" in j0.location
    assert "Department: Engineering" in j0.description
    assert "Experience: 1 - 3 Years" in j0.description
    assert "We are hiring an SDE Backend" in j0.description
    assert j0.job_url == "https://moneyview.darwinbox.in/ms/candidatev2/main/careers/jobDetails/a6a73450948a95"
    assert j0.application_url == j0.job_url
    assert j0.posted_at is not None

    j1 = jobs[1]
    assert j1.external_job_id == "a6a73450948a96"
    assert j1.title == "QA Automation Engineer"
    assert "Hyderabad" in j1.location
    assert j1.posted_at.startswith("2026-11-01T10:00:00")


def test_parse_darwinbox_jobs_deduplication():
    duplicate_data = SAMPLE_DARWINBOX_DATA + [SAMPLE_DARWINBOX_DATA[0]]
    jobs = parse_darwinbox_jobs(duplicate_data, COMPANY, "moneyview")
    assert len(jobs) == 2


@pytest.mark.parametrize(
    "bad_payload",
    [
        "not-a-dict-or-list",
        123,
        {"data": "not-a-list"},
        {"data": [1, 2, 3] * 400},
    ],
)
def test_parse_darwinbox_jobs_schema_validation(bad_payload):
    with pytest.raises(ValueError):
        parse_darwinbox_jobs(bad_payload, COMPANY, "moneyview")


def test_parse_darwinbox_jobs_empty():
    assert parse_darwinbox_jobs({"status": "success", "data": []}, COMPANY, "moneyview") == []
    assert parse_darwinbox_jobs({"status": "error"}, COMPANY, "moneyview") == []


def test_darwinbox_adapter_registered():
    assert "darwinbox" in ADAPTERS
    assert isinstance(ADAPTERS["darwinbox"], DarwinboxCareerAdapter)


def test_darwinbox_adapter_fetch_mock(monkeypatch):
    def handle(request):
        assert "alljobs" in str(request.url)
        return httpx.Response(
            200,
            json={"status": "success", "data": SAMPLE_DARWINBOX_DATA, "job_counts": 2},
        )

    mock_transport = httpx.MockTransport(handle)

    def mock_client(*args, **kwargs):
        return httpx.AsyncClient(transport=mock_transport)

    from scraper import adapters
    monkeypatch.setattr(adapters, "client", mock_client)

    adapter = DarwinboxCareerAdapter()
    jobs, count = asyncio.run(adapter.fetch_jobs(COMPANY))
    assert count == 2
    assert len(jobs) == 2
    assert jobs[0].external_job_id == "a6a73450948a95"


def test_darwinbox_enrichment_normalizes_target_cities():
    jobs = parse_darwinbox_jobs(SAMPLE_DARWINBOX_DATA, COMPANY, "moneyview")
    enriched = [enrich(j, COMPANY.priority) for j in jobs]
    assert enriched[0].city == "Bengaluru"
    assert enriched[1].city == "Hyderabad"


def test_parse_darwinbox_jobs_millisecond_timestamp():
    # 13-digit millisecond timestamp (common in JS)
    payload = [{"id": "ms_job", "title": "Dev", "posted_on": 1731763200000}]
    jobs = parse_darwinbox_jobs(payload, COMPANY, "moneyview")
    assert len(jobs) == 1
    assert jobs[0].posted_at is not None
    assert jobs[0].posted_at.startswith("2024-")

    # Out of bounds / invalid timestamp that triggers OSError/OverflowError
    payload_err = [{"id": "bad_job", "title": "Dev", "posted_on": 10**16}]
    jobs_err = parse_darwinbox_jobs(payload_err, COMPANY, "moneyview")
    assert len(jobs_err) == 1
    assert jobs_err[0].posted_at is None


def test_parse_darwinbox_jobs_whitespace_title_fallback():
    payload = [
        {
            "id": "whitespace_title",
            "title": "   ",
            "designation_title_name": "UI Designer",
        }
    ]
    jobs = parse_darwinbox_jobs(payload, COMPANY, "moneyview")
    assert len(jobs) == 1
    assert jobs[0].title == "UI Designer"


def test_parse_darwinbox_jobs_non_string_fields():
    payload = [
        {
            "id": 99999,
            "title": 12345,
            "jd": 67890,
            "department_name": 111,
            "experience": 222,
        }
    ]
    jobs = parse_darwinbox_jobs(payload, COMPANY, "moneyview")
    assert len(jobs) == 1
    assert jobs[0].external_job_id == "99999"
    assert jobs[0].title == "12345"
    assert "67890" in jobs[0].description


def test_darwinbox_adapter_fetch_null_or_string_job_counts(monkeypatch):
    from unittest.mock import patch

    # When job_counts is None
    payload_null = {"status": "success", "data": SAMPLE_DARWINBOX_DATA, "job_counts": None}
    adapter = DarwinboxCareerAdapter()
    with patch("scraper.darwinbox._fetch_darwinbox_urllib", return_value=payload_null):
        # Force fallback to urllib by making httpx client raise
        with patch("scraper.adapters.client", side_effect=Exception("WAF 403")):
            jobs, count = asyncio.run(adapter.fetch_jobs(COMPANY))
            assert count == 2
            assert len(jobs) == 2

    # When job_counts is a string
    payload_str = {"status": "success", "data": SAMPLE_DARWINBOX_DATA, "job_counts": "2"}
    with patch("scraper.darwinbox._fetch_darwinbox_urllib", return_value=payload_str):
        with patch("scraper.adapters.client", side_effect=Exception("WAF 403")):
            jobs, count = asyncio.run(adapter.fetch_jobs(COMPANY))
            assert count == 2
            assert len(jobs) == 2


def test_fetch_darwinbox_urllib_headers_and_retry(monkeypatch):
    import io
    from scraper.darwinbox import _fetch_darwinbox_urllib
    import urllib.request
    import urllib.error

    captured_requests = []
    attempt_counter = [0]

    def mock_urlopen(req, timeout=20):
        captured_requests.append(req)
        attempt_counter[0] += 1
        if attempt_counter[0] < 2:
            # Simulate transient 403 on first attempt
            raise urllib.error.HTTPError(req.full_url, 403, "Forbidden", {}, None)
        # Return valid JSON response on second attempt
        return io.BytesIO(b'{"status": "success", "data": [], "job_counts": 0}')

    monkeypatch.setattr(urllib.request, "urlopen", mock_urlopen)
    monkeypatch.setattr("time.sleep", lambda s: None)

    res = _fetch_darwinbox_urllib("https://test.darwinbox.in/ms/candidateapi/job/alljobs", b"{}", "test")
    assert res == {"status": "success", "data": [], "job_counts": 0}
    assert attempt_counter[0] == 2
    assert len(captured_requests) == 2

    # Verify standard browser headers are present
    headers = captured_requests[0].headers
    assert headers["Origin"] == "https://test.darwinbox.in"
    assert headers["Referer"] == "https://test.darwinbox.in/ms/candidate/careers"
    assert headers["Sec-fetch-mode"] == "cors"
    assert headers["Sec-fetch-dest"] == "empty"
    assert headers["Sec-fetch-site"] == "same-origin"

