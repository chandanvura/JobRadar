"""Read the public PCSX search used by current Eightfold career sites."""
import asyncio
import json
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged


def search_records(data, expected=None):
    """Reject malformed pages; changing snapshots restart without merging attempts."""
    if not isinstance(data, dict):
        raise ValueError('Eightfold public search returned an unexpected schema')
    batch = data.get('positions'); count = data.get('count')
    if not isinstance(batch, list) or type(count) is not int or not 0 <= count <= 2000:
        raise ValueError('Eightfold public search returned invalid totals or exceeded its bounded scan')
    if expected is not None and count != expected:
        raise SnapshotChanged('Eightfold advertised count changed during pagination')
    records = {}
    for position in batch:
        if not isinstance(position, dict):
            raise ValueError('Eightfold public search returned a malformed position')
        identifier = str(position.get('id') or '')
        if not identifier.isdigit() or identifier in records:
            raise ValueError('Eightfold public page repeated or omitted job identifiers')
        records[identifier] = position
    return count, records


def listing_signature(records):
    fields = ('id', 'atsJobId', 'name', 'locations', 'standardizedLocations', 'postedTs', 'isPrivate')
    return {key: {field: row.get(field) for field in fields} for key, row in records.items()}


class EightfoldCareerAdapter:
    def __init__(self, complete=False):
        self.complete = complete

    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, epoch_ms, likely_target, location_text, make_job, request
        host, domain = company.ats_identifier.split('|', 1)
        parsed = urlparse(company.careers_url)
        if parsed.scheme != 'https' or parsed.hostname != host or not re.fullmatch(r'[\w.-]+', domain):
            raise ValueError('Eightfold employer host does not match its registered source')
        base = f'https://{host}'
        async with client(timeout=40) as x:
            page = await request(x, 'GET', company.careers_url)
            page.raise_for_status()
            code = BeautifulSoup(page.text, 'html.parser').find('code', id='pcsx-data')
            if not code or json.loads(code.get_text()).get('domain') != domain:
                raise ValueError('Eightfold public career configuration does not match the employer')
            found = {}; offset = 0; total = None; first = None
            params = {'domain': domain, 'query': '', 'location': 'India', 'start': 0,
                      'sort_by': 'timestamp'}
            while True:
                params['start'] = offset
                response = await request(x, 'GET', base + '/api/pcsx/search', params=params)
                response.raise_for_status()
                count, records = search_records(response.json().get('data'), total)
                total = count
                if first is None: first = listing_signature(records)
                if found.keys() & records.keys():
                    raise SnapshotChanged('Eightfold public pagination repeated a job across pages')
                if not records and offset < total:
                    raise ValueError('Eightfold public search ended before its reported count')
                if offset + len(records) > total:
                    raise ValueError('Eightfold public search exceeded its reported count')
                found.update(records); offset += len(records)
                if offset == total: break
            semaphore = asyncio.Semaphore(6)
            async def convert(item):
                if self.complete and item.get('isPrivate'):
                    raise ValueError('Eightfold public complete listing contains a private job')
                if item.get('isPrivate') or (not self.complete and not likely_target(item.get('name', ''), location_text(item.get('locations'), item.get('standardizedLocations')))):
                    return None
                identifier = str(item['id'])
                if not identifier.isdigit(): raise ValueError('Invalid Eightfold public position identifier')
                from urllib.parse import urlencode
                detail_url = base + '/api/pcsx/position_details?' + urlencode({'domain': domain, 'position_id': identifier, 'hl': 'en'})
                async with semaphore:
                    response = await request(x, 'GET', detail_url) if self.complete else await cached_get(x, detail_url)
                if response.status_code in (404, 410):
                    raise SnapshotChanged('Eightfold listed detail disappeared during collection')
                response.raise_for_status(); job = response.json().get('data', {})
                if str(job.get('id')) != identifier or job.get('isPrivate'):
                    raise ValueError('Eightfold public detail does not match its listing')
                description = clean(job.get('jobDescription', ''))
                if not description: raise ValueError('Eightfold public detail is missing the full description')
                # postedTs is corroborated against public JobPosting.datePosted;
                # creationTs and collection time never establish freshness.
                timestamp = job.get('externallyPostedTs') or job.get('postedTs')
                posting = epoch_ms(float(timestamp) * 1000) if timestamp else None
                url = base + '/careers/job/' + identifier + '?' + urlencode({'domain': domain})
                return make_job(str(job.get('atsJobId') or identifier), job.get('name') or item['name'], company.name,
                                location_text(job.get('locations'), job.get('standardizedLocations'), job.get('location')), description,
                                'eightfold', 'company_career', url, url, company.careers_url, posting=posting)
            jobs = await asyncio.gather(*(convert(item) for item in found.values()))
            if self.complete and (len(jobs) != total or any(job is None for job in jobs) or
                                  len({job.external_job_id for job in jobs}) != total):
                raise ValueError('Eightfold complete details did not reconcile to unique public IDs')
            params['start'] = 0
            response = await request(x, 'GET', base + '/api/pcsx/search', params=params)
            response.raise_for_status()
            _, check = search_records(response.json().get('data'), total)
            if listing_signature(check) != first:
                raise SnapshotChanged('Eightfold first public page changed during detail collection')
        return [job for job in jobs if job], len(found)
