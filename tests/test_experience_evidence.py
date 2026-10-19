import json
from pathlib import Path
from datetime import datetime, timezone
import pytest
from scraper.experience import analyze_experience
from scraper.normalization import enrich
from scraper.models import Job

FIXTURES=json.loads((Path(__file__).parents[1]/'config/experience-fixtures.json').read_text())

@pytest.mark.parametrize('case',FIXTURES,ids=lambda case:case['name'])
def test_experience_evidence_shared_contract(case):
    result=analyze_experience(case['text'])
    assert (result['min'],result['max'],result['status'])==(case['min'],case['max'],case['status'])
    if 'preferred' in case:assert len(result['preferred'])==case['preferred']
    assert all(item['evidence'] and item['section'] for item in result['required']+result['preferred'])


@pytest.mark.parametrize('case',FIXTURES,ids=lambda case:case['name'])
def test_jd_experience_drives_full_time_shortlisting(case):
    job=Job('1','Java Developer','Example','Bengaluru',case['text'],'test','company_career','https://example.com/1','https://example.com/1','https://example.com',posted_at=datetime.now(timezone.utc).isoformat(),posted_precision='timestamp')
    result=enrich(job)
    lo,hi=case['min'],case['max']
    expected=case['status']=='stated' and lo is not None and lo>=0 and (lo<=2 if hi is None else lo<=hi<=3)
    assert result.is_eligible == expected
    assert (result.experience_min,result.experience_max)==(lo,hi)


def test_alternatives_and_conflicts_never_alert_even_for_junior_titles():
    for description in ['Experience: Minimum 4 years and maximum 2 years',"Qualifications: Bachelor's with 4 years experience or Master's with 2 years experience"]:
        job=Job('1','Junior Java Developer','Example','Bengaluru',description,'test','company_career','https://example.com/1','https://example.com/1','https://example.com')
        result=enrich(job)
        assert not result.is_eligible
        assert 'experience — verify' in result.eligibility_reason.lower()
