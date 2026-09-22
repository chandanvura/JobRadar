import asyncio,json
from datetime import datetime, timedelta, timezone
import httpx
import pytest
from scraper.models import Job
from bs4 import BeautifulSoup
from scraper.adapters import cached_get, discover_ats, job_like_url, likely_target, location_text, parse_posted_at, parse_posting, request_bucket, workday_config
from scraper.models import Company
from scraper.main import fetch_company_jobs, ingest_chunks, private_start_chat_id, run_health_status, telegram_chat_id, telegram_error
from scraper.distributed import load_artifacts, merge_artifacts, source_shard
from scraper.normalization import classify_employment_type, classify_title, enrich, extract_experience, normalize_location

def recent(hours=1):
    return (datetime.now(timezone.utc)-timedelta(hours=hours)).isoformat()

def sample(title="Associate DevOps Engineer", location="Bangalore", description="Requires 1-2 years with AWS Docker Kubernetes", posted_at=None):
    return Job("1",title,"Example",location,description,"lever","company_career","https://example.com/job","https://example.com/apply","https://example.com/careers",posted_at or recent())

def test_location_aliases():
    assert normalize_location("Hybrid - Bangalore")[1] == "Bengaluru"
    assert normalize_location("Hyderabad, Telangana")[1] == "Hyderabad"
    assert normalize_location("Chennai (Madras), Tamil Nadu")[1] == "Chennai"
    assert normalize_location("Pune / Poona, Maharashtra")[1] == "Pune"

def test_experience_is_candidate_requirement():
    assert extract_experience("Company has 10+ years. Candidate needs 1-2 years")[:2] == (1.0,2.0)
    assert extract_experience("Our company has 10+ years of experience serving customers")[2] == "Unknown"
    assert extract_experience("fresh graduate opportunity")[2] == "Fresher"
    assert extract_experience("2 years of relevant experience")[:2] == (2.0,2.0)

def test_title_classification():
    assert classify_title("SDE I")[1] == "Software Engineering"
    assert classify_title("Java Backend Engineer")[1] == "Java / Backend"
    assert classify_title("DevSecOps Engineer")[1] == "DevOps"
    assert classify_title("Infrastructure Automation Engineer")[1] == "Infrastructure / Operations"
    assert classify_title("Software Engineer, Infrastructure")[1] == "Infrastructure / Operations"
    assert classify_title("Backend Software Engineer")[1] == "Java / Backend"
    assert classify_title("Java Software Engineer")[1] == "Java / Backend"
    assert classify_title("Software Development Engineer I")[1] == "Software Engineering"
    assert classify_title("Java Full Stack Developer")[1] == "Java / Backend"
    assert classify_title("Cloud Support Associate")[1] == "Cloud"
    assert classify_title("Member of Technical Staff I")[1] == "Software Engineering"
    assert classify_title("Cloud Engineering Intern")[1] == "Cloud"
    assert classify_title("Java Intern")[1] == "Java / Backend"
    assert classify_title("SWE I")[1] == "Software Engineering"
    assert classify_title("SW Engineer I")[1] == "Software Engineering"
    assert classify_title("Frontend Developer")[1] == "Software Engineering"
    assert classify_title("QA Associate")[1] == "Quality Engineering"
    assert classify_title("SDET I")[1] == "Quality Engineering"
    assert classify_title("Application Support Associate")[1] == "Technical Support"

def test_explicit_entry_title_can_fill_missing_experience_without_opening_generic_roles():
    entry=enrich(sample(title="Associate Software Engineer",location="Pune",description="Build reliable services"))
    assert entry.is_eligible and entry.experience_label == "Entry-level title"
    generic=enrich(sample(title="Software Engineer",location="Chennai",description="Build reliable services"))
    assert not generic.is_eligible and generic.eligibility_reason == "Experience not stated — verify"

def test_internships_are_classified_and_eligible_without_full_time_experience():
    assert classify_employment_type("Software Engineer Intern") == "Internship"
    assert classify_employment_type("Graduate Software Engineer") == "Full-time"
    job=enrich(sample(title="DevOps Intern",description="Work with AWS and Kubernetes"))
    assert job.employment_type == "Internship"
    assert job.is_eligible

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
        ("Senior Software Engineer","Candidate needs 2+ years experience"),
    ]
    for title,description in accepted:
        assert enrich(sample(title=title,description=description)).is_eligible

def test_experience_above_policy_is_excluded():
    assert not enrich(sample(description="Candidate needs 3+ years experience")).is_eligible
    assert not enrich(sample(description="Candidate needs 2-4 years experience")).is_eligible
    assert not enrich(sample(description="Candidate needs 4 years of experience")).is_eligible

