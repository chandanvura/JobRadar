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


def test_production_job_identity_lookups_use_bounded_index_search():
    import re
    db = sqlite3.connect(':memory:')
    for path in sorted((ROOT / 'web' / 'drizzle').glob('*.sql')):
        apply_migration(db, path.name)
    source = (ROOT / 'web' / 'worker' / 'index.ts').read_text()
    queries = re.findall(r'prepare\("(SELECT [^"\n]+(?:FROM jobs|JOIN jobs)[^"\n]+)"\)', source)
    identity_queries = [query for query in queries if 'external_job_id=?' in query]
    assert len(identity_queries) >= 3
    for query in identity_queries:
        plan = ' '.join(row[3] for row in db.execute('EXPLAIN QUERY PLAN ' + query, ('Company', 'workday', 'REQ-1')))
        assert 'SEARCH' in plan and 'jobs_source_key (company=? AND ats_provider=? AND external_job_id=?)' in plan, (query, plan)
        assert 'SCAN' not in plan, (query, plan)


def test_public_pagination_merges_bounded_city_index_pages_without_sorting_full_catalog():
    import re
    db=sqlite3.connect(':memory:')
    for path in sorted((ROOT/'web'/'drizzle').glob('*.sql')):apply_migration(db,path.name)
    source=(ROOT/'web'/'worker'/'index.ts').read_text()
    sql=re.search(r'prepare\(`(SELECT \$\{PUBLIC_JOB_COLUMNS\} FROM jobs WHERE id IN [^`]+)`\)',source).group(1).replace('${PUBLIC_JOB_COLUMNS}','id')
    for i in range(1000):
        db.execute("INSERT INTO jobs(external_job_id,company,title,normalized_title,role_category,location,normalized_location,city,ats_provider,source,job_url,application_url,career_page_url,first_seen_at,last_seen_at,relevance_score,freshness_score,priority_score) VALUES (?,'Example','Engineer','engineer','Java / Backend','City','City',?,'workday','company_career','https://example.test','https://example.test','https://example.test','2026-09-30','2026-09-30',1,1,1)",(str(i),['Bengaluru','Hyderabad','Pune'][i%3]))
    expected=db.execute("SELECT id FROM jobs WHERE is_active=1 AND city IN ('Bengaluru','Hyderabad') AND id>100 ORDER BY id LIMIT 101").fetchall()
    assert db.execute(sql,(100,100)).fetchall()==expected
    plan=' '.join(row[3] for row in db.execute('EXPLAIN QUERY PLAN '+sql,(100,100)))
    assert plan.count('SEARCH jobs USING COVERING INDEX jobs_active_city_id_idx (is_active=? AND city=? AND id>?)')==2,plan
