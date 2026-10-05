import pytest
from scraper.main import load_companies
from scraper.models import Company
from scripts.sync_company_registry import changed_sources, missing_sources
from scripts import sync_company_registry
from io import BytesIO
import json


def test_registry_has_unique_names_sources_and_public_career_urls():
    rows = load_companies()
    assert len(rows) >= 700
    assert len({c.name.casefold() for c in rows}) == len(rows)
    assert len({(c.ats_provider, c.ats_identifier.casefold()) for c in rows}) == len(rows)
    assert all(c.careers_url.startswith("https://") for c in rows)


def test_sync_adds_only_missing_sources_without_faking_scan_metrics():
    rows = [Company("Existing", "https://existing.test/careers", "custom", "existing", 4, True),
            Company("New", "https://new.test/careers", "custom", "new", 4, True)]
    result = missing_sources(rows, {"companies": [{"name": "EXISTING", "jobs_found": 23}]})
    assert [c["name"] for c in result] == ["New"]
    assert result[0]["last_checked_at"] is None
    assert result[0]["warning"] == "Awaiting first scheduled scan"
    assert not missing_sources(rows, {"companies": [{"name": "Existing"}, {"name": "New"}]})
    with pytest.raises(ValueError):
        missing_sources(rows, {"companies": [], "data_mode": "backup"})


def test_registry_sync_uses_company_only_ingestion_response(monkeypatch):
    row = Company("New", "https://new.test/careers", "custom", "new", 4, True)
    calls = []
    responses = [{"companies": []}, {"accepted": 0, "rejected": 0, "errors": []},
                 {"companies": [{"name": "New", "careers_url": row.careers_url, "ats_provider": row.ats_provider}]}]

    def read(request, timeout):
        calls.append(request)
        return BytesIO(json.dumps(responses[len(calls) - 1]).encode())

    monkeypatch.setattr(sync_company_registry, "urlopen", read)
    monkeypatch.setattr(sync_company_registry, "load_companies", lambda: [row])
    monkeypatch.setenv("JOBRADAR_INGEST_SECRET", "test-only")
    sync_company_registry.main()
    payload = json.loads(calls[1].data)
    assert set(payload) == {"companies"}
    assert payload["companies"][0]["name"] == "New"
    assert all(request.get_header("User-agent").startswith("JobRadar/") for request in calls)


def test_repaired_sources_preserve_counts_and_dates_until_real_rescan():
    company = Company("Example", "https://jobs.lever.co/example", "lever", "example", 4, True)
    previous = {"name": "Example", "careers_url": "https://example.test/careers", "ats_provider": "custom",
                "jobs_found": 23, "candidate_jobs": 5, "eligible_jobs": 2, "error_count": 0,
                "last_checked_at": "2026-10-05T10:00:00Z", "last_success_at": "2026-10-05T10:00:00Z"}
    updates = changed_sources([company], {"companies": [previous]})
    assert len(updates) == 1
    assert updates[0]["warning"] == "Source repaired; awaiting scheduled rescan"
    for key in ("jobs_found", "candidate_jobs", "eligible_jobs", "last_checked_at", "last_success_at"):
        assert updates[0][key] == previous[key]
    assert not changed_sources([company], {"companies": updates})
    with pytest.raises(ValueError):
        changed_sources([company], {"companies": [previous], "data_mode": "backup"})


def test_focused_repair_refresh_publishes_only_real_results(monkeypatch):
    import asyncio
    rows = [Company('Working', 'https://jobs.lever.co/working', 'lever', 'working'),
            Company('Blocked', 'https://jobs.lever.co/blocked', 'lever', 'blocked')]
    updates = [{'name': row.name, 'jobs_found': 7, 'warning': 'Source repaired; awaiting scheduled rescan'} for row in rows]
    async def scan(company, *args):
        if company.name == 'Blocked': return [], {'name': 'Blocked'}, 'timeout', 0
        return [], {'name': 'Working', 'jobs_found': 42, 'warning': 'No target-city roles currently'}, None, 42
    monkeypatch.setattr(sync_company_registry, 'scrape', scan)
    jobs, checked = asyncio.run(sync_company_registry.refresh_repairs(rows, updates))
    assert not jobs
    assert checked[0]['jobs_found'] == 42
    assert checked[1] == updates[1]


def test_registry_does_not_repeat_repairs_for_default_https_port():
    row = Company("FamPay", "https://www.famapp.in:443/careers/", "custom", "fampay")
    assert not changed_sources([row], {"companies": [{"name": "FamPay", "careers_url": "https://www.famapp.in/careers/", "ats_provider": "custom"}]})


def test_large_source_refresh_uses_bounded_job_batches(monkeypatch):
    row = Company('Example', 'https://jobs.lever.co/example', 'lever', 'example')
    calls = []
    responses = [dict(companies=[dict(name='Example', careers_url='https://example.test', ats_provider='custom')]),
                 dict(accepted=200, rejected=0), dict(accepted=1, rejected=0),
                 dict(companies=[dict(name='Example', careers_url=row.careers_url, ats_provider='lever')])]
    async def refresh(*args):
        return [dict(external_job_id=str(i)) for i in range(201)], [dict(name='Example', careers_url=row.careers_url, ats_provider='lever')]
    def read(request, timeout):
        calls.append(request)
        return BytesIO(json.dumps(responses[len(calls)-1]).encode())
    monkeypatch.setattr(sync_company_registry, 'urlopen', read)
    monkeypatch.setattr(sync_company_registry, 'load_companies', lambda: [row])
    monkeypatch.setattr(sync_company_registry, 'refresh_repairs', refresh)
    monkeypatch.setenv('JOBRADAR_VERIFY_SOURCE_UPDATES', 'true')
    monkeypatch.setenv('JOBRADAR_INGEST_SECRET', 'test-only')
    sync_company_registry.main()
    first, second = [json.loads(request.data) for request in calls[1:3]]
    assert len(first['jobs']) == 200 and len(second['jobs']) == 1
    assert first['companies'] and not second['companies']
    assert 'run' not in first and 'run' not in second
