from scraper.models import Job
from scraper.normalization import classify_title, enrich, extract_experience, normalize_location

def sample(title="Associate DevOps Engineer", location="Bangalore", description="Requires 1-3 years with AWS Docker Kubernetes"):
    return Job("1",title,"Example",location,description,"greenhouse","company_career","https://example.com/job","https://example.com/apply","https://example.com/careers")

def test_location_aliases():
    assert normalize_location("Hybrid - Bangalore")[1] == "Bengaluru"
    assert normalize_location("Hyderabad, Telangana")[1] == "Hyderabad"

def test_experience_is_candidate_requirement():
    assert extract_experience("Company has 10+ years. Candidate needs 1-3 years")[:2] == (1.0,3.0)
    assert extract_experience("Our company has 10+ years of experience serving customers")[2] == "Unknown"
    assert extract_experience("fresh graduate opportunity")[2] == "Fresher"

def test_title_classification():
    assert classify_title("SDE I")[1] == "Software Engineering"
    assert classify_title("Java Backend Engineer")[1] == "Java / Backend"

def test_senior_and_four_plus_excluded():
    assert not enrich(sample(title="Senior DevOps Engineer")).is_eligible
    assert not enrich(sample(description="Candidate must have 4+ years experience")).is_eligible

def test_junior_match_scores_well():
    job=enrich(sample())
    assert job.is_eligible and job.relevance_score >= 65 and "AWS" in job.skills

def test_skill_boundaries_avoid_substring_false_positives():
    job=enrich(sample(description="We build digital laws platforms using Java"))
    assert "Git" not in job.skills and "AWS" not in job.skills and "Java" in job.skills
