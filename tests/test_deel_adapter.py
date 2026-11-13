import asyncio
import json
import httpx
import pytest

from scraper.adapters import ADAPTERS
from scraper.deel import (
    OFFICIAL_CAREERS_URL,
    DeelAdapter,
    extract_deel_jobs_json,
    is_india_location,
    parse_deel_job,
)
from scraper.models import Company


SAMPLE_JOBS = [
    {
        "id": 101,
        "attributes": {
            "ashby_id": "ashby-id-1",
            "job_id": "job-id-1",
            "title": "Software Engineer, Backend",
            "department_name": "Engineering",
            "team_name": "Core Platform",
            "location_name": "India",
            "employment_type": "Full-time",
            "is_listed": True,
            "ashby_published_date": "2026-11-11T13:05:21.803Z",
            "external_link": "https://jobs.deel.com/deel/job-details/ashby-id-1/application",
            "compensation_tier_summary": "$80,000 - $110,000 USD",
            "full_job_description": "<p>We are seeking a Backend Engineer skilled in Python and Distributed Systems.</p>",
            "locations_list": [{"location": "India"}],
            "all_locations": ["India"],
            "slug": "/careers/position/?ashby_jid=ashby-id-1",
        },
    },
    {
        "id": 102,
        "attributes": {
            "ashby_id": "ashby-id-2",
            "job_id": "job-id-2",
            "title": "DevOps Engineer | Remote India",
            "department_name": "Infrastructure",
            "location_name": "Remote",
            "employment_type": "Full-time",
            "ashby_published_date": "2026-11-10T09:00:00.000Z",
            "external_link": "https://jobs.deel.com/deel/job-details/ashby-id-2/application",
            "locations_list": [{"location": "Remote - India"}],
            "all_locations": ["Remote India"],
            "slug": "/careers/position/?ashby_jid=ashby-id-2",
        },
    },
    {
        "id": 103,
        "attributes": {
            "ashby_id": "ashby-id-3",
            "job_id": "job-id-3",
            "title": "Frontend Engineer | Bangalore",
            "department_name": "Product",
            "location_name": "Bangalore",
            "employment_type": "Full-time",
            "ashby_published_date": "2026-11-09T15:30:00.000Z",
            "external_link": "https://jobs.deel.com/deel/job-details/ashby-id-3/application",
            "locations_list": [{"location": "Bangalore, India"}],
            "all_locations": ["Bangalore"],
            "slug": "/careers/position/?ashby_jid=ashby-id-3",
        },
    },
    {
        "id": 104,
        "attributes": {
            "ashby_id": "ashby-id-4",
            "job_id": "job-id-4",
            "title": "Product Designer | London",
            "department_name": "Design",
            "location_name": "United Kingdom",
            "employment_type": "Full-time",
            "ashby_published_date": "2026-11-08T10:00:00.000Z",
            "external_link": "https://jobs.deel.com/deel/job-details/ashby-id-4/application",
            "locations_list": [{"location": "United Kingdom"}],
            "all_locations": ["United Kingdom"],
            "slug": "/careers/position/?ashby_jid=ashby-id-4",
        },
    },
]


def make_html_payload(jobs_data: list, escaped: bool = True) -> str:
    raw = json.dumps(jobs_data)
    if escaped:
        escaped_json = raw.replace('"', '\\"')
        return f'<html><body><script>\\"jobs\\":{escaped_json},\\"departments\\":[]</script></body></html>'
    else:
        return f'<html><body><script>"jobs":{raw},"departments":[]</script></body></html>'


def test_deel_adapter_registration():
    assert "deel" in ADAPTERS
    assert isinstance(ADAPTERS["deel"], DeelAdapter)


def test_extract_deel_jobs_json_escaped():
    html = make_html_payload(SAMPLE_JOBS, escaped=True)
    jobs = extract_deel_jobs_json(html)
    assert len(jobs) == 4
    assert jobs[0]["attributes"]["ashby_id"] == "ashby-id-1"


def test_extract_deel_jobs_json_unescaped():
    html = make_html_payload(SAMPLE_JOBS, escaped=False)
    jobs = extract_deel_jobs_json(html)
    assert len(jobs) == 4
    assert jobs[1]["attributes"]["ashby_id"] == "ashby-id-2"


def test_extract_deel_jobs_json_errors():
    with pytest.raises(ValueError, match="response is empty"):
        extract_deel_jobs_json("")

    with pytest.raises(ValueError, match="Could not find embedded jobs JSON"):
        extract_deel_jobs_json("<html><body>No jobs here</body></html>")

    with pytest.raises(ValueError, match="Could not find departments boundary"):
        extract_deel_jobs_json('<html><body>\\"jobs\\":[1, 2, 3')

    with pytest.raises(ValueError, match="Failed to parse Deel embedded jobs JSON"):
        extract_deel_jobs_json('<html><body>\\"jobs\\":[{invalid],\\"departments\\":[]</body></html>')


@pytest.mark.parametrize(
    "locations,expected",
    [
        (["India"], True),
        (["Bangalore"], True),
        (["Bengaluru"], True),
        (["Hyderabad"], True),
        (["Remote India"], True),
        (["Remote - India"], True),
        (["Remote (India)"], True),
        (["London, UK"], False),
        (["Berlin, Germany"], False),
        (["United States", "Canada"], False),
    ],
)
def test_is_india_location(locations, expected):
    assert is_india_location(locations) == expected


def test_parse_deel_job_india_filter():
    # India match
    job = parse_deel_job(SAMPLE_JOBS[0], "Deel", OFFICIAL_CAREERS_URL)
    assert job is not None
    assert job.title == "Software Engineer, Backend"
    assert job.company == "Deel"
    assert job.external_job_id == "ashby-id-1"
    assert job.ats_provider == "deel"
    assert job.job_url == "https://jobs.deel.com/deel/job-details/ashby-id-1/application"
    assert job.posted_at == "2026-11-11T13:05:21.803000+00:00"
    assert "Backend Engineer skilled in Python" in job.description
    assert "India" in job.location

    # UK match should return None
    non_india_job = parse_deel_job(SAMPLE_JOBS[3], "Deel", OFFICIAL_CAREERS_URL)
    assert non_india_job is None


def test_fetch_jobs_mock(monkeypatch):
    html = make_html_payload(SAMPLE_JOBS, escaped=True)

    async def mock_request(x, method, url, **kwargs):
        assert method == "GET"
        return httpx.Response(200, text=html, request=httpx.Request(method, url))

    monkeypatch.setattr("scraper.adapters.request", mock_request)

    company = Company(
        name="Deel",
        careers_url=OFFICIAL_CAREERS_URL,
        ats_provider="deel",
        ats_identifier="deel",
    )
    adapter = DeelAdapter()
    jobs, total_discovered = asyncio.run(adapter.fetch_jobs(company))

    # Total jobs discovered in JSON = 4
    assert total_discovered == 4
    # Only 3 match India / Bangalore / Hyderabad / Remote India
    assert len(jobs) == 3
    titles = [j.title for j in jobs]
    assert "Software Engineer, Backend" in titles
    assert "DevOps Engineer | Remote India" in titles
    assert "Frontend Engineer | Bangalore" in titles
    assert "Product Designer | London" not in titles
