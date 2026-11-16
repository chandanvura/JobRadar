import asyncio
import httpx
import pytest
from scraper import adapters
from scraper.models import Company

def test_workday_domain_pacing_spaces_consecutive_requests(monkeypatch):
    calls = []
    loop = asyncio.new_event_loop()
    try:
        url = "https://example.wd1.myworkdayjobs.com/wday/cxs/example/Careers/jobs"
        key = (id(loop), "example.wd1.myworkdayjobs.com")
        adapters._DOMAIN_PACING_LOCKS.pop(key, None)
        adapters._DOMAIN_LAST_REQUEST.pop(key, None)
        adapters._DOMAIN_DELAYS[key] = 0.5
        
        slept = []
        async def mock_sleep(delay):
            slept.append(delay)
        monkeypatch.setattr(adapters.asyncio, "sleep", mock_sleep)
        
        async def scenario():
            # First request: no sleep needed
            await adapters.wait_domain_pacing(url)
            # Second immediate request: should sleep
            await adapters.wait_domain_pacing(url)
        
        loop.run_until_complete(scenario())
        assert len(slept) == 1
        assert 0.0 < slept[0] <= 0.5
    finally:
        loop.close()

def test_workday_pacing_adaptive_scale_and_decay():
    loop = asyncio.new_event_loop()
    try:
        url = "https://example.wd1.myworkdayjobs.com/wday/cxs/example/Careers/jobs"
        key = (id(loop), "example.wd1.myworkdayjobs.com")
        adapters._DOMAIN_DELAYS[key] = 0.35
        
        async def run():
            adapters.record_domain_rate_limit(url, delay=2.0)
            assert adapters._DOMAIN_DELAYS[key] >= 2.0
            
            adapters.record_domain_success(url)
            assert adapters._DOMAIN_DELAYS[key] < 2.0
            
        loop.run_until_complete(run())
    finally:
        loop.close()

def test_workday_request_retries_on_429_with_backoff_and_retry_after(monkeypatch):
    calls = []
    delays = []
    url = "https://example.wd1.myworkdayjobs.com/wday/cxs/example/Careers/jobs"
    
    class MockClient:
        async def request(self, method, url, **kwargs):
            calls.append(len(calls))
            if len(calls) == 1:
                return httpx.Response(429, headers={"Retry-After": "3"}, request=httpx.Request(method, url))
            return httpx.Response(200, json={"total": 0, "jobPostings": []}, request=httpx.Request(method, url))
            
    async def mock_sleep(delay):
        delays.append(delay)
    monkeypatch.setattr(adapters.asyncio, "sleep", mock_sleep)
    
    resp = asyncio.run(adapters.request(MockClient(), "POST", url, json={"offset": 0}))
    assert resp.status_code == 200
    assert len(calls) == 2
    # First retry should respect Retry-After (~3s + jitter)
    assert any(2.9 <= d <= 4.0 for d in delays)

def test_lever_adapter_returns_empty_on_404(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(404, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, "request", mock_request)
    
    c = Company("Plivo", "https://www.plivo.com/jobs/", "lever", "plivo")
    jobs, count = asyncio.run(adapters.LeverAdapter().fetch_jobs(c))
    assert jobs == []
    assert count == 0

def test_workday_adapter_returns_batch_on_unrecoverable_429(monkeypatch):
    async def mock_request(client, method, url, **kwargs):
        return httpx.Response(429, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, "request", mock_request)
    
    c = Company("Mastercard", "https://mastercard.wd1.myworkdayjobs.com/CorporateCareers", "workday", "mastercard|CorporateCareers")
    jobs, count = asyncio.run(adapters.WorkdayAdapter().fetch_jobs(c))
    assert jobs == []
    assert count == 0
    assert jobs.coverage_warning.startswith("Upstream rate limit:")
