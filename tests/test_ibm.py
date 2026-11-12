"""Tests for IBM Careers Elasticsearch adapter."""
import asyncio
import json
import httpx
import pytest

from scraper import adapters
from scraper.ibm import (
    IBMCareersAdapter,
    IBM_SEARCH_API,
    build_search_payload,
    extract_job_id_from_url,
    parse_ibm_hit,
)
from scraper.models import Company


SAMPLE_HIT = {
    "_index": "genesis-prod-12345",
    "_id": "hash123456789",
    "_score": 9.5,
    "_source": {
        "id": "hash123456789",
        "title": "Senior Software Engineer - Confluent",
        "url": "https://careers.ibm.com/careers/JobDetail?jobId=131937",
        "field_keyword_19": "Bangalore, IN",
        "field_keyword_05": "India",
        "field_keyword_08": "Software Development",
        "field_keyword_18": "Professional",
        "body": "Required experience: 5+ years with Apache Kafka and distributed systems. Confluent platform knowledge is preferred.",
    },
}


class MockClient:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        pass


def test_build_search_payload_default():
    payload = build_search_payload(country="in", keyword=None, size=50, from_offset=0)
    assert payload["appId"] == "careers"
    assert payload["scopes"] == ["careers2"]
    assert payload["size"] == 50
    assert payload["from"] == 0
    must = payload["query"]["bool"]["must"]
    assert {"term": {"country": "in"}} in must
    assert len(must) == 1


def test_build_search_payload_with_keyword():
    payload = build_search_payload(country="in", keyword="confluent", size=25, from_offset=10)
    must = payload["query"]["bool"]["must"]
    assert {"term": {"country": "in"}} in must
    assert {"wildcard": {"title": "*confluent*"}} in must


def test_extract_job_id_from_url():
    assert extract_job_id_from_url("https://careers.ibm.com/careers/JobDetail?jobId=131937") == "131937"
    assert extract_job_id_from_url("https://careers.ibm.com/careers/JobDetail?foo=bar&jobId=99999&x=1") == "99999"
    assert extract_job_id_from_url("https://careers.ibm.com/careers/JobDetail") is None
    assert extract_job_id_from_url("") is None
    assert extract_job_id_from_url(None) is None


def test_parse_ibm_hit():
    job = parse_ibm_hit(SAMPLE_HIT, company_name="IBM", career_page_url="https://www.ibm.com/careers/search")
    assert job is not None
    assert job.external_job_id == "131937"
    assert job.title == "Senior Software Engineer - Confluent"
    assert job.location == "Bangalore, IN"
    assert job.company == "IBM"
    assert job.ats_provider == "ibm"
    assert "Kafka" in job.description
    assert job.job_url == "https://careers.ibm.com/careers/JobDetail?jobId=131937"


def test_parse_ibm_hit_fallback_id_when_url_has_no_param():
    hit = {
        "_id": "fallback_id_456",
        "_source": {
            "id": "source_id_123",
            "title": "Data Scientist",
            "url": "https://careers.ibm.com/careers/JobDetail",
            "field_keyword_19": "Hyderabad, IN",
            "body": "Description here",
        },
    }
    job = parse_ibm_hit(hit, company_name="IBM")
    assert job is not None
    assert job.external_job_id == "source_id_123"


def test_parse_ibm_hit_invalid():
    assert parse_ibm_hit({}) is None
    assert parse_ibm_hit({"_source": {"title": "No URL"}}) is None
    assert parse_ibm_hit({"_source": {"url": "https://careers.ibm.com"}}) is None


def test_fetch_jobs_with_detail_date_posted(monkeypatch):
    company = Company("IBM", "https://www.ibm.com/careers/search", "ibm", IBM_SEARCH_API)

    api_response = {
        "hits": {
            "total": {"value": 1, "relation": "eq"},
            "hits": [SAMPLE_HIT],
        }
    }

    async def mock_request(client, method, url, **kwargs):
        assert method == "POST"
        assert url == IBM_SEARCH_API
        return httpx.Response(200, json=api_response, request=httpx.Request(method, url))

    detail_html = """
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@type": "JobPosting",
          "title": "Senior Software Engineer - Confluent",
          "datePosted": "2026-11-10T12:00:00Z"
        }
        </script>
      </head>
    </html>
    """

    async def mock_fetch_detail(client, url):
        return httpx.Response(200, text=detail_html, request=httpx.Request("GET", url))

    monkeypatch.setattr(adapters, "client", lambda **kwargs: MockClient())
    monkeypatch.setattr(adapters, "request", mock_request)
    monkeypatch.setattr(adapters, "fetch_detail", mock_fetch_detail)

    adapter = IBMCareersAdapter(page_size=10, max_pages=1)
    batch, count = asyncio.run(adapter.fetch_jobs(company))

    assert count == 1
    assert len(batch) == 1
    job = batch[0]
    assert job.external_job_id == "131937"
    assert job.posted_at == "2026-11-10T12:00:00+00:00"
    assert job.posted_precision == "exact"


def test_fetch_jobs_fallback_current_verification(monkeypatch):
    company = Company("IBM", "https://www.ibm.com/careers/search", "ibm", IBM_SEARCH_API)

    api_response = {
        "hits": {
            "total": {"value": 1, "relation": "eq"},
            "hits": [SAMPLE_HIT],
        }
    }

    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(200, json=api_response, request=httpx.Request(method, url))

    async def mock_fetch_detail(client, url):
        # Detail page returns challenge or 403 / empty
        return httpx.Response(202, text="", request=httpx.Request("GET", url))

    monkeypatch.setattr(adapters, "client", lambda **kwargs: MockClient())
    monkeypatch.setattr(adapters, "request", mock_request)
    monkeypatch.setattr(adapters, "fetch_detail", mock_fetch_detail)

    adapter = IBMCareersAdapter(page_size=10, max_pages=1)
    batch, count = asyncio.run(adapter.fetch_jobs(company))

    assert count == 1
    assert len(batch) == 1
    job = batch[0]
    assert job.posted_at is not None
    assert job.posted_precision == "exact"
    assert job.posted_label == "Current verification"


def test_fetch_jobs_confluent_keyword_filter(monkeypatch):
    company = Company("IBM Confluent", "https://www.ibm.com/careers/search", "ibm", IBM_SEARCH_API)

    captured_payload = {}

    async def mock_request(client, method, url, **kwargs):
        nonlocal captured_payload
        captured_payload = kwargs.get("json", {})
        return httpx.Response(200, json={"hits": {"total": 0, "hits": []}}, request=httpx.Request(method, url))

    monkeypatch.setattr(adapters, "client", lambda **kwargs: MockClient())
    monkeypatch.setattr(adapters, "request", mock_request)

    adapter = IBMCareersAdapter(page_size=10, max_pages=1)
    batch, count = asyncio.run(adapter.fetch_jobs(company))

    assert count == 0
    must = captured_payload["query"]["bool"]["must"]
    assert {"wildcard": {"title": "*confluent*"}} in must
