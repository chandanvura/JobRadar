from datetime import datetime, timezone
from scraper.models import Job
from scraper.normalization import enrich
from scraper.roles import classify_role
from scraper.requirements import candidate_text


def job(title, description, company='Example', url='https://example.com/job/1'):
    return Job('1', title, company, 'Bengaluru', description, 'workday', 'company_career', url, url, 'https://example.com/jobs', datetime.now(timezone.utc).isoformat())


def test_title_only_experience_is_not_a_confirmed_range():
    for title in ['Associate Software Engineer', 'Junior Java Developer', 'Trainee Developer', 'Software Engineer I']:
        result = enrich(job(title, 'Build APIs with Java and SQL.'))
        assert result.experience_min is None and result.experience_max is None
        assert not result.is_eligible
        assert result.experience_label == 'Entry-level title — experience unverified'
    assert enrich(job('Junior Java Developer', 'Requirements: 1–2 years of work experience with Java.')).is_eligible


def test_required_experience_wins_over_preferred_and_company_history():
    result = enrich(job('Software Engineer', 'Who We Are: Our company has 20 years of Java and SQL expertise. Requirements: 1–2 years of experience using Python. Preferred Qualifications: 5 years of experience.'))
    assert (result.experience_min, result.experience_max) == (1, 2)
    assert result.is_eligible


def test_generic_title_needs_candidate_evidence_not_brand_copy():
    assert classify_role('Associate Engineer', 'Who We Are: We use Java and SQL. Benefits: Learn Python.')[1] == 'Other'
    assert classify_role('Associate Engineer', 'Our company uses Java and SQL.')[1] == 'Other'
    assert classify_role('Associate Engineer', 'Who We Are: We use Java and SQL. Requirements: Develop software using Python and Kubernetes.')[1] == 'Software Engineering'
    assert 'Java' not in candidate_text('About Us: Java SQL. Requirements: Python required.')


def test_shared_hpe_board_is_not_relabelled_as_juniper():
    url='https://hpe.wd5.myworkdayjobs.com/Jobsathpe/job/Bengaluru/Cloud-Developer_1211072-2'
    result=enrich(job('Cloud Developer','1–2 years experience', 'Juniper Networks', url))
    assert result.company == 'HPE'
    assert result.career_page_url == 'https://hpe.wd5.myworkdayjobs.com/Jobsathpe'
    assert enrich(job('Cloud Developer','1–2 years experience','Juniper Networks','https://jobs.juniper.net/job/1')).company == 'Juniper Networks'


def test_migration_downgrades_inferred_rows_without_deleting_other_jobs():
    import sqlite3
    from pathlib import Path
    db=sqlite3.connect(':memory:')
    db.execute('CREATE TABLE jobs(experience_min REAL,experience_max REAL,experience_label TEXT,is_eligible INTEGER,eligibility_reason TEXT,updated_at TEXT)')
    db.execute("INSERT INTO jobs VALUES (0,3,'Entry-level title',1,'Eligible','old')")
    db.execute("INSERT INTO jobs VALUES (1,2,'1–2',1,'Eligible','old')")
    sql=(Path(__file__).parents[1]/'web/drizzle/0003_experience_certainty.sql').read_text()
    db.executescript(sql)
    assert db.execute('SELECT experience_min,experience_max,is_eligible FROM jobs').fetchall()==[(None,None,0),(1,2,1)]
    assert db.execute('SELECT count(*) FROM jobs').fetchone()[0]==2
    db.executescript(sql)
    assert db.execute('SELECT count(*) FROM jobs').fetchone()[0]==2
