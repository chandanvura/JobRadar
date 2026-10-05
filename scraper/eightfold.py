"""Read the public PCSX search used by current Eightfold career sites."""
import asyncio
import json
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup


class EightfoldCareerAdapter:
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
            found = {}; offset = 0
            while offset < 2000:
                response = await request(x, 'GET', base + '/api/pcsx/search',
                                         params={'domain': domain, 'query': '', 'location': 'India', 'start': offset,
                                                 'sort_by': 'timestamp'})
                response.raise_for_status()
                data = response.json().get('data', {})
                batch = data.get('positions'); count = data.get('count')
                if not isinstance(batch, list) or not isinstance(count, int) or count < 0:
                    raise ValueError('Eightfold public search returned an unexpected schema')
                if not batch:
                    if offset < count: raise ValueError('Eightfold public search ended before its reported count')
                    break
                if any(not p.get('id') or str(p['id']) in found for p in batch):
                    raise ValueError('Eightfold public pagination repeated or omitted job identifiers')
                for position in batch: found[str(position['id'])] = position
                offset += len(batch)
                if offset >= count: break
            else:
                raise ValueError('Eightfold India search exceeded the bounded scan')
            semaphore = asyncio.Semaphore(6)
            async def convert(item):
                if item.get('isPrivate') or not likely_target(item.get('name', ''), location_text(item.get('locations'), item.get('standardizedLocations'))):
                    return None
                identifier = str(item['id'])
                if not identifier.isdigit(): raise ValueError('Invalid Eightfold public position identifier')
                from urllib.parse import urlencode
                detail_url = base + '/api/pcsx/position_details?' + urlencode({'domain': domain, 'position_id': identifier, 'hl': 'en'})
                async with semaphore: response = await cached_get(x, detail_url)
                if response.status_code in (404, 410): return None
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
        return [job for job in jobs if job], len(found)
