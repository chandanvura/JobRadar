from datetime import datetime, timezone

import pytest

from scraper.ops_check import age_hours, assess

NOW = datetime(2026, 10, 21, 12, tzinfo=timezone.utc)
HEALTH = {"database": True, "ingestion_configured": True, "latest_run": {
    "finished_at": "2026-10-21T11:00:00Z", "status": "success", "companies_failed": 0}}
RUNS = [{"id": 7, "conclusion": "success", "updated_at": "2026-10-21T01:30:00Z"}]
ARTIFACTS = [{"name": "jobradar-d1-7", "expired": False, "size_in_bytes": 2000}]


def test_healthy_evidence_and_failed_attempt_after_valid_backup():
    assert assess(HEALTH, [{"conclusion": "failure"}, *RUNS], ARTIFACTS, NOW)["ok"]


@pytest.mark.parametrize("value", [None, "invalid", "2026-10-21T11:00:00", "2026-10-22T00:00:00Z"])
def test_invalid_and_future_timestamps_are_not_fresh(value):
    assert age_hours(value, NOW) is None


def test_monitor_reports_broken_sources_even_with_recent_completed_scan():
    report = assess({**HEALTH, "latest_run": {**HEALTH["latest_run"], "status": "degraded", "companies_failed": 1}}, RUNS, ARTIFACTS, NOW)
    assert report["problems"] == ["source_failures_or_incomplete_scan"]
    assert report['state'] == 'degraded' and report['ok'] is False
    assert report['checks']['portal'] is True and report['checks']['database'] is True
    assert report['checks']['feeds'] is False and report['checks']['freshness'] is True


def test_feed_degradation_summary_preserves_failure_and_distinguishes_unknown_evidence():
    from scraper.ops_check import summary
    health = {**HEALTH, 'latest_run': {**HEALTH['latest_run'], 'status': 'degraded',
              'companies_checked': 743, 'companies_successful': 741, 'companies_failed': 2}}
    report = assess(health, RUNS, ARTIFACTS, NOW)
    text = summary(report)
    assert '| feeds | FAIL |' in text and '| portal | PASS |' in text
    assert '| notifications | UNKNOWN |' in text and '741/743' in text
    assert 'source_failures_or_incomplete_scan' in text and report['ok'] is False


def test_database_failure_is_not_reported_as_only_feed_degradation():
    report = assess({**HEALTH, 'database': False}, RUNS, ARTIFACTS, NOW)
    assert report['state'] == 'failed'
    assert report['checks']['database'] is False and report['checks']['feeds'] is True


def test_monitor_requires_recent_completed_scan_and_downloadable_backup():
    report = assess({**HEALTH, "latest_run": {"started_at": "2026-10-21T11:59:00Z"}}, RUNS, [], NOW)
    assert "completed_scan_missing_or_stale" in report["problems"]
    assert "backup_artifact_missing_or_expired" in report["problems"]
    for artifact in [{**ARTIFACTS[0], "expired": True}, {**ARTIFACTS[0], "size_in_bytes": 0}]:
        assert not assess(HEALTH, RUNS, [artifact], NOW)["ok"]


def test_backup_freshness_boundary_and_quota():
    runs = [{**RUNS[0], "updated_at": "2026-10-20T00:00:00Z"}]
    report = assess({**HEALTH, "quota_exhausted": True}, runs, ARTIFACTS, NOW)
    assert "verified_backup_missing_or_stale" in report["problems"]
    assert "database_quota_exhausted" in report["problems"]


def test_operational_failure_is_recorded_and_fails_without_secret_output(monkeypatch, tmp_path):
    from scraper import ops_check
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GITHUB_TOKEN", "not-a-real-token")
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    def failure():
        raise RuntimeError("private diagnostic")
    monkeypatch.setattr(ops_check, "read_health", failure)
    with pytest.raises(SystemExit):
        ops_check.main()
    report = (tmp_path / "ops-report.json").read_text()
    assert "operational_evidence_unavailable" in report
    assert "private diagnostic" not in report


