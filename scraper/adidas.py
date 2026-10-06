"""Employer-published adidas XML reconciled against every live UI result page."""
from datetime import datetime
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from defusedxml import ElementTree as ET
from .snapshot import SnapshotChanged

ORIGIN = 'https://careers.adidas-group.com'
FEED = ORIGIN + '/jobs/feed.xml'


def feed_records(content):
    root = ET.fromstring(content)
    if root.tag != 'source' or root.findtext('publisher') != 'adidas Group careers':
        raise ValueError('adidas XML publisher identity is missing')
    records = {}
    for item in root.findall('job'):
        row = {node.tag: node.text or '' for node in item}
        identifier = row.get('referencenumber', '')
        parsed = urlsplit(row.get('url', ''))
        official_job = parsed.hostname == 'jobs.adidas-group.com' or (
            parsed.hostname == 'olivia.eu1.paradox.ai' and parsed.path == '/co/Adidas/Job')
        if (not identifier.isdigit() or identifier in records or row.get('company') != 'adidas'
                or parsed.scheme != 'https' or not official_job or parsed.username or parsed.password
                or not row.get('title') or not row.get('description')):
            raise ValueError('adidas XML has duplicate, malformed, wrong-employer or incomplete records')
        # The employer publishes a calendar date without a timezone. Preserve
        # day precision; never turn this into an invented UTC posting instant.
        date = row.get('date')
        row['posting'] = datetime.strptime(date, '%a, %b %d, %Y %I:%M %p').date().isoformat() if date else None
        records[identifier] = row
    return records


def listing_records(payload, offset, expected=None):
    total = payload.get('count'); rows = payload.get('jobs')
    if type(total) is not int or not 0 <= total <= 2000 or not isinstance(rows, list):
        raise ValueError('adidas live listing is malformed or exceeds its bounded scan')
    if expected is not None and total != expected:
        raise SnapshotChanged('adidas live listing total changed')
    if len(rows) != min(20, max(0, total - offset)):
        raise ValueError('adidas live listing omitted or truncated a result page')
    identifiers = [r.get('requisitionid') for r in rows]
    if any(not isinstance(i, str) or not i.isdigit() for i in identifiers) or len(set(identifiers)) != len(rows):
        raise ValueError('adidas live listing has missing or repeated job identifiers')
    return total, dict(zip(identifiers, rows))


class AdidasCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import clean, client, location_text, make_job, request
        if company.ats_identifier != FEED or urlsplit(company.careers_url).hostname != 'careers.adidas-group.com':
            raise ValueError('adidas source differs from its verified official board')
        async with client(timeout=45) as x:
            page = await request(x, 'GET', company.careers_url); page.raise_for_status()
            soup = BeautifulSoup(page.text, 'html.parser')
            if FEED not in {urljoin(str(page.url), tag['href']) for tag in soup.select('[href]')}:
                raise ValueError('adidas official page no longer publishes the registered XML feed')
            response = await request(x, 'GET', FEED); response.raise_for_status()
            records = feed_records(response.content)
            # "title" is a published sort option. The default date order
            # overlaps pages among same-day postings; keep duplicate rejection.
            params = dict(brand='', team='', type='', keywords='', location='[]', sort='title', locale='en', offset=0)
            headers = {'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest'}
            found = {}; expected = None; first_ids = None
            for offset in range(0, 2000, 20):
                params['offset'] = offset
                response = await request(x, 'GET', ORIGIN + '/jobs', params=params, headers=headers)
                response.raise_for_status()
                total, rows = listing_records(response.json(), offset, expected)
                expected = total
                if found.keys() & rows.keys():
                    raise ValueError('adidas pagination repeated job identifiers')
                if first_ids is None: first_ids = list(rows)
                for identifier, row in rows.items():
                    record = records.get(identifier)
                    if not record or row.get('external_url') != record['url'] or row.get('external_title') != record['title']:
                        raise SnapshotChanged('adidas XML does not match the current live job listing')
                found.update(rows)
                if len(found) == expected: break
            if len(found) != expected or found.keys() != records.keys():
                raise SnapshotChanged('adidas XML and paginated live listing have different job sets')
            params['offset'] = 0
            check = await request(x, 'GET', ORIGIN + '/jobs', params=params, headers=headers); check.raise_for_status()
            total, first = listing_records(check.json(), 0, expected)
            if list(first) != first_ids:
                raise SnapshotChanged('adidas first page changed during collection')
            jobs = [make_job(identifier, row['title'], company.name,
                             location_text(row.get('city'), row.get('state'), row.get('country')),
                             clean(row['description']), 'adidas', 'company_career', row['url'], row['url'],
                             company.careers_url, posting=row['posting']) for identifier, row in records.items()]
        return jobs, len(records)
