import json
from pathlib import Path
from datetime import datetime, timezone
import pytest
from scraper.experience import analyze_experience
from scraper.normalization import enrich
from scraper.models import Job

FIXTURES=json.loads((Path(__file__).parents[1]/'config/experience-fixtures.json').read_text(encoding='utf-8'))

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
    expected=case['status']=='stated' and lo is not None and lo>=0 and (lo<=3 and (hi is None or lo<=hi))
    assert result.is_eligible == expected
    assert (result.experience_min,result.experience_max)==(lo,hi)


def test_alternatives_and_conflicts_never_alert_even_for_junior_titles():
    for description in ['Experience: Minimum 4 years and maximum 2 years',"Qualifications: Bachelor's with 4 years experience or Master's with 2 years experience"]:
        job=Job('1','Junior Java Developer','Example','Bengaluru',description,'test','company_career','https://example.com/1','https://example.com/1','https://example.com')
        result=enrich(job)
        assert not result.is_eligible
        assert 'experience — verify' in result.eligibility_reason.lower()

@pytest.mark.parametrize('minimum', [0, 1, 1.5, 2, 3])
@pytest.mark.parametrize('maximum', [5, 10, None])
def test_minimum_based_policy_accepts_any_valid_upper_bound(minimum, maximum):
    from scraper.experience import experience_within_policy
    assert experience_within_policy(minimum, maximum)


@pytest.mark.parametrize('minimum,maximum', [(None,None),(-1,3),(3,2),(3.5,5),(4,None)])
def test_minimum_based_policy_rejects_missing_invalid_or_high_minimum(minimum, maximum):
    from scraper.experience import experience_within_policy
    assert not experience_within_policy(minimum, maximum)
