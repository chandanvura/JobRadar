import asyncio
import httpx
import pytest

from scraper import adapters
from scraper.models import Company
from scraper.normalization import enrich
from scraper.zerodha import (
    ZerodhaCareerAdapter,
    extract_application_url,
    extract_department,
    parse_zerodha_jobs,
)

SAMPLE_ZERODHA_PAYLOAD = {
    "count": 2,
    "data": [
        {
            "job_title": "Legal Manager -Peakst8",
            "name": "legal-manager-peakst8",
            "location": "Bangalore",
            "location_type": "Onsite",
            "description": (
                '<div class="ql-editor read-mode">'
                "<p>Job Title-Legal Manager Peakst8</p>"
                "<p>Location: Bengaluru</p>"
                "<p>Key Responsibilities:</p>"
                "<ol><li>Contract Management: 2-4 years of experience drafting commercial agreements</li></ol>"
                '<p>If interested, fill <a href="https://www.google.com/url?q=https://forms.gle/testForm1&amp;sa=D">Google Form</a></p>'
                "</div>"
            ),
        },
        {
            "job_title": "Backend Software Engineer",
            "name": "backend-software-engineer",
            "location": "Bangalore",
            "location_type": "Onsite",
            "department": "Engineering",
            "description": (
                '<div class="ql-editor read-mode">'
                "<p>Department: Engineering</p>"
                "<p>Build low-latency trading infrastructure using Go and Python.</p>"
                "<p>Requirements: 1-3 years of backend systems experience.</p>"
                "</div>"
            ),
        },
    ],
    "success": True,
}

COMPANY = Company(
    "Zerodha",
    "https://careers.zerodha.com/api/jobs",
    "zerodha",
    "zerodha",
    5,
    True,
)


def test_parse_zerodha_jobs_extracts_all_fields():
    jobs = parse_zerodha_jobs(SAMPLE_ZERODHA_PAYLOAD, COMPANY)
    assert len(jobs) == 2

    # Job 0 checks
    j0 = jobs[0]
    assert j0.external_job_id == "legal-manager-peakst8"
    assert j0.title == "Legal Manager -Peakst8"
    assert j0.location == "Bangalore · Onsite"
    assert j0.job_url == "https://careers.zerodha.com/#legal-manager-peakst8"
    assert j0.application_url == "https://forms.gle/testForm1"
    assert "Department: Legal" in j0.description
    assert j0.ats_provider == "zerodha"
    assert j0.company == "Zerodha"

    # Job 1 checks
    j1 = jobs[1]
    assert j1.external_job_id == "backend-software-engineer"
    assert j1.title == "Backend Software Engineer"
    assert j1.location == "Bangalore · Onsite"
    assert j1.job_url == "https://careers.zerodha.com/#backend-software-engineer"
    assert j1.application_url == "https://careers.zerodha.com/#backend-software-engineer"
    assert "Department: Engineering" in j1.description
    assert "low-latency trading infrastructure" in j1.description


def test_extract_department_strategies():
    # 1. From HTML Department: <name>
    assert extract_department("Lead", "<p>Department: Compliance</p>", "Compliance") == "Compliance"
    # 2. From plain text
    assert extract_department("Analyst", "", "Dept: Finance Operations") == "Finance Operations"
    # 3. From title keyword
    assert extract_department("Senior Legal Counsel", "", "") == "Legal"
    assert extract_department("Security Engineer", "", "") == "Security"
    assert extract_department("Product Designer", "", "") == "Product"
    assert extract_department("Unspecified Worker", "", "") == ""


def test_extract_application_url():
    # Google redirect unwrap
    redirect = 'href="https://www.google.com/url?q=https://forms.gle/xyz123&amp;source=docs"'
    assert extract_application_url(redirect, "fallback") == "https://forms.gle/xyz123"

    # Direct form link
    direct = 'href="https://docs.google.com/forms/d/e/1FAIpQLSc/viewform"'
    assert extract_application_url(direct, "fallback") == "https://docs.google.com/forms/d/e/1FAIpQLSc/viewform"

    # Fallback when no links
    assert extract_application_url("<p>No links</p>", "fallback") == "fallback"


@pytest.mark.parametrize(
    "bad_payload",
    [
        "not a dict",
        {"count": 0},
        {"data": "not a list"},
        {"data": [{"job_title": "Missing ID"}]},
        {"data": [{"name": "missing-title"}]},
        {"data": [{"name": "dup", "job_title": "Role 1"}, {"name": "dup", "job_title": "Role 2"}]},
    ],
)
def test_parse_zerodha_jobs_schema_validation_errors(bad_payload):
    with pytest.raises(ValueError):
        parse_zerodha_jobs(bad_payload, COMPANY)


def test_zerodha_adapter_fetch_jobs_mock(monkeypatch):
    def handle(request):
        if str(request.url) == "https://careers.zerodha.com/api/jobs":
            return httpx.Response(200, json=SAMPLE_ZERODHA_PAYLOAD)
        raise AssertionError(f"Unexpected request: {request.url}")

    monkeypatch.setattr(
        adapters,
        "client",
        lambda **kw: httpx.AsyncClient(transport=httpx.MockTransport(handle)),
    )

    jobs, count = asyncio.run(ZerodhaCareerAdapter().fetch_jobs(COMPANY))
    assert count == 2
    assert len(jobs) == 2


def test_zerodha_enrichment_normalizes_city_and_experience():
    jobs = parse_zerodha_jobs(SAMPLE_ZERODHA_PAYLOAD, COMPANY)
    enriched = [enrich(j, COMPANY.priority) for j in jobs]

    # Both Bangalore postings should normalize to target city Bengaluru
    assert all(j.city == "Bengaluru" for j in enriched)
    assert all(j.normalized_location == "Bengaluru" for j in enriched)

    # Experience extraction
    assert enriched[0].experience_min == 2.0
    assert enriched[0].experience_max == 4.0

    # Backend engineer technical role classification
    assert enriched[1].role_category == "Java / Backend"
    assert enriched[1].experience_min == 1.0
    assert enriched[1].experience_max == 3.0
