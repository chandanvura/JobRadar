"""Restore a trusted D1 SQL export into disposable SQLite; never connect remotely."""
import argparse
import json
import sqlite3
from pathlib import Path

REQUIRED = {
    "companies": {"id", "name"},
    "jobs": {"id", "external_job_id", "ats_provider"},
    "notifications": {"job_id", "channel", "status"},
    "scraper_runs": {"id", "started_at", "finished_at", "status"},
}


def verify_backup(path):
    path = Path(path)
    if not 0 < path.stat().st_size <= 250_000_000:
        raise ValueError("SQL backup is empty or exceeds the 250 MB restore budget")
    with sqlite3.connect(":memory:") as db:
        # Export SQL may create schema/data, but cannot attach filesystem databases.
        db.set_authorizer(lambda action, *_: sqlite3.SQLITE_DENY if action in {
            sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH
        } else sqlite3.SQLITE_OK)
        db.executescript(path.read_text(encoding="utf-8"))
        if db.execute("PRAGMA integrity_check").fetchall() != [("ok",)]:
            raise ValueError("Restored database failed integrity check")
        for table, required in REQUIRED.items():
            columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}  # nosec B608 -- constant allowlist
            if not required <= columns:
                raise ValueError(f"Restored database missing required schema: {table}")
        if db.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("Restored database has broken foreign keys")
        # Counts prove data can be queried, without publishing job contents.
        return {table: db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in REQUIRED}  # nosec B608


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sql", type=Path)
    args = parser.parse_args()
    print(json.dumps({"restore_verified": True, "row_counts": verify_backup(args.sql)}))


if __name__ == "__main__":
    main()
