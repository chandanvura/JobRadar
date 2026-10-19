from datetime import datetime, timezone
import pytest
from scraper.adapters import likely_target
from scraper.models import Job
from scraper.normalization import enrich, normalize_location


@pytest.mark.parametrize('location', ['Remote - India', 'India (Remote)', 'Remote, India', 'India / Remote'])
def test_explicit_india_remote_location_reaches_details_and_eligibility(location):
    assert likely_target('Java Backend Engineer', location)
    assert normalize_location(location)==('Remote (India)', 'Remote (India)')
    job=Job('remote-1','Java Backend Engineer','Example',location,'Required experience: 1-2 years. Java and AWS.',
            'greenhouse','company_career','https://example.test/job','https://example.test/job',
            'https://example.test/careers',posted_at=datetime.now(timezone.utc).isoformat())
    assert enrich(job).is_eligible
    job.description='Required experience: 5 years.'
    assert not enrich(job).is_eligible
    job.description='Required experience: 1-2 years.'
    job.posted_at=None
    assert not enrich(job).is_eligible


@pytest.mark.parametrize('location', ['Remote', 'Remote - USA', 'Remote - Asia', 'India', 'Indiana (Remote)', 'Remote - USA; India (Onsite)'])
def test_remote_without_explicit_india_permission_is_not_inferred(location):
    assert not likely_target('Java Engineer',location)
    assert normalize_location(location)[1] is None


def test_existing_city_preference_and_role_filter_are_preserved():
    assert normalize_location('Bengaluru, India (Remote)')[1]=='Bengaluru'
    assert not likely_target('Account Executive', 'Remote - India')
