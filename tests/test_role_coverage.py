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
    monkeypatch.setattr(adapters,'request',request);monkeypatch.setattr(adapters,'cached_get',detail)
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
