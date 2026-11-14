import asyncio
from datetime import datetime, timezone
import json
from pathlib import Path
import httpx
import pytest
from scraper import adapters
from scraper.models import Company, Job
from scraper.normalization import classify_title, enrich

TAXONOMY=json.loads((Path(__file__).parents[1]/'config/roles.json').read_text())

@pytest.mark.parametrize('title', ['Salesforce Effectiveness Analyst with Japanese Language', 'Risk Analytics Consultant', 'Senior Analyst - MES PAS X'])
def test_analytics_tools_do_not_prove_software_engineering(title):
    description='Required Qualifications: Experience using SQL and Python for analytics.'
    assert classify_title(title, description)[1]=='Data / Business Analysis'

@pytest.mark.parametrize('title,family',[(title,role['family']) for role in TAXONOMY['roles'] for title in role['titles']])
def test_published_role_vocabulary_is_collected_and_classified(title,family):
    assert adapters.likely_role(title)
    assert classify_title(title)[1]==family

@pytest.mark.parametrize('title', ['Civil Engineer','Mechanical Engineer','Marketing Analyst','Talent Acquisition Intern'])
def test_unrelated_titles_are_not_reclassified_from_company_biography(title):
    assert classify_title(title,'Our business uses Java, SQL and Python software development')[1]=='Other'


def make_job(title,description):
    return Job('req',title,'HPE','Bengaluru',description,'workday','company_career','https://example.com/job','https://example.com/apply','https://example.com/jobs',datetime.now(timezone.utc).isoformat())


def test_reported_hpe_title_and_technical_staff_survive_eligibility():
    for title in ['Cloud Developer','Cloud Developer Platform','Member of Technical Staff I']:
        job=enrich(make_job(title,'Typically 0–2 years of software development experience. Python and Linux.'))
        assert job.role_category!='Other' and job.is_eligible
    assert enrich(make_job('Principal Member of Technical Staff','0–2 years experience')).eligibility_reason=='Leadership-level title'


def test_ambiguous_employer_titles_need_multiple_real_technical_signals():
    assert classify_title('Associate','Analyze financial statements')[1]=='Other'
    assert classify_title('Associate','Develop software with Java and SQL')[1]=='Software Engineering'
    assert classify_title('Engineer II','Build software using Python and Kubernetes')[1]=='Software Engineering'


def test_workday_uses_published_city_ids_and_reads_secondary_locations(monkeypatch):
    requests=[]
    async def request(client,method,url,**kwargs):
        body=kwargs['json'];requests.append(body)
        if not body['appliedFacets']:
            result={'total':20000,'jobPostings':[], 'facets':[{'facetParameter':'locations','values':[{'id':'bgl','descriptor':'Bangalore, India'},{'id':'hyd','descriptor':'Hyderabad, India'},{'id':'ny','descriptor':'New York'}]}]}
        else:
            result={'total':1,'jobPostings':[{'title':'Cloud Developer','externalPath':'/job/X/R1','locationsText':'2 Locations'}]}
        return httpx.Response(200,request=httpx.Request(method,url),json=result)
    async def detail(client,url):
        return httpx.Response(200,request=httpx.Request('GET',url),json={'jobPostingInfo':{'title':'Cloud Developer','jobReqId':'R1','jobDescription':'0–2 years with Python','location':'London','additionalLocations':['Bengaluru']}})
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'fetch_detail',detail)
    company=Company('HPE','https://hpe.wd5.myworkdayjobs.com/Jobsathpe','workday','hpe|Jobsathpe')
    jobs,total=asyncio.run(adapters.WorkdayAdapter().fetch_jobs(company))
    assert total==len(jobs)==1 and jobs[0].title=='Cloud Developer' and 'Bengaluru' in jobs[0].location
    assert requests[1]['appliedFacets']=={'locations':['bgl','hyd']}


def test_workday_short_or_capped_listing_is_not_reported_complete(monkeypatch):
    async def request(client,method,url,**kwargs):
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':1500,'jobPostings':[{'title':'Sales','externalPath':'/job/X/R1','locationsText':'London'}]})
    monkeypatch.setattr(adapters,'request',request)
    company=Company('Example','https://example.wd1.myworkdayjobs.com/Jobs','workday','example|Jobs')
    jobs,total=asyncio.run(adapters.WorkdayAdapter().fetch_jobs(company))
    assert total==1 and 'Limited coverage' in jobs.coverage_warning


@pytest.mark.parametrize("title", TAXONOMY["review_titles"])
def test_generic_added_titles_need_technical_requirements(title):
    assert adapters.likely_role(title)
    assert classify_title(title, "General business operations")[1] == "Other"
    assert classify_title(title, "Develop software using Java and SQL")[1] == "Software Engineering"


