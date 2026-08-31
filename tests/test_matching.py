from datetime import datetime, timedelta, timezone
from scraper.models import Job
from scraper.adapters import likely_target, workday_config
from scraper.models import Company
from scraper.normalization import classify_title, enrich, extract_experience, normalize_location

def recent(hours=1):
    return (datetime.now(timezone.utc)-timedelta(hours=hours)).isoformat()

def sample(title="Associate DevOps Engineer", location="Bangalore", description="Requires 1-2 years with AWS Docker Kubernetes", posted_at=None):
    return Job("1",title,"Example",location,description,"lever","company_career","https://example.com/job","https://example.com/apply","https://example.com/careers",posted_at or recent())

def test_location_aliases():
    assert normalize_location("Hybrid - Bangalore")[1] == "Bengaluru"
    assert normalize_location("Hyderabad, Telangana")[1] == "Hyderabad"

def test_experience_is_candidate_requirement():
    assert extract_experience("Company has 10+ years. Candidate needs 1-2 years")[:2] == (1.0,2.0)
    assert extract_experience("Our company has 10+ years of experience serving customers")[2] == "Unknown"
    assert extract_experience("fresh graduate opportunity")[2] == "Fresher"
    assert extract_experience("2 years of relevant experience")[:2] == (2.0,2.0)

def test_title_classification():
    assert classify_title("SDE I")[1] == "Software Engineering"
    assert classify_title("Java Backend Engineer")[1] == "Java / Backend"

def test_only_zero_to_two_year_roles_are_eligible():
    assert not enrich(sample(title="Senior DevOps Engineer")).is_eligible
    assert not enrich(sample(description="Candidate must have 3 years of experience")).is_eligible
    assert not enrich(sample(description="Candidate must have 2+ years experience")).is_eligible
    assert not enrich(sample(description="Candidate needs 1-3 years experience")).is_eligible
    assert enrich(sample(description="Candidate needs 0-2 years experience")).is_eligible

def test_only_last_24_hours_are_eligible():
    assert enrich(sample(posted_at=recent(23))).is_eligible
    assert not enrich(sample(posted_at=recent(25))).is_eligible
    job=sample(); job.posted_at=None
    assert not enrich(job).is_eligible

def test_junior_match_scores_well():
    job=enrich(sample())
    assert job.is_eligible and job.relevance_score >= 65 and "AWS" in job.skills

def test_skill_boundaries_avoid_substring_false_positives():
    job=enrich(sample(description="1-2 years experience building digital laws platforms using Java"))
    assert "Git" not in job.skills and "AWS" not in job.skills and "Java" in job.skills

def test_enterprise_ats_prefilter():
    assert likely_target("Associate Software Engineer", "Bengaluru, India")
    assert likely_target("Junior DevOps Engineer", "Hyderabad")
    assert not likely_target("Senior Software Engineer", "London")

def test_workday_board_configuration():
    company=Company("Example","https://example.wd5.myworkdayjobs.com/External","workday","tenant|External")
    assert workday_config(company)==("https://example.wd5.myworkdayjobs.com","tenant","External")
