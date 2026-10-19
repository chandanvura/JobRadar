from datetime import datetime, timezone
import pytest
from scraper.models import Job
from scraper.posting import posting_current
from scraper.normalization import enrich

NOW = datetime(2026,10,19,10,tzinfo=timezone.utc)
def job(**kwargs):
    return Job(external_job_id='1',title='Java Developer',company='Acme',location='Bengaluru',description='Requirements: 0-2 years experience',ats_provider='test',source='test',job_url='https://test.example/jobs/1',application_url='https://test.example/jobs/1',career_page_url='https://test.example',last_seen_at='2026-10-19T09:00:00Z',**kwargs)

@pytest.mark.parametrize('patch',[
    dict(posted_at='2026-10-19T11:00:00Z'),
    dict(posted_at='bad',posted_label='Posted today',posted_precision='day'),
    dict(reported_age_hours=-1),dict(reported_age_hours=float('inf')),dict(reported_age_hours=float('nan')),
    dict(posted_label='not posted today',posted_precision='day'),dict(posted_label='Posted today',posted_precision='unknown'),
])
def test_invalid_proof_cannot_certify_freshness(patch):
    assert not posting_current(job(**patch),NOW)

def test_relative_evidence_ages_and_day_proof_expires_at_india_midnight():
    relative=job(reported_age_hours=2);relative.last_seen_at='2026-10-18T12:00:00Z'
    assert posting_current(relative,NOW)
    assert not posting_current(relative,datetime(2026,10,19,10,0,1,tzinfo=timezone.utc))
    dated=job(posted_at='2026-10-18T00:00:00Z',posted_precision='day')
    assert posting_current(dated,datetime(2026,10,18,18,29,59,tzinfo=timezone.utc))
    assert not posting_current(dated,datetime(2026,10,18,18,30,tzinfo=timezone.utc))

def test_collector_does_not_alert_on_future_timestamp():
    result=enrich(job(posted_at='2099-01-01T00:00:00Z',posted_precision='exact'))
    assert not result.is_eligible
    assert result.eligibility_reason=='Posting date not verified within 24 hours'