def test_leadership_titles_are_excluded_even_with_low_year_phrase():
    for title in ("Director, Software Engineering","Staff Platform Engineer","Principal DevOps Engineer","Cloud Engineering Manager","Lead Software Engineer"):
        job=enrich(sample(title=title,description="Candidate needs 1-2 years experience"))
        assert not job.is_eligible and job.eligibility_reason=="Leadership-level title"

def test_real_world_experience_phrases():
    assert extract_experience("Minimum experience of 2 years")[:2] == (2.0,None)
    assert extract_experience("Experience: 1 year to 3 years")[:2] == (1.0,3.0)
    assert extract_experience("6-18 months of experience")[:2] == (0.5,1.5)
    assert extract_experience("Up to 3 years of work experience")[:2] == (0.0,3.0)
    assert extract_experience("1-2 years in Java; minimum 5 years overall")[:2] == (5.0,None)
    assert extract_experience("Minimum 2 years and maximum 3 years of experience")[:2] == (2.0,3.0)
    assert extract_experience("No prior experience required")[:2] == (0.0,1.0)
    assert extract_experience("One year of professional experience")[:2] == (1.0,1.0)
    assert extract_experience("Less than three years experience")[:2] == (0.0,3.0)
    assert extract_experience("Early career software engineer")[2] == "Fresher"

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

def test_telegram_get_chat_resolves_username_to_numeric_id():
    assert telegram_chat_id({"ok":True,"result":{"id":573491,"type":"private","username":"GptJobRadarBot"}})=="573491"
    assert telegram_chat_id({"ok":False}) is None

def test_telegram_error_is_actionable_and_does_not_expose_request_url():
    request=httpx.Request("GET","https://api.telegram.org/botSECRET/getMe")
    response=httpx.Response(401,json={"ok":False,"description":"Unauthorized"},request=request)
    error=str(telegram_error(response,"bot authentication"))
    assert error == "Telegram bot authentication failed (HTTP 401): Unauthorized"
    assert "SECRET" not in error

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

def test_multi_location_fields_are_preserved():
    assert location_text("Remote - India",["Bengaluru, Karnataka","Hyderabad, Telangana"]) == "Remote - India · Bengaluru, Karnataka · Hyderabad, Telangana"

def test_workday_board_configuration():
    company=Company("Example","https://example.wd5.myworkdayjobs.com/External","workday","tenant|External")
    assert workday_config(company)==("https://example.wd5.myworkdayjobs.com","tenant","External")

def test_custom_career_pages_follow_official_ats_links_only():
    assert job_like_url("https://jobs.lever.co/example/123","company.example")
    assert job_like_url("https://company.example/careers/job/123","company.example")
    assert not job_like_url("https://unrelated.example/jobs/123","company.example")

def test_custom_pages_index_linked_and_embedded_ats_boards():
    cases={
        '<a href="https://job-boards.greenhouse.io/acme/jobs/1">Open roles</a>':("greenhouse","acme"),
        '<iframe src="https://jobs.lever.co/example"></iframe>':("lever","example"),
        '<script>window.board="https://jobs.ashbyhq.com/org"</script>':("ashby","org"),
        '<a href="https://jobs.smartrecruiters.com/ExampleCo">Jobs</a>':("smartrecruiters","ExampleCo"),
        '<a href="https://acme.wd5.myworkdayjobs.com/en-US/External/jobs">Careers</a>':("workday","acme|External"),
    }
    for markup,expected in cases.items():
        assert discover_ats(BeautifulSoup(markup,"html.parser"),"https://company.example/careers")[:2]==expected

def test_tenant_hosts_share_ats_rate_limit_buckets():
    assert request_bucket("https://hp.wd5.myworkdayjobs.com/jobs")=="workday-listings"
    assert request_bucket("https://nvidia.wd1.myworkdayjobs.com/en-US/jobs/job/India/Engineer_R123")=="workday-details"
    assert request_bucket("https://boards-api.greenhouse.io/jobs")=="greenhouse.io"
    assert request_bucket("https://company.example/careers")=="company.example"

def test_malformed_embedded_urls_do_not_break_custom_source_indexing():
    soup=BeautifulSoup('<script>const x="http://[broken"</script>',"html.parser")
    assert discover_ats(soup,"https://company.example/careers") is None

def test_malformed_relative_urls_do_not_break_custom_source_indexing():
    soup=BeautifulSoup('<a href="//[broken">Broken</a>',"html.parser")
    assert discover_ats(soup,"https://company.example/careers") is None

def test_job_details_are_reused_without_skipping_live_listings(monkeypatch,tmp_path):
    import scraper.adapters as adapters
    class FakeClient:
        calls=0
        async def request(self,method,url,**kwargs):
            self.calls+=1
            return httpx.Response(200,text="fresh detail",request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,"CACHE_ROOT",tmp_path)
    client=FakeClient(); url="https://jobs.example/job/123"
    async def exercise():
        first=await cached_get(client,url)
        second=await cached_get(client,url)
        return first.text,second.text
    assert asyncio.run(exercise()) == ("fresh detail","fresh detail")
    assert client.calls == 1

