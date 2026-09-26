from datetime import datetime, timedelta, timezone

from scraper.watchdog import last_successful_finalization, should_dispatch


def test_watchdog_recovers_stale_scan_but_does_not_duplicate_active_run():
    now=datetime(2026,9,26,12,tzinfo=timezone.utc)
    health=lambda minutes: {"latest_run":{"finished_at":(now-timedelta(minutes=minutes)).isoformat()}}
    assert not should_dispatch(health(74),[],now)
    assert should_dispatch(health(76),[],now)
    assert not should_dispatch(health(76),[{"status":"queued"}],now)
    assert not should_dispatch(health(76),[{"status":"in_progress"}],now)
    assert should_dispatch({"latest_run":None},[],now)


def test_fallback_ignores_successful_gate_only_runs():
    runs=[{"id":9,"conclusion":"success"},{"id":8,"conclusion":"success"}]
    def fetch(url, token):
        if "/runs/9/" in url:
            return {"jobs":[{"name":"gate","conclusion":"success"}]}
        return {"jobs":[{"name":"finalize","conclusion":"success","completed_at":"2026-09-26T12:00:00Z"}]}
    assert last_successful_finalization(runs,"owner/repo","token",fetch)=={
        "latest_run":{"finished_at":"2026-09-26T12:00:00Z"}}
