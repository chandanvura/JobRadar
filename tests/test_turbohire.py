import asyncio
import httpx
import pytest

from scraper import adapters
from scraper.models import Company
from scraper.normalization import enrich
from scraper.turbohire import (
    TURBOHIRE_API_JOBS_URL,
    TURBOHIRE_GUEST_ENDPOINT,
    TURBOHIRE_API_TOKEN_URL,
    TurboHireCareerAdapter,
    parse_turbohire_jobs,
    parse_turbohire_location,
)

SAMPLE_TURBOHIRE_RESULT = [
    {
        "JobId": "5ec8d163-6e93-465c-a0eb-d0cc0169c288",
        "JobIdObfuscated": "5ec8d163",
        "JobTitle": "Backend Engineer",
        "Department": "Platform Engineering",
        "Location": '[{"Address":"Bengaluru, Karnataka, India","PlaceId":null}]',
        "Experience": {"MinExp": 2, "MaxExp": 5},
        "Skills": ["Python", "Distributed Systems", "SQL"],
        "JobDescV2": "<p>Design high scale distributed backends.</p><p>Requires 2-5 years experience.</p>",
        "PublishedDate": "2026-11-10T10:00:00.000Z",
    },
    {
        "JobId": "0122334f-26a7-4d63-a39f-e24033a692fb",
        "JobTitle": "Data Analyst",
        "Department": "Analytics",
        "Location": "Hyderabad, Telangana, India",
        "Experience": {"MinExp": 1, "MaxExp": 3},
        "Skills": ["SQL", "Tableau"],
        "JobDescV2": "<p>Analyze product metrics.</p>",
        "PublishedDate": "2026-11-12T12:00:00.000Z",
    },
]

COMPANY = Company(
    "Flipkart",
    "https://flipkart.turbohire.co/careerpage/4d757ba0-3d57-448a-b82c-238ed87ac90f",
    "turbohire",
    "4d757ba0-3d57-448a-b82c-238ed87ac90f",
    5,
    True,
)


def test_parse_turbohire_location():
    # JSON array string
    json_loc = '[{"Address":"Bengaluru, Karnataka, India"},{"Address":"Hyderabad, Telangana, India"}]'
    assert parse_turbohire_location(json_loc) == "Bengaluru, Karnataka, India · Hyderabad, Telangana, India"

    # Plain string
    assert parse_turbohire_location("Bengaluru, India") == "Bengaluru, India"

    # List of dicts
    assert parse_turbohire_location([{"Address": "Bangalore, India"}]) == "Bangalore, India"

    # Empty / none
    assert parse_turbohire_location(None) == ""
    assert parse_turbohire_location("") == ""


def test_parse_turbohire_jobs():
    jobs = parse_turbohire_jobs(
        {"Result": SAMPLE_TURBOHIRE_RESULT},
        COMPANY,
        "https://flipkart.turbohire.co",
    )
    assert len(jobs) == 2

    j0 = jobs[0]
    assert j0.external_job_id == "5ec8d163-6e93-465c-a0eb-d0cc0169c288"
    assert j0.title == "Backend Engineer"
    assert j0.location == "Bengaluru, Karnataka, India"
    assert j0.job_url == "https://flipkart.turbohire.co/job/publicjobs/5ec8d163-6e93-465c-a0eb-d0cc0169c288"
    assert j0.application_url == j0.job_url
    assert "Department: Platform Engineering" in j0.description
    assert "Skills: Python, Distributed Systems, SQL" in j0.description
    assert "Experience: 2 to 5 years" in j0.description
    assert j0.posted_at == "2026-11-10T10:00:00+00:00"

    j1 = jobs[1]
    assert j1.external_job_id == "0122334f-26a7-4d63-a39f-e24033a692fb"
    assert j1.title == "Data Analyst"
    assert j1.location == "Hyderabad, Telangana, India"
    assert j1.posted_at == "2026-11-12T12:00:00+00:00"


@pytest.mark.parametrize(
    "bad_payload",
    [
        "invalid",
        {"Result": "not-a-list"},
        {"Result": [{"JobTitle": "Missing ID"}]},
        {"Result": [{"JobId": "missing-title"}]},
    ],
)
def test_parse_turbohire_jobs_schema_validation(bad_payload):
    with pytest.raises(ValueError):
        parse_turbohire_jobs(bad_payload, COMPANY, "https://flipkart.turbohire.co")


def test_turbohire_adapter_fetch_jobs_mock(monkeypatch):
    def handle(request):
        if str(request.url) == TURBOHIRE_API_TOKEN_URL:
            assert request.headers.get("Origin") == "https://flipkart.turbohire.co"
            return httpx.Response(200, json={"access_token": "mock-jwt-token"})
        if TURBOHIRE_API_JOBS_URL in str(request.url):
            assert request.headers.get("Authorization") == "Bearer mock-jwt-token"
            return httpx.Response(200, json={"Result": SAMPLE_TURBOHIRE_RESULT})
        raise AssertionError(f"Unexpected request: {request.url}")

    monkeypatch.setattr(
        adapters,
        "client",
        lambda **kw: httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )

    jobs, count = asyncio.run(TurboHireCareerAdapter().fetch_jobs(COMPANY))
    assert count == 2
    assert len(jobs) == 2


def test_turbohire_enrichment_normalizes_target_cities():
    jobs = parse_turbohire_jobs(
        {"Result": SAMPLE_TURBOHIRE_RESULT},
        COMPANY,
        "https://flipkart.turbohire.co",
    )
    enriched = [enrich(j, COMPANY.priority) for j in jobs]
    assert enriched[0].city == "Bengaluru"
    assert enriched[0].role_category == "Java / Backend"
    assert enriched[1].city == "Hyderabad"
