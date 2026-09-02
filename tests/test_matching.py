from datetime import datetime, timedelta, timezone
from scraper.models import Job
from scraper.adapters import job_like_url, likely_target, parse_posted_at, parse_posting, workday_config
from scraper.models import Company
from scraper.main import private_start_chat_id, run_health_status
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

def test_zero_to_three_year_roles_are_eligible():
    accepted=[
        ("Associate DevOps Engineer","Fresher or recent graduate"),
        ("Software Engineer","Candidate needs 0-1 years experience"),
        ("Backend Engineer","Candidate needs 0-2 years experience"),
        ("Java Developer","Candidate needs 0-3 years experience"),
        ("Platform Engineer","Candidate needs 1-2 years experience"),
        ("Cloud Engineer","Candidate needs 1-3 years experience"),
        ("SRE","Candidate needs 2-3 years experience"),
        ("Software Engineer","Candidate needs 2 years of experience"),
        ("Senior DevOps Engineer","Candidate needs 1-2 years experience"),
        ("Lead Software Engineer","Candidate needs 2+ years experience"),
    ]
    for title,description in accepted:
        assert enrich(sample(title=title,description=description)).is_eligible

def test_experience_above_policy_is_excluded():
    assert not enrich(sample(description="Candidate needs 3+ years experience")).is_eligible
    assert not enrich(sample(description="Candidate needs 2-4 years experience")).is_eligible
    assert not enrich(sample(description="Candidate needs 4 years of experience")).is_eligible

def test_only_last_24_hours_are_eligible():
    assert enrich(sample(posted_at=recent(23))).is_eligible
    assert not enrich(sample(posted_at=recent(25))).is_eligible
    job=sample(); job.posted_at=None
    assert not enrich(job).is_eligible

def test_private_start_chat_resolution():
    payload={"result":[
        {"update_id":1,"message":{"text":"/start","chat":{"id":111,"type":"group"}}},
        {"update_id":2,"message":{"text":"hello","chat":{"id":222,"type":"private"}}},
        {"update_id":3,"message":{"text":"/start","chat":{"id":333,"type":"private"}}},
        {"update_id":4,"message":{"text":"/start jobradar","chat":{"id":444,"type":"private"}}},
    ]}
    assert private_start_chat_id(payload)=="444"
    assert private_start_chat_id({"result":[]}) is None

def test_relative_posting_labels_are_normalized():
    now=datetime(2026,9,1,12,0,tzinfo=timezone.utc)
    assert parse_posting("Posted Today",now)==(None,"Posted today","day",None)
    assert parse_posting("Posted 30 minutes ago",now)==(None,"Posted 30 minutes ago","relative",0.5)
    assert parse_posting("2 hours ago",now)==(None,"2 hours ago","relative",2.0)
    assert parse_posting("Posted few hours ago",now)==(None,"Posted a few hours ago","relative",3.0)
    assert parse_posted_at("Posted Yesterday",now) is None

def test_today_label_is_eligible_without_invented_timestamp():
    job=sample(posted_at=recent())
    job.posted_at=None; job.posted_label="Posted today"; job.posted_precision="day"
    enriched=enrich(job)
    assert enriched.is_eligible
    assert enriched.posted_at is None and enriched.freshness_score == 12

def test_strictest_experience_requirement_wins():
    assert extract_experience("2+ years in Java. 5+ years overall")[:2] == (5.0,None)
    assert not enrich(sample(description="2+ years in Java. 5+ years overall experience")).is_eligible

def test_skills_are_optional_for_eligibility():
    job=enrich(sample(description="Candidate needs 1-2 years of relevant experience"))
    assert job.skills==[]
    assert job.is_eligible

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

def test_custom_career_pages_follow_official_ats_links_only():
    assert job_like_url("https://jobs.lever.co/example/123","company.example")
    assert job_like_url("https://company.example/careers/job/123","company.example")
    assert not job_like_url("https://unrelated.example/jobs/123","company.example")

def test_health_uses_request_failures_not_opening_counts():
    assert run_health_status(0) == "success"
    assert run_health_status(1) == "degraded"

def test_company_registry_never_shrinks_or_duplicates_sources():
    import csv
    from pathlib import Path
    rows=list(csv.DictReader((Path(__file__).parents[1]/"companies"/"companies.csv").open(encoding="utf-8")))
    enabled=[row for row in rows if row.get("enabled","true").lower()=="true"]
    keys={(row["ats_provider"].lower(),row["ats_identifier"].lower()) for row in enabled}
    assert len(enabled)>=168
    assert len(keys)==len(enabled)
