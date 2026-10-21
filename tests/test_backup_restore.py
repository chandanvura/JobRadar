from pathlib import Path
import sqlite3

import pytest

from scripts.verify_d1_backup import verify_backup

SCHEMA = Path(__file__).resolve().parents[1] / "web/drizzle/0000_nice_greymalkin.sql"


def test_restore_real_schema_and_query_data(tmp_path):
    path = tmp_path / "backup.sql"
    path.write_text(SCHEMA.read_text() + "\nINSERT INTO scraper_runs(started_at,status) VALUES ('2026-10-21','success');")
    assert verify_backup(path) == {"companies": 0, "jobs": 0, "notifications": 0, "scraper_runs": 1}


@pytest.mark.parametrize("sql", ["", "broken SQL;", "CREATE TABLE jobs(id INTEGER);", SCHEMA.read_text() + "INSERT INTO notifications(job_id,channel,status) VALUES (999,'telegram','sent');"])
def test_unusable_or_inconsistent_backup_fails(sql, tmp_path):
    path = tmp_path / "backup.sql"
    path.write_text(sql)
    with pytest.raises((ValueError, sqlite3.DatabaseError)):
        verify_backup(path)


def test_backup_sql_cannot_attach_files(tmp_path):
    path = tmp_path / "backup.sql"
    target = tmp_path / "must-not-exist.db"
    path.write_text(f"ATTACH DATABASE '{target}' AS unsafe;")
    with pytest.raises(sqlite3.DatabaseError):
        verify_backup(path)
    assert not target.exists()
