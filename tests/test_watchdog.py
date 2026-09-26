from datetime import datetime, timedelta, timezone

from scraper.watchdog import should_dispatch


def test_watchdog_recovers_stale_scan_but_does_not_duplicate_active_run():
    now=datetime(2026,9,26,12,tzinfo=timezone.utc)
    health=lambda minutes: {"latest_run":{"finished_at":(now-timedelta(minutes=minutes)).isoformat()}}
    assert not should_dispatch(health(74),[],now)
    assert should_dispatch(health(76),[],now)
    assert not should_dispatch(health(76),[{"status":"queued"}],now)
    assert not should_dispatch(health(76),[{"status":"in_progress"}],now)
    assert should_dispatch({"latest_run":None},[],now)
