"""False-positive regression tests for Phase 2's broadened engineering taxonomy."""
from datetime import datetime, timedelta, timezone

import pytest

from scraper.models import Job
from scraper.normalization import enrich


def candidate(title, description, *, age_hours=1, location="Bengaluru"):
    posted=(datetime.now(timezone.utc)-timedelta(hours=age_hours)).isoformat()
    return Job("negative-match-1", title, "Example", location, description,
               "lever", "company_career", "https://example.com/job",
               "https://example.com/apply", "https://example.com/careers", posted)


@pytest.mark.parametrize(("title","requirements"), [
    ("Performance Engineer", "1-2 years experience managing retail store sales performance and merchandising."),
    ("Database Engineer", "1-2 years experience maintaining a customer contacts database in a non-technical operations role."),
    ("QA Engineer", "1-2 years experience in manufacturing quality assurance inspections for mechanical parts."),
])
def test_non_software_context_does_not_become_eligible_from_broad_title(title, requirements):
    job=enrich(candidate(title,requirements))
    assert not job.is_eligible, (title,job.role_category,job.eligibility_reason)


@pytest.mark.parametrize("title", [
    "Performance Engineer", "Database Engineer", "QA Engineer", "Cloud Platform Engineer I",
])
def test_missing_experience_never_auto_eligible(title):
    assert not enrich(candidate(title,"Work with internal teams and provide support.")).is_eligible


@pytest.mark.parametrize("description", [
    "Experience: minimum 5 years developing Java services.",
    "Requires 4-6 years of professional experience.",
])
def test_explicit_over_three_years_stays_ineligible(description):
    job=enrich(candidate("Associate Software Engineer",description))
    assert not job.is_eligible
    assert job.eligibility_reason=="Required minimum exceeds 3 years or experience range is invalid"


def test_stale_and_outside_shortlist_remain_ineligible():
    assert not enrich(candidate("Junior DevOps Engineer","1-2 years experience in Kubernetes",age_hours=26)).is_eligible
    assert not enrich(candidate("Junior DevOps Engineer","1-2 years experience in Kubernetes",location="Pune, India")).is_eligible


@pytest.mark.parametrize(("title","requirements"), [
    ("Performance Engineer", "1-2 years performance testing and software latency profiling."),
    ("Database Engineer", "1-2 years of PostgreSQL database infrastructure and SQL optimization."),
    ("QA Engineer", "1-2 years automated testing with Selenium and Python."),
])
def test_same_broad_titles_with_software_requirements_stay_eligible(title, requirements):
    job=enrich(candidate(title,requirements))
    assert job.is_eligible, (title,job.role_category,job.eligibility_reason)
