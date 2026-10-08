"""Keka's public career widget, derived from employer-published configuration.

The active request returns the entire array used by client-side filters. Verify
every detail and repeat the listing; never treat HTML shells as empty feeds.
"""
import re
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged


def portal_document(text, board):
    match = re.search(r"fetch\('([^']+/careerportal/[^']+\.html)'\)", text)
    if not match:
        raise ValueError('Keka published portal document missing')
    url = urljoin(board, match[1])
    if urlsplit(url).netloc != urlsplit(board).netloc:
        raise ValueError('Keka portal document changed origin')
    return url


def widget_configuration(text, board, expected):
    soup = BeautifulSoup(text, 'html.parser')
    node = soup.select_one('script[src*="/api/embedjobs/js/"]')
    identifier = re.search(r"identifier:\s*'([^']+)'", text)
    domain = re.search(r"domain:\s*'([^']+)'", text)
    if not node or not identifier or not domain or identifier[1] != expected:
        raise ValueError('Keka current portal does not match registered tenant')
    script = urljoin(board, node['src'])
    domain = domain[1]
    if (domain.rstrip('/') != board.rstrip('/') or
            urlsplit(script).netloc != urlsplit(board).netloc or
            not script.endswith('/api/embedjobs/js/' + expected) or
            re.search(r'portalName\s*:', text)):
        raise ValueError('Keka widget scope or origin changed')
    return domain, script


def listing_records(payload):
    from .adapters import clean
    if not isinstance(payload, list) or len(payload) > 500:
        raise ValueError('Keka full listing schema or bounded scan limit changed')
    records = {}
    for row in payload:
        if (not isinstance(row, dict) or type(row.get('id')) is not int or row['id'] <= 0 or
                row['id'] in records or not isinstance(row.get('title'), str) or not row['title'].strip() or
                not isinstance(row.get('description'), str) or not clean(row['description']) or
                not isinstance(row.get('jobLocations'), list)):
            raise ValueError('Keka listing has duplicate IDs or malformed full records')
        for location in row['jobLocations']:
            if not isinstance(location, dict):
                raise ValueError('Keka published location schema changed')
        records[row['id']] = row
    return records


def verify_detail(text, row):
    from .adapters import clean
    soup = BeautifulSoup(text, 'html.parser')
    title = soup.select_one('h1')
    identity = soup.select_one('[selectedjobid]')
    description = soup.select_one('.job-description-container')
    if (not title or clean(str(title)) != clean(row['title']) or not identity or
            identity.get('selectedjobid') != str(row['id']) or not description or
            clean(str(description)) != clean(row['description'])):
        raise ValueError('Keka detail ID, title or full description does not reconcile')


class KekaCareerAdapter:
    async def fetch_jobs(self, c):
        from .adapters import client, request, clean, make_job
        parts = c.ats_identifier.split('|')
        if len(parts) != 2:
            raise ValueError('Keka requires a verified board URL and tenant identifier')
        board, expected = parts
        parsed = urlsplit(board)
        if (parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.keka.com') or
                parsed.username or parsed.password or parsed.query or parsed.fragment or
                parsed.path.rstrip('/') != '/careers' or
                not re.fullmatch(r'[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}', expected)):
            raise ValueError('Invalid Keka public board configuration')
        async with client(timeout=30) as x:
            employer = await request(x, 'GET', c.careers_url)
            employer.raise_for_status()
            soup = BeautifulSoup(employer.text, 'html.parser')
            published = [urljoin(str(employer.url), n.get('href') or n.get('src'))
                         for n in soup.select('a[href],iframe[src]')]
            if board.rstrip('/') not in {u.rstrip('/') for u in published}:
                raise ValueError('Employer no longer publishes the registered Keka board')
            wrapper = await request(x, 'GET', board)
            wrapper.raise_for_status()
            portal = await request(x, 'GET', portal_document(wrapper.text, board))
            portal.raise_for_status()
            domain, script = widget_configuration(portal.text, board, expected)
            widget = await request(x, 'GET', script)
            widget.raise_for_status()
            required = ['api/embedjobs/${portalName}/active/', 'khConfig.portalName ?? "default"',
                        "'jobdetails/' + job.id", 'bindJobs(jobList)']
            if any(s not in widget.text for s in required):
                raise ValueError('Keka published full-list/detail requests changed')
            endpoint = urljoin(domain, 'api/embedjobs/default/active/' + expected)
            response = await request(x, 'GET', endpoint)
            response.raise_for_status()
            records = listing_records(response.json())
            jobs = []
            for identifier, row in records.items():
                url = urljoin(domain, 'jobdetails/' + str(identifier))
                detail = await request(x, 'GET', url)
                detail.raise_for_status()
                if str(detail.url).rstrip('/') != url.rstrip('/'):
                    raise ValueError('Keka job detail redirected away from its listed identity')
                verify_detail(detail.text, row)
                locations = [' · '.join(str(v[k]) for k in ('name', 'city', 'state', 'countryName') if v.get(k))
                             for v in row['jobLocations']]
                jobs.append(make_job(str(identifier), row['title'], c.name,
                                     ' · '.join(dict.fromkeys(locations)), clean(row['description']),
                                     'keka', 'company_career', url, url, c.careers_url,
                                     posting=row.get('publishedOn')))
            final = await request(x, 'GET', endpoint)
            final.raise_for_status()
            if listing_records(final.json()) != records:
                raise SnapshotChanged('Keka public inventory changed during detail reconciliation')
            return jobs, len(records)
