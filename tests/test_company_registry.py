import pytest
from scraper.main import load_companies
from scraper.models import Company
from scripts.sync_company_registry import missing_sources
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
                 {"companies": [{"name": "New"}]}]

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