def test_public_availability_failure_does_not_look_like_healthy_ingestion():
    assert assess(HEALTH, RUNS, ARTIFACTS, NOW, available=False)["problems"] == ["portal_or_static_backup_unavailable"]


def test_public_probe_is_bounded_and_checks_both_content_types(monkeypatch):
    import subprocess
    from scraper import ops_check
    calls = []
    monkeypatch.setattr(ops_check.shutil, "which", lambda _: "/usr/bin/curl")
    def request(command, **options):
        calls.append(command)
        assert "--head" in command and options["timeout"] == 20
        assert not options.get("shell")
        return subprocess.CompletedProcess(command, 0, "200 " + ("text/html" if command[-1].endswith("/") else "application/json"))
    monkeypatch.setattr(ops_check.subprocess, "run", request)
    assert ops_check.public_available()
    assert len(calls) == 2
    monkeypatch.setattr(ops_check.subprocess, "run", lambda *a, **k: subprocess.CompletedProcess([], 0, "200 text/html"))
    assert not ops_check.public_available()


def test_notification_failures_are_visible_even_after_a_recent_success():
    sent = {"status": "completed", "conclusion": "success", "updated_at": "2026-10-21T11:00:00Z"}
    assert assess(HEALTH, RUNS, ARTIFACTS, NOW, notification_runs=[sent])["ok"]
    failed = {**sent, "conclusion": "failure"}
    report = assess(HEALTH, RUNS, ARTIFACTS, NOW, notification_runs=[failed, sent])
    assert report["problems"] == ["notification_workflow_failed"]
    assert report["notification_workflow_age_hours"] == 1
    # An active attempt does not invalidate the last confirmed workflow result.
    assert assess(HEALTH, RUNS, ARTIFACTS, NOW, notification_runs=[{**failed, "status": "in_progress"}, sent])["ok"]


@pytest.mark.parametrize("runs", [[], [{"status": "completed", "conclusion": "success", "updated_at": "invalid"}],
                                  [{"status": "completed", "conclusion": "success", "updated_at": "2026-10-20T00:00:00Z"}]])
def test_missing_or_stale_notification_evidence_is_not_healthy(runs):
    report = assess(HEALTH, RUNS, ARTIFACTS, NOW, notification_runs=runs)
    assert "notification_verification_missing_or_stale" in report["problems"]


def test_operational_report_queries_notification_evidence_without_production_writes(monkeypatch, tmp_path):
    import json
    from scraper import ops_check
    monkeypatch.chdir(tmp_path)
    monkeypatch.setenv("GITHUB_TOKEN", "fixture-token-never-real")
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    monkeypatch.setattr(ops_check, "read_health", lambda: HEALTH)
    monkeypatch.setattr(ops_check, "public_available", lambda: True)
    calls = []
    now = datetime.now(timezone.utc).isoformat()
    monkeypatch.setattr(ops_check, "assess", lambda health, runs, artifacts, **kwargs: {
        "ok": True, "problems": [], "notification_runs": kwargs["notification_runs"]})
    def request(url, token):
        calls.append(url)
        assert token == "fixture-token-never-real"
        if "/backup-d1.yml/" in url:
            return {"workflow_runs": [{"id": 7, "conclusion": "success"}]}
        if "/artifacts?" in url:
            return {"artifacts": ARTIFACTS}
        assert "/telegram-digest.yml/runs?" in url
        return {"workflow_runs": [{"status": "completed", "conclusion": "success", "updated_at": now}]}
    monkeypatch.setattr(ops_check, "request_json", request)
    ops_check.main()
    report = json.loads((tmp_path / "ops-report.json").read_text())
    assert len(calls) == 3 and report["notification_runs"][0]["conclusion"] == "success"
    assert "fixture-token-never-real" not in (tmp_path / "ops-report.json").read_text()