def test_workday_skips_only_definitely_old_details_and_keeps_unknown_dates(monkeypatch):
    ages=['Posted Today','Posted Yesterday','Posted 1 Day Ago','Posted 2 Days Ago','Posted 30+ Days Ago',None]
    requested=[]
    async def request(client,method,url,**kwargs):
        rows=[{'title':'Cloud Developer','externalPath':f'/job/India/R{i}','locationsText':'Bengaluru','postedOn':age} for i,age in enumerate(ages)]
        return httpx.Response(200,request=httpx.Request(method,url),json={'total':len(rows),'jobPostings':rows})
    async def detail(client,url):
        requested.append(url.rsplit('/',1)[-1])
        return httpx.Response(200,request=httpx.Request('GET',url),json={'jobPostingInfo':{'title':'Cloud Developer','jobReqId':url.rsplit('/',1)[-1],'jobDescription':'0-2 years Java','location':'Bengaluru'}})
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'fetch_detail',detail)
    company=Company('Example','https://example.wd1.myworkdayjobs.com/Jobs','workday','example|Jobs')
    jobs,total=asyncio.run(adapters.WorkdayAdapter().fetch_jobs(company))
    assert total==6
    assert {job.external_job_id for job in jobs}=={'R0','R1','R2','R5'}
    assert set(requested)=={'R0','R1','R2','R5'}


@pytest.mark.parametrize('title', ['Spring Boot Developer', 'CI/CD Engineer', 'AWS Engineer', 'SRE Engineer', 'Infra Engineer', 'Developer Productivity Engineer', 'Design Engineer', 'Product Engineer', 'Solutions Engineer', 'AppSec Engineer', 'Prompt Engineer'])
def test_expanded_titles_never_substitute_for_experience_date_or_location_proof(title):
    assert enrich(make_job(title, 'Required experience: 0-2 years. Java and Linux.')).is_eligible
    assert not enrich(make_job(title, 'Required experience: 5-7 years. Java and Linux.')).is_eligible
    assert not enrich(make_job(title, 'Build reliable systems with Java and Linux.')).is_eligible
    old=make_job(title, 'Required experience: 0-2 years. Java and Linux.')
    old.posted_at=None
    assert not enrich(old).is_eligible
    foreign=make_job(title, 'Required experience: 0-2 years. Java and Linux.')
    foreign.location='Remote - USA'
    assert not enrich(foreign).is_eligible


def test_solutions_architect_classified_in_cloud_but_leadership_excluded():
    job = enrich(make_job('Solutions Architect', 'Required experience: 0-2 years. AWS and distributed systems.'))
    assert job.role_category == 'Cloud'
    assert not job.is_eligible
    assert job.eligibility_reason == 'Leadership-level title'


def test_level_one_sre_defaults_to_entry_level_when_experience_unstated():
    job = enrich(make_job('SRE I', 'Build reliable systems with Java and Linux.'))
    assert job.is_eligible
    assert job.experience_min == 0.0 and job.experience_max == 2.0
    assert job.experience_label == "Entry-level title"


def test_cross_domain_design_and_product_engineering_guards():
    assert classify_title("Design Engineer", "Responsible for manufacturing quality and mechanical parts assembly.")[1] == "Other"
    assert classify_title("Design Engineer", "Responsible for ASIC synthesis, verilog RTL design and silicon timing analysis.")[1] == "Embedded / Hardware"
    assert classify_title("Product Engineer", "Retail store merchandising and physical product inspection in factory.")[1] == "Other"
    assert classify_title("Product Engineer", "Full-stack software engineering using Python, React, and REST APIs.")[1] == "Software Engineering"
    assert classify_title("Civil Design Engineer")[1] == "Other"
    assert classify_title("Mechanical Design Engineer")[1] == "Other"


def test_workday_minified_facet_parameters_parse_country_and_cities(monkeypatch):
    requests = []
    async def request(client, method, url, **kwargs):
        body = kwargs['json']; requests.append(body)
        if not body['appliedFacets']:
            result = {
                'total': 500,
                'jobPostings': [],
                'facets': [
                    {'facetParameter': 'a', 'values': [{'id': 'ind_id', 'descriptor': 'India'}, {'id': 'us_id', 'descriptor': 'United States'}]},
                    {'facetParameter': 'b', 'values': [{'id': 'blr_id', 'descriptor': 'Bangalore'}, {'id': 'lon_id', 'descriptor': 'London'}]}
                ]
            }
        else:
            result = {'total': 1, 'jobPostings': [{'title': 'Design Engineer', 'externalPath': '/job/India/R1', 'locationsText': 'Bangalore'}]}
        return httpx.Response(200, request=httpx.Request(method, url), json=result)
    async def detail(client, url):
        return httpx.Response(200, request=httpx.Request('GET', url), json={'jobPostingInfo': {'title': 'Design Engineer', 'jobReqId': 'R1', 'jobDescription': '0-2 years with Verilog', 'location': 'Bangalore'}})
    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'fetch_detail', detail)
    company = Company('RedHatTest', 'https://example.wd5.myworkdayjobs.com/Jobs', 'workday', 'redhat|Jobs')
    jobs, total = asyncio.run(adapters.WorkdayAdapter().fetch_jobs(company))
    assert total == len(jobs) == 1 and jobs[0].title == 'Design Engineer'
    assert requests[1]['appliedFacets'] == {'a': ['ind_id']}