def test_health_uses_request_failures_not_opening_counts():
    assert run_health_status(0) == "success"
    assert run_health_status(1) == "degraded"

def test_transient_source_failures_are_retried(monkeypatch):
    import httpx
    from scraper.adapters import ADAPTERS
    class FlakyAdapter:
        calls=0
        async def fetch_jobs(self,company):
            self.calls+=1
            if self.calls<3: raise httpx.ConnectTimeout("temporary")
            return [],0
    adapter=FlakyAdapter()
    async def no_wait(_): pass
    monkeypatch.setitem(ADAPTERS,"retry-test",adapter)
    monkeypatch.setattr("scraper.main.asyncio.sleep",no_wait)
    company=Company("Retry Test","https://example.com/jobs","retry-test","retry-test")
    assert asyncio.run(fetch_company_jobs(company)) == ([],0)
    assert adapter.calls == 3

def test_custom_sources_have_one_bounded_retry(monkeypatch):
    from scraper.adapters import ADAPTERS
    class BlockedAdapter:
        calls=0
        async def fetch_jobs(self,company):
            self.calls+=1
            raise httpx.ConnectTimeout("blocked")
    adapter=BlockedAdapter()
    monkeypatch.setitem(ADAPTERS,"custom",adapter)
    company=Company("Blocked","https://example.com/jobs","custom","blocked")
    try: asyncio.run(fetch_company_jobs(company))
    except httpx.ConnectTimeout: pass
    assert adapter.calls == 2

def test_company_registry_never_shrinks_or_duplicates_sources():
    import csv
    from pathlib import Path
    rows=list(csv.DictReader((Path(__file__).parents[1]/"companies"/"companies.csv").open(encoding="utf-8")))
    enabled=[row for row in rows if row.get("enabled","true").lower()=="true"]
    keys={(row["ats_provider"].lower(),row["ats_identifier"].lower()) for row in enabled}
    assert len(enabled)>=635
    assert len(keys)==len(enabled)

def test_ingest_chunks_preserve_every_job_below_request_batch_limit():
    jobs=[{"external_job_id":str(index)} for index in range(301)]
    batches=ingest_chunks(jobs,125)
    assert [len(batch) for batch in batches]==[125,125,51]
    assert [job for batch in batches for job in batch]==jobs

def test_source_sharding_is_stable_and_has_one_owner():
    company=Company("Example","https://example.com/jobs","greenhouse","example")
    assert source_shard(company,4)==source_shard(company,4)
    assert source_shard(company,4) in range(4)

def test_distributed_merge_requires_complete_unique_shards(tmp_path):
    artifacts=[]
    for index in range(2):
        artifact={"version":1,"shard_index":index,"shard_count":2,"started_at":"2026-09-17T00:00:00+00:00","finished_at":"2026-09-17T00:01:00+00:00","sources":1,"jobs_scanned":1,"raw_jobs":1,"failures":0,"companies":[{"name":f"C{index}","ats_provider":"custom","ats_identifier":f"c{index}"}],"jobs":[{"ats_provider":"custom","external_job_id":"same","title":f"T{index}"}]}
        path=tmp_path/f"shard-{index}.json"; path.write_text(json.dumps(artifact)); artifacts.append(path)
    merged=merge_artifacts(load_artifacts(artifacts),2)
    assert len(merged["companies"])==2 and len(merged["jobs"])==1
    with pytest.raises(ValueError): load_artifacts(artifacts[:1])

def test_expansion_covers_product_mnc_gcc_and_underrated_employers():
    import csv
    from pathlib import Path
    rows=list(csv.DictReader((Path(__file__).parents[1]/"companies"/"companies.csv").open(encoding="utf-8")))
    names={row["company_name"] for row in rows if row.get("enabled","true").lower()=="true"}
    cohorts={
        "product":{"Glean","Rippling","Atlan","Eightfold AI","ThoughtSpot"},
        "mnc":{"DocuSign","Teradata","Western Digital","CyberArk","Guidewire"},
        "gcc":{"Capital One","BNY","Fiserv","PepsiCo","Inspire Brands"},
        "underrated":{"Amagi","Uniphore","Perfios","Exotel","Jumbotail"},
        "expanded-product":{"HubSpot","JFrog","Redis","Neo4j","Yugabyte"},
        "expanded-gcc":{"Airwallex","Payoneer","Dynatrace","Splunk","Avalara"},
        "expanded-underrated":{"Cyware","CloudSEK","ColorTokens","Seclore","Observe.AI"},
    }
    for cohort in cohorts.values():
        assert cohort <= names
