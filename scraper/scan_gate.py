"""Cheap fail-closed gate for scheduled and recovery scans."""
import os
from scraper.health import read_health
from scraper.watchdog import minutes_since_scan


def should_scan(health, event, now=None):
    if health.get("quota_exhausted") or not health.get("ok"):
        return False
    if event == "workflow_dispatch":
        return True
    age = minutes_since_scan(health, now)
    return age is None or age >= 210


def main():
    try:
        decision = should_scan(read_health(), os.environ.get("TRIGGER_EVENT"))
        print("Full distributed scan required:", decision)
    except (RuntimeError, ValueError, TypeError) as exc:
        decision = False
        print(f"Health unavailable ({type(exc).__name__}); defer scan to next check")
    with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as output:
        output.write(f"should_run={'true' if decision else 'false'}\n")


if __name__ == "__main__":
    main()
