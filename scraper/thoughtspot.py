"""ThoughtSpot's current careers component publishes a complete Rippling array.

Evidence: /_next/static/chunks/42179.dd76c7957fb6f98e.js fetches
/api/getCareersListing once; its Load More button slices that array locally.
The legacy French Workday link is not the current English careers feed.
"""
import asyncio
import json
from urllib.parse import urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

OFFICIAL = 'https://www.thoughtspot.com/careers'
LISTING = 'https://www.thoughtspot.com/api/getCareersListing'


def listing_records(payload):
    rows = payload.get('data')
    if not isinstance(rows, list) or len(rows) > 1000:
        raise ValueError('ThoughtSpot listing is malformed or exceeds the bounded complete scan')
    found = {}
    for row in rows:
        identifier = row.get('id'); url = urlsplit(row.get('url', ''))
        if (not isinstance(identifier, str) or not identifier or identifier in found
                or not row.get('name') or not isinstance(row.get('locations'), list)
                or url.scheme != 'https' or url.hostname != 'ats.rippling.com'
                or url.path != f'/thoughtspot/jobs/{identifier}' or url.query or url.fragment
                or url.username or url.password):
            raise ValueError('ThoughtSpot listing has duplicate IDs, incomplete fields or an unrelated board')
        found[identifier] = row
    return found


def detail_record(text, row):
    soup = BeautifulSoup(text, 'html.parser')
    data = soup.select_one('script#__NEXT_DATA__')
    if data is None:
        raise ValueError('Rippling detail has no public server-rendered data')
    api = json.loads(data.string or data.get_text())['props']['pageProps']['apiData']
    board = api['jobBoard']; job = api['jobPost']
    if (board.get('companyName') != 'ThoughtSpot' or board.get('slug') != 'thoughtspot'
            or board.get('boardURL') != OFFICIAL or job.get('companyName') != 'ThoughtSpot'
            or job.get('uuid') != row['id'] or job.get('name') != row['name']
            or job.get('url') != row['url'] or job.get('unlistedFromSearch') is not False):
        raise ValueError('Rippling detail identity differs from the official current listing')
    locations = [v.get('name') for v in row['locations']]
    if job.get('workLocations') != locations:
        raise SnapshotChanged('ThoughtSpot location changed between listing and detail')
    description = job.get('description')
    if not isinstance(description, dict) or not description.get('role'):
        raise ValueError('Rippling detail omitted full role requirements')
    # createdOn is object creation, not a published posting date. No date is
    # inferred from it. This employer currently publishes jsonLd=null.
    return job


class ThoughtSpotCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import clean, client, location_text, make_job, request
        if company.careers_url != OFFICIAL or company.ats_identifier != LISTING or company.name != 'ThoughtSpot':
            raise ValueError('ThoughtSpot source differs from the verified current employer feed')
        async with client(timeout=40) as x:
            response = await request(x, 'GET', LISTING); response.raise_for_status()
            rows = listing_records(response.json())
            gate = asyncio.Semaphore(3)
            async def collect(row):
                async with gate:
                    response = await request(x, 'GET', row['url']); response.raise_for_status()
                    job = detail_record(response.text, row)
                    description = clean(' '.join(job['description'].get(k) or '' for k in ('company', 'role')))
                    return make_job(row['id'], row['name'], company.name,
                                    location_text([v.get('name') for v in row['locations']]),
                                    description, 'thoughtspot', 'company_career', row['url'], row['url'],
                                    OFFICIAL, posting=None)
            jobs = await asyncio.gather(*(collect(row) for row in rows.values()))
            response = await request(x, 'GET', LISTING); response.raise_for_status()
            check = listing_records(response.json())
            if check != rows:
                raise SnapshotChanged('ThoughtSpot official job set changed during the complete detail scan')
        return jobs, len(rows)
