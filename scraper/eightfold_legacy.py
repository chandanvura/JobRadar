"""Collect the public search used by older Eightfold career portals."""
import asyncio
import json
import re
from urllib.parse import parse_qs, urlencode, urlparse

from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged


def career_config(text, domain):
    code = BeautifulSoup(text, 'html.parser').find('code', id='smartApplyData')
    data = json.loads(code.get_text()) if code else {}
    if data.get('domain') != domain or data.get('excludePrivatePositions') is not True:
        raise ValueError('Legacy Eightfold public configuration does not match the employer')
    return data


def search_page(data, domain, count=None):
    rows = data.get('positions'); total = data.get('count')
    if (data.get('domain') != domain or not isinstance(rows, list)
            or not isinstance(total, int) or isinstance(total, bool) or not 0 <= total <= 2000
            or (data.get('query') or {}).get('location') != 'India'
            or count is not None and total != count):
        raise ValueError('Legacy Eightfold public search count or employer filter changed')
    ids = [str(row.get('id', '')) for row in rows]
    if len(set(ids)) != len(ids) or any(not key.isdigit() for key in ids):
        raise ValueError('Legacy Eightfold search repeated or omitted identifiers')
    if any(row.get('isPrivate') is not False for row in rows):
        raise ValueError('Legacy Eightfold search returned a private or unverified position')
    return rows, total


def posted_date(text, host, domain, identifier, title):
    for script in BeautifulSoup(text, 'html.parser').select('script[type="application/ld+json"]'):
        data = json.loads(script.get_text())
        records = data if isinstance(data, list) else data.get('@graph', [data])
        for record in records:
            if record.get('@type') != 'JobPosting':
                continue
            url = urlparse(record.get('url', '')); query = parse_qs(url.query)
            if (url.scheme != 'https' or url.hostname != host or query.get('domain') != [domain]
                    or query.get('pid') != [identifier] or record.get('title') != title):
                raise ValueError('Legacy Eightfold public posting does not match its listing')
            return record.get('datePosted')
    # A missing original posting date remains unknown.
    return None


class LegacyEightfoldCareerAdapter:
    def __init__(self, complete=False):
        self.complete=complete

    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, likely_target, location_text, make_job, request
        host, domain = company.ats_identifier.split('|', 1)
        parsed = urlparse(company.careers_url)
        if (parsed.scheme != 'https' or parsed.hostname != host or parsed.path != '/careers'
                or parse_qs(parsed.query).get('domain') != [domain] or not re.fullmatch(r'[\w.-]+', domain)):
            raise ValueError('Legacy Eightfold employer URL does not match its registered source')
        base = f'https://{host}'
        async with client(timeout=40) as x:
            response = await request(x, 'GET', company.careers_url)
            response.raise_for_status(); career_config(response.text, domain)
            async def search(offset):
                response = await request(x, 'GET', base + '/api/apply/v2/jobs',
                    params={'domain': domain, 'location': 'India', 'query': '', 'start': offset, 'num': 10})
                response.raise_for_status()
                return response.json()
            first, count = search_page(await search(0), domain)
            if len(first) != min(10, count):
                raise ValueError('Legacy Eightfold search returned an incomplete first page')
            semaphore = asyncio.Semaphore(4)
            async def next_page(offset):
                async with semaphore:
                    rows, total = search_page(await search(offset), domain, count)
                if len(rows) != min(10, total - offset):
                    raise ValueError('Legacy Eightfold search ended before its reported count')
                return rows
            pages = await asyncio.gather(*(next_page(offset) for offset in range(10, count, 10)))
            rows = first + [row for page in pages for row in page]
            if len({str(row['id']) for row in rows}) != count:
                raise ValueError('Legacy Eightfold pagination repeated positions or changed during collection')
            async def convert(row):
                location = location_text(row.get('location'), row.get('locations'))
                if not self.complete and not likely_target(row.get('name', ''), location):
                    return None
                identifier = str(row['id'])
                query = urlencode({'domain': domain, 'pid': identifier})
                url = base + '/careers?' + query
                async with semaphore:
                    detail = await cached_get(x, base + '/api/apply/v2/jobs/' + identifier + '?' + urlencode({'domain': domain}))
                    if detail.status_code in (404, 410):
                        if self.complete:raise SnapshotChanged('Legacy Eightfold listed detail disappeared')
                        return None
                    detail.raise_for_status(); job = detail.json()
                    if str(job.get('id')) != identifier or job.get('isPrivate') is not False:
                        raise ValueError('Legacy Eightfold public detail does not match its listing')
                    description = clean(job.get('job_description', ''))
                    if not description:
                        raise ValueError('Legacy Eightfold detail is missing its full description')
                    page = await cached_get(x, url); page.raise_for_status()
                    posting = posted_date(page.text, host, domain, identifier, job.get('name'))
                # t_create and t_update describe ingestion/updates, not original posting.
                return make_job(identifier if self.complete else str(job.get('ats_job_id') or identifier), job.get('name'), company.name,
                    location_text(job.get('location'), job.get('locations')), description,
                    'eightfold_legacy', 'company_career', url, url, company.careers_url, posting=posting)
            jobs = await asyncio.gather(*(convert(row) for row in rows))
            if self.complete:
                final, _ = search_page(await search(0), domain, count)
                if final != first:raise SnapshotChanged('Legacy Eightfold first page changed during details')
        return [job for job in jobs if job], count
