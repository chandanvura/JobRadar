import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

from scraper import distributed


def test_successful_scan_does_not_require_telegram_when_no_alerts(monkeypatch):
    stamp = datetime.now(timezone.utc).isoformat()
    monkeypatch.setenv("JOBRADAR_API_URL", "https://example.test")
    monkeypatch.setenv("JOBRADAR_INGEST_SECRET", "test-secret")
    monkeypatch.setattr(distributed, "load_companies", lambda: [SimpleNamespace(enabled=True, ats_provider="greenhouse")])
    monkeypatch.setattr(distributed, "load_artifacts", lambda paths: [])
    monkeypatch.setattr(distributed, "merge_artifacts", lambda *args: {
        "companies": [{"name": "Example", "error_count": 0, "jobs_found": 0}],
        "jobs": [], "failures": 0, "started_at": stamp, "finished_at": stamp,
        "jobs_scanned": 0, "raw_jobs": 0,
    })

    async def ingest(*args):
        return {"notification_keys": [], "new_external_ids": []}

    async def unexpected_telegram_call():
        raise AssertionError("Telegram must not block a scan with no alerts")

    monkeypatch.setattr(distributed, "ingest_scan", ingest)
    monkeypatch.setattr(distributed, "ensure_telegram_ready", unexpected_telegram_call)
    asyncio.run(distributed.finalize(["unused.json"]))
