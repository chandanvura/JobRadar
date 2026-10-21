"""Read-only operational evidence; failures are visible in GitHub Actions."""
import datetime
import json
import os
import shutil
import subprocess  # nosec B404 -- fixed public endpoints, no shell or credentials
from pathlib import Path

from scraper.health import read_health
from scraper.watchdog import request_json

UTC = datetime.timezone.utc


def age_hours(value, now):
    try:
        timestamp = datetime.datetime.fromisoformat(value.replace("Z", "+00:00"))
        if timestamp.tzinfo is None:
            return None
        age = (now - timestamp).total_seconds() / 3600
        return age if age >= 0 else None
    except (AttributeError, TypeError, ValueError):
        return None


def public_available():
    executable = shutil.which("curl")
    if not executable:
        return False
    for path, content_type in [("/", "text/html"), ("/backup/catalog.json", "application/json")]:
        result = subprocess.run(  # nosec B603 -- fixed arguments and public URL
            [executable, "--silent", "--show-error", "--head", "--max-time", "15",
             "--output", os.devnull, "--write-out", "%{http_code} %{content_type}",
             "https://jobradar.chandanvura.workers.dev" + path],
            capture_output=True, text=True, timeout=20, check=False,
        )
        if result.returncode or not result.stdout.startswith("200 ") or content_type not in result.stdout:
            return False
    return True


def assess(health, backup_runs, artifacts, now=None, available=True, notification_runs=None):
    now = now or datetime.datetime.now(UTC)
    problems = []
    if not available:
        problems.append("portal_or_static_backup_unavailable")
    if health.get("database") is not True or health.get("ingestion_configured") is not True:
        problems.append("database_or_ingestion_unavailable")
    if health.get("quota_exhausted"):
        problems.append("database_quota_exhausted")
    run = health.get("latest_run") or {}
    age = age_hours(run.get("finished_at"), now)
    if age is None or age >= 5:
        problems.append("completed_scan_missing_or_stale")
    if run.get("status") != "success" or run.get("companies_failed", 0):
        problems.append("source_failures_or_incomplete_scan")
    backup = next((r for r in backup_runs if r.get("conclusion") == "success"), None)
    backup_age = age_hours((backup or {}).get("updated_at"), now)
    if backup_age is None or backup_age >= 36:
        problems.append("verified_backup_missing_or_stale")
    if backup and not any(
        a.get("name") == f"jobradar-d1-{backup['id']}" and not a.get("expired", True)
        and a.get("size_in_bytes", 0) > 0 for a in artifacts
    ):
        problems.append("backup_artifact_missing_or_expired")
    notification_age = None
    if notification_runs is not None:
        completed = [r for r in notification_runs if r.get("status") == "completed"]
        latest = completed[0] if completed else None
        if latest and latest.get("conclusion") != "success":
            problems.append("notification_workflow_failed")
        delivered = next((r for r in completed if r.get("conclusion") == "success"), None)
        notification_age = age_hours((delivered or {}).get("updated_at"), now)
        if notification_age is None or notification_age >= 36:
            problems.append("notification_verification_missing_or_stale")
    return {"checked_at": now.isoformat(), "ok": not problems, "problems": problems,
            "notification_workflow_age_hours": notification_age,
            "completed_scan_age_hours": age, "backup_age_hours": backup_age}


def main():
    token = os.environ["GITHUB_TOKEN"]
    repository = os.environ["GITHUB_REPOSITORY"]
    api = f"https://api.github.com/repos/{repository}"
    try:
        health = read_health()
        runs = request_json(api + "/actions/workflows/backup-d1.yml/runs?per_page=30", token)["workflow_runs"]
        backup = next((r for r in runs if r.get("conclusion") == "success"), None)
        artifacts = request_json(api + f"/actions/runs/{backup['id']}/artifacts?per_page=100", token)["artifacts"] if backup else []
        notifications = request_json(api + "/actions/workflows/telegram-digest.yml/runs?per_page=30", token)["workflow_runs"]
        report = assess(health, runs, artifacts, available=public_available(), notification_runs=notifications)
    except (RuntimeError, ValueError, OSError, KeyError, TypeError, subprocess.SubprocessError):
        report = {"ok": False, "problems": ["operational_evidence_unavailable"]}
    Path("ops-report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    summary = "JobRadar operational check: " + ("PASS" if report["ok"] else "FAIL") + "\n"
    summary += "\n".join("- " + problem for problem in report["problems"]) + "\n"
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as output:
            output.write(summary)
    print(summary)
    if not report["ok"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
