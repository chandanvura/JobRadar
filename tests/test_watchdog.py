from datetime import datetime, timedelta, timezone

import pytest

from scraper.watchdog import last_successful_finalization, request_json, should_dispatch


def test_watchdog_recovers_stale_scan_but_does_not_duplicate_active_run():
    now=datetime(2026,9,26,12,tzinfo=timezone.utc)
    health=lambda minutes: {"latest_run":{"finished_at":(now-timedelta(minutes=minutes)).isoformat()}}
    assert not should_dispatch(health(149),[],now)
    assert should_dispatch(health(150),[],now)
    assert not should_dispatch(health(150),[{"status":"queued"}],now)
    assert not should_dispatch(health(150),[{"status":"in_progress"}],now)
    assert should_dispatch({"latest_run":None},[],now)


def test_fallback_ignores_successful_gate_only_runs():
    runs=[{"id":9,"conclusion":"success"},{"id":8,"conclusion":"success"}]
    def fetch(url, token):
        if "/runs/9/" in url:
            return {"jobs":[{"name":"gate","conclusion":"success"}]}
        return {"jobs":[{"name":"finalize","conclusion":"success","completed_at":"2026-09-26T12:00:00Z"}]}
    assert last_successful_finalization(runs,"owner/repo","token",fetch)=={
        "latest_run":{"finished_at":"2026-09-26T12:00:00Z"}}


def test_watchdog_rejects_unapproved_urls():
    with pytest.raises(RuntimeError,match="not allowed"):
        request_json("file:///etc/passwd")


def test_watchdog_never_dispatches_into_known_daily_quota_outage():
    assert not should_dispatch({'quota_exhausted':True,'latest_run':None},[])


def test_only_scheduler_fix_push_can_retire_old_stalled_revision_with_queued_replacement():
    from scraper.watchdog import obsolete_scan_ids
    now=datetime(2026,10,9,5,tzinfo=timezone.utc)
    health={"latest_run":{"finished_at":"2026-10-08T15:00:00Z"}}
    old={"id":1,"status":"in_progress","head_sha":"old","created_at":"2026-10-09T04:45:00Z"}
    replacement={"id":2,"status":"pending","head_sha":"fixed"}
    assert obsolete_scan_ids(health,[old,replacement],"push",now)==[1]
    assert obsolete_scan_ids(health,[old,replacement],"schedule",now)==[]
    assert obsolete_scan_ids(health,[old],"push",now)==[]
    assert obsolete_scan_ids(health,[old,{**replacement,"head_sha":"old"}],"push",now)==[]
    assert obsolete_scan_ids({**health,"quota_exhausted":True},[old,replacement],"push",now)==[]
    assert obsolete_scan_ids({"latest_run":{"finished_at":"2026-10-09T04:50:00Z"}},[old,replacement],"push",now)==[]
    assert obsolete_scan_ids(health,[{**old,"created_at":"2026-10-09T04:59:00Z"},replacement],"push",now)==[]
