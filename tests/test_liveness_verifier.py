"""Unit tests for the ATS liveness and expiration verifier."""

import pytest
import httpx
from scraper.liveness_verifier import (
    is_content_closed,
    verify_single_url,
    verify_batch_liveness,
    LivenessResult,
)


def test_is_content_closed():
    assert is_content_closed("Thank you for your interest. This job is no longer available.")
    assert is_content_closed("We are sorry, but this position has been filled.")
    assert is_content_closed("404 Not Found - Greenhouse")
    assert is_content_closed("Requisition is closed.")
    assert not is_content_closed("Apply for Software Engineer in Bengaluru. 0-2 years experience required.")


@pytest.mark.asyncio
async def test_verify_single_url_active(monkeypatch):
    class FakeClient:
        async def head(self, url, **kwargs):
            return httpx.Response(200, request=httpx.Request("HEAD", url))
        async def get(self, url, **kwargs):
            return httpx.Response(200, text="Apply now for SDE 1 in Bengaluru", request=httpx.Request("GET", url))

    client = FakeClient()
    result = await verify_single_url(client, "job-1", "https://boards.greenhouse.io/test/jobs/123")
    assert result.is_active is True
    assert result.status_code == 200
    assert result.job_id == "job-1"


@pytest.mark.asyncio
async def test_verify_single_url_404(monkeypatch):
    class FakeClient:
        async def head(self, url, **kwargs):
            return httpx.Response(404, request=httpx.Request("HEAD", url))

    client = FakeClient()
    result = await verify_single_url(client, "job-2", "https://boards.greenhouse.io/test/jobs/expired")
    assert result.is_active is False
    assert result.status_code == 404
    assert "404" in result.reason


@pytest.mark.asyncio
async def test_verify_single_url_soft_closed(monkeypatch):
    class FakeClient:
        async def head(self, url, **kwargs):
            return httpx.Response(200, request=httpx.Request("HEAD", url))
        async def get(self, url, **kwargs):
            return httpx.Response(200, text="Sorry, this job is no longer available.", request=httpx.Request("GET", url))

    client = FakeClient()
    result = await verify_single_url(client, "job-3", "https://jobs.lever.co/test/expired")
    assert result.is_active is False
    assert "Closed keyword detected" in result.reason


@pytest.mark.asyncio
async def test_verify_batch_liveness():
    test_jobs = [
        {"id": "j1", "application_url": "https://example.com/job/1", "ats_provider": "greenhouse"},
        {"id": "j2", "application_url": "", "ats_provider": "lever"},
    ]
    # j2 has empty URL
    results = await verify_batch_liveness(test_jobs, max_concurrency=2)
    assert len(results) == 2
    assert results[1].job_id == "j2"
    assert results[1].is_active is False
