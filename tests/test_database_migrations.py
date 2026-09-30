import sqlite3
from pathlib import Path

import pytest


ROOT = Path(__file__).resolve().parents[1]


def apply_migration(connection, name):
    sql = (ROOT / "web" / "drizzle" / name).read_text(encoding="utf-8")
    for statement in sql.split("--> statement-breakpoint"):
        if statement.strip():
            connection.executescript(statement)


def test_integrity_migration_cleans_legacy_duplicates_and_enforces_identity():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    apply_migration(db, "0000_nice_greymalkin.sql")
    apply_migration(db, "0001_smiling_iron_fist.sql")
    db.execute("INSERT INTO companies(name,careers_url,ats_provider,ats_identifier,enabled,jobs_found,candidate_jobs) VALUES ('Nutanix','https://old.example','custom','nutanix',1,0,0)")
    old_id = db.execute("SELECT id FROM companies WHERE ats_provider='custom'").fetchone()[0]
    db.execute("INSERT INTO companies(name,careers_url,ats_provider,ats_identifier,enabled,jobs_found,candidate_jobs) VALUES ('Nutanix','https://jobs.jobvite.com/nutanix','jobvite','nutanix|tenant',1,410,6)")
    db.execute("INSERT INTO jobs(external_job_id,company_id,company,title,normalized_title,role_category,location,normalized_location,ats_provider,source,job_url,application_url,career_page_url,first_seen_at,last_seen_at,relevance_score,freshness_score,priority_score) VALUES ('REQ-1',?,'Nutanix','Engineer','engineer','Software Engineering','Bengaluru','Bengaluru','custom','company_career','https://example.com/job','https://example.com/apply','https://example.com/careers','2026-09-30','2026-09-30',70,30,5)",(old_id,))
    db.execute("INSERT INTO scraper_runs(started_at,status) VALUES ('2026-09-30T00:00:00Z','success')")
    db.execute("INSERT INTO scraper_runs(started_at,status) VALUES ('2026-09-30T00:00:00Z','success')")

    apply_migration(db, "0002_production_integrity.sql")

    assert db.execute("SELECT ats_provider,jobs_found FROM companies WHERE name='Nutanix'").fetchall() == [("jobvite",410)]
    assert db.execute("SELECT company_id FROM jobs WHERE external_job_id='REQ-1'").fetchone() == (None,)
    assert db.execute("SELECT count(*) FROM scraper_runs").fetchone()[0] == 1
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO companies(name,careers_url,ats_provider,ats_identifier) VALUES ('nutanix','https://duplicate.example','custom','duplicate')")
    db.execute("INSERT INTO jobs(external_job_id,company,title,normalized_title,role_category,location,normalized_location,ats_provider,source,job_url,application_url,career_page_url,first_seen_at,last_seen_at,relevance_score,freshness_score,priority_score) VALUES ('REQ-1','Another Employer','Engineer','engineer','Software Engineering','Hyderabad','Hyderabad','custom','company_career','https://other.example/job','https://other.example/apply','https://other.example/careers','2026-09-30','2026-09-30',70,30,5)")
    assert db.execute("SELECT count(*) FROM jobs WHERE ats_provider='custom' AND external_job_id='REQ-1'").fetchone()[0] == 2
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO scraper_runs(started_at,status) VALUES ('2026-09-30T00:00:00Z','success')")
