"""Read structured public career widgets without executing employer JavaScript."""
import asyncio
import json
import re
from urllib.parse import urlparse, urlencode
from bs4 import BeautifulSoup


def astro_decode(value):
    """Decode Astro's JSON serialization for plain records and arrays only."""
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError('Unexpected Astro career data serialization')
    kind, data = value
    if kind == 0:
        return {key: astro_decode(item) for key, item in data.items()} if isinstance(data, dict) else data
    if kind == 1 and isinstance(data, list):
        return [astro_decode(item) for item in data]
    raise ValueError('Unsupported Astro career data type')


def juspay_records(text):
    for island in BeautifulSoup(text, 'html.parser').select('astro-island[props]'):
        props = json.loads(island['props'])
        if 'jobData' in props:
            records = astro_decode(props['jobData'])
            if not isinstance(records, list) or len(records) > 2000:
                raise ValueError('Juspay career list is malformed or unbounded')
            return records
    raise ValueError('Juspay page is missing its published job list')


def flight_records(text):
    """Decode JSON and length-delimited UTF-8 text from public React Flight data."""
    parts = []
    decoder = json.JSONDecoder()
    for script in BeautifulSoup(text, 'html.parser').find_all('script'):
        raw = script.string or ''
        for match in re.finditer(r'self\.__next_f\.push\(', raw):
            value, _ = decoder.raw_decode(raw[match.end():].lstrip())
            if isinstance(value, list) and len(value) == 2 and value[0] == 1 and isinstance(value[1], str):
                parts.append(value[1])
    if not parts:
        raise ValueError('Career page is missing its public serialized data')
    wire = ''.join(parts).encode('utf-8'); offset = 0; records = {}
    while offset < len(wire):
        match = re.match(rb'([0-9a-f]*):', wire[offset:])
        if not match:
            raise ValueError('Malformed public career data boundary')
        key = match.group(1).decode(); offset += match.end()
        if wire[offset:offset+1] == b'T':
            size = re.match(rb'T([0-9a-f]+),', wire[offset:])
            if not size: raise ValueError('Malformed public career text record')
            start = offset + size.end(); end = start + int(size.group(1), 16)
            if end > len(wire): raise ValueError('Truncated public career text record')
            records[key] = wire[start:end].decode('utf-8'); offset = end
        else:
            end = wire.find(b'\n', offset)
            if end < 0: end = len(wire)
            row = wire[offset:end].decode('utf-8')
            if row.startswith(('[', '{', '"')):
                records[key] = json.loads(row)
            offset = end + 1
    return records


def walk(value):
    if isinstance(value, dict):
        yield value
        for item in value.values(): yield from walk(item)
    elif isinstance(value, list):
        for item in value: yield from walk(item)


def kula_records(text):
    records = flight_records(text)
    groups = [node['jobs'] for value in records.values() for node in walk(value)
              if isinstance(node.get('jobs'), list) and
              (not node['jobs'] or all(isinstance(j, dict) and 'ats_job' in j for j in node['jobs']))]
    if len(groups) != 1 or len(groups[0]) > 2000:
        raise ValueError('Kula public career list is missing, ambiguous or unbounded')
    return groups[0], records


class JuspayCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, clean, make_job, request
        if urlparse(company.careers_url).hostname != 'juspay.io' or company.ats_identifier != 'juspay':
            raise ValueError('Juspay career configuration does not match the employer')
        async with client(timeout=30) as x:
            response = await request(x, 'GET', company.careers_url); response.raise_for_status()
        records = juspay_records(response.text); jobs = []; seen = set()
        for item in records:
            if item.get('opening_status') is not True: continue
            identifier = item.get('job_id'); title = item.get('job_title')
            description = clean(item.get('job_description_career') or item.get('job_description_template'))
            if not isinstance(identifier, str) or not re.fullmatch(r'[\w-]+', identifier) or identifier in seen or not title or not description:
                raise ValueError('Juspay public job is incomplete or repeated')
            seen.add(identifier); url = 'https://juspay.io/careers/' + identifier
            # This page publishes no posting date. Approval/fetch dates cannot substitute.
            jobs.append(make_job(identifier, title, company.name, item.get('job_location', ''), description,
                                 'juspay', 'company_career', url, url, company.careers_url))
        return jobs, len(jobs)


class KulaCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, clean, location_text, make_job, request
        parsed = urlparse(company.careers_url)
        if parsed.hostname != 'careers.kula.ai' or parsed.path.rstrip('/') != '/' + company.ats_identifier or not re.fullmatch(r'[\w-]+', company.ats_identifier):
            raise ValueError('Kula employer board does not match its registered source')
        async with client(timeout=35) as x:
            response = await request(x, 'GET', company.careers_url); response.raise_for_status()
        records, refs = kula_records(response.text); jobs = []; seen = set()
        for item in records:
            if item.get('listed') is not True or item.get('is_confidential') or item.get('kind') not in ('external', 'internal_and_external'):
                continue
            identifier = str(item.get('id') or '')
            detail = item.get('ats_job') or {}; description = detail.get('job_description')
            if isinstance(description, str) and re.fullmatch(r'\$[0-9a-f]+', description):
                description = refs.get(description[1:])
            description = clean(description)
            if not identifier.isdigit() or identifier in seen or not item.get('title') or not description:
                raise ValueError('Kula public job is incomplete or repeated')
            seen.add(identifier); url = 'https://careers.kula.ai/' + company.ats_identifier + '/' + identifier
            jobs.append(make_job(identifier, item['title'], company.name, location_text(detail.get('offices')), description,
                                 'kula', 'company_career', url, url, company.careers_url, posting=item.get('launch_at')))
        return jobs, len(jobs)


class BambooCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, clean, cached_get, likely_target, location_text, make_job, request
        if not re.fullmatch(r'[\w-]+', company.ats_identifier): raise ValueError('Invalid BambooHR employer identifier')
        host = company.ats_identifier + '.bamboohr.com'; base = 'https://' + host
        if urlparse(company.careers_url).hostname != host: raise ValueError('BambooHR employer host does not match its registered source')
        async with client(timeout=35) as x:
            response = await request(x, 'GET', base + '/careers/list'); response.raise_for_status()
            data = response.json(); records = data.get('result'); total = data.get('meta', {}).get('totalCount')
            if not isinstance(records, list) or not isinstance(total, int) or total != len(records) or total > 2000:
                raise ValueError('BambooHR public list is incomplete or malformed')
            identifiers = [str(item.get('id') or '') for item in records]
            if any(not i.isdigit() for i in identifiers) or len(set(identifiers)) != len(identifiers):
                raise ValueError('BambooHR public identifiers are missing or repeated')
            semaphore = asyncio.Semaphore(5)
            async def convert(item):
                location = location_text(item.get('location'), item.get('atsLocation'))
                if not likely_target(item.get('jobOpeningName', ''), location): return None
                identifier = str(item['id']); url = base + '/careers/' + identifier
                async with semaphore: response = await cached_get(x, url + '/detail')
                if response.status_code in (404, 410): return None
                response.raise_for_status(); job = response.json().get('result', {}).get('jobOpening', {})
                if job.get('jobOpeningStatus') != 'Open': return None
                if job.get('jobOpeningShareUrl', '').rstrip('/') != url:
                    raise ValueError('BambooHR public detail does not match its listing')
                description = clean(job.get('description'))
                if not description: raise ValueError('BambooHR public detail is missing its description')
                return make_job(identifier, job.get('jobOpeningName') or item['jobOpeningName'], company.name,
                                location_text(job.get('location'), job.get('atsLocation')) or location, description,
                                'bamboohr', 'company_career', url, url, company.careers_url, posting=job.get('datePosted'))
            jobs = await asyncio.gather(*(convert(item) for item in records))
        return [j for j in jobs if j], len(records)


class PyjamaCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, clean, cached_get, location_text, make_job, request
        parsed = urlparse(company.careers_url)
        if parsed.hostname != 'jobs.pyjamahr.com' or not re.fullmatch(r'[\w-]+', company.ats_identifier):
            raise ValueError('PyjamaHR employer host does not match its registered source')
        base = 'https://api.pyjamahr.com'; records = []; seen = set()
        async with client(timeout=35) as x:
            response = await request(x, 'GET', company.careers_url); response.raise_for_status()
            node = BeautifulSoup(response.text, 'html.parser').select_one('#__NEXT_DATA__')
            if not node: raise ValueError('PyjamaHR public company configuration is missing')
            company_data = json.loads(node.get_text()).get('props', {}).get('pageProps', {}).get('companyDetails', {})
            if str(company_data.get('uuid')) != company.ats_identifier or company_data.get('slug') != parsed.path.strip('/'):
                raise ValueError('PyjamaHR public company identifier does not match its board')
            page = 1; total = None
            while len(records) < 2000:
                response = await request(x, 'GET', base + '/api/career/jobs/', params={'company_uuid': company.ats_identifier, 'page': page, 'is_careers_page': 'true'})
                response.raise_for_status(); data = response.json(); batch = data.get('results')
                if not isinstance(batch, list) or not isinstance(data.get('count'), int) or data['count'] < 0:
                    raise ValueError('PyjamaHR public list has an unexpected schema')
                if total is None: total = data['count']
                if data['count'] != total: raise ValueError('PyjamaHR listing count changed during pagination')
                ids = [str(item.get('id') or '') for item in batch]
                if any(not i.isdigit() or i in seen for i in ids) or len(set(ids)) != len(ids):
                    raise ValueError('PyjamaHR pagination repeated or omitted identifiers')
                if not batch and len(records) < total: raise ValueError('PyjamaHR list ended before its reported count')
                seen.update(ids); records.extend(batch)
                if not data.get('next'):
                    if len(records) != total: raise ValueError('PyjamaHR list omitted published jobs')
                    break
                page += 1
            else: raise ValueError('PyjamaHR list exceeded the bounded scan')
            semaphore = asyncio.Semaphore(5)
            async def convert(item):
                if item.get('published_internally'): return None
                identifier = str(item['id'])
                endpoint = base + '/api/career/jobs/' + identifier + '/?' + urlencode({'company_uuid': company.ats_identifier, 'is_careers_page': 'true'})
                async with semaphore: response = await cached_get(x, endpoint)
                if response.status_code in (404, 410): return None
                response.raise_for_status(); job = response.json()
                if str(job.get('id')) != identifier: raise ValueError('PyjamaHR detail does not match its listing')
                if job.get('published_internally'): return None
                description = clean(job.get('description'))
                if not description: raise ValueError('PyjamaHR public detail lacks its description')
                # created_at and valid_through are not evidence of the original posting day.
                slug = item.get('slug')
                if not isinstance(slug, str) or not re.fullmatch(r'[\w-]+', slug):
                    raise ValueError('PyjamaHR public job navigation slug is missing')
                url = company.careers_url.rstrip('/') + '/' + slug
                return make_job(identifier, job.get('title') or item['title'], company.name, location_text(job.get('location'), job.get('other_locations')), description,
                                'pyjamahr', 'company_career', url, url, company.careers_url, posting=job.get('published_at') or job.get('date_posted'))
            jobs = await asyncio.gather(*(convert(item) for item in records))
        return [j for j in jobs if j], len(records)
