import asyncio
import json
import httpx
import pytest
from scraper import adapters
from scraper.adidas import AdidasCareerAdapter, FEED, feed_records, listing_records
from scraper.models import Company
from scraper.snapshot import SnapshotChanged


def feed(ids):
    rows = ''.join(f'''<job><title>Software Engineer {i}</title><referencenumber>{i}</referencenumber>
      <url>https://jobs.adidas-group.com/job/Role/{i}/</url><company>adidas</company>
      <city>Bengaluru</city><state>Karnataka</state><country>India</country>
      <description>Java developer; 0 to 2 years experience.</description></job>''' for i in ids)
    return '<source><publisher>adidas Group careers</publisher>' + rows + '</source>'


@pytest.mark.parametrize('change', ['duplicate', 'employer', 'host', 'description'])
def test_xml_rejects_wrong_identity_and_incomplete_or_duplicate_records(change):
    xml = feed([1, 1] if change == 'duplicate' else [1])
    if change == 'employer': xml = xml.replace('<company>adidas', '<company>Unrelated')
    if change == 'host': xml = xml.replace('jobs.adidas-group.com', 'unrelated.test')
    if change == 'description': xml = xml.replace('Java developer; 0 to 2 years experience.', '')
    with pytest.raises(ValueError): feed_records(xml)


def test_real_employer_date_is_day_precision_and_missing_date_unknown():
    assert feed_records(feed([1]))['1']['posting'] is None
    xml = feed([1]).replace('</job>', '<date>Tue, Oct 6, 2026 12:00 AM</date></job>')
    assert feed_records(xml)['1']['posting'] == '2026-10-06'


@pytest.mark.parametrize('payload', [{'count': 21, 'jobs': []}, {'count': 2001, 'jobs': []}, {'count': True, 'jobs': []}])
def test_live_page_cannot_pass_as_truncated_or_unbounded(payload):
    with pytest.raises(ValueError): listing_records(payload, 0)


@pytest.mark.parametrize('failure', [None, 'changed', 'duplicate', 'different_feed', 'final_reorder'])
def test_reconcile_all_live_pages_and_details_with_xml(monkeypatch, failure):
    offsets = []
    async def request(client, method, url, **kwargs):
        if url == 'https://careers.adidas-group.com/':
            text = f'<a href="{FEED}">Official feed</a>'
            return httpx.Response(200, text=text, request=httpx.Request(method, url))
        if url == FEED:
            xml = feed(range(1, 22))
            if failure == 'different_feed': xml = xml.replace('<referencenumber>21', '<referencenumber>999')
            return httpx.Response(200, text=xml, request=httpx.Request(method, url))
        offset = kwargs['params']['offset']; offsets.append(offset)
        assert kwargs['params']['sort'] == 'title'
        ids = list(range(offset + 1, min(offset + 21, 22)))
        if failure == 'duplicate' and offset: ids = [1]
        if failure == 'final_reorder' and len(offsets) == 3: ids.reverse()
        total = 22 if failure == 'changed' and offset else 21
        jobs = [{'requisitionid': str(i), 'external_title': f'Software Engineer {i}',
                 'external_url': f'https://jobs.adidas-group.com/job/Role/{i}/'} for i in ids]
        return httpx.Response(200, json={'count': total, 'jobs': jobs}, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, 'request', request)
    company = Company('Adidas', 'https://careers.adidas-group.com/', 'adidas', FEED)
    if failure:
        with pytest.raises((ValueError, SnapshotChanged)):
            asyncio.run(AdidasCareerAdapter().fetch_jobs(company))
    else:
        jobs, count = asyncio.run(AdidasCareerAdapter().fetch_jobs(company))
        assert count == 21 and len(jobs) == 21 and offsets == [0, 20, 0]
        assert all('Bengaluru' in job.location and job.posted_at is None for job in jobs)
        assert all('Java developer' in job.description for job in jobs)
