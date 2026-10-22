"""Recover adidas from its published SAP India search and complete public details."""
import asyncio
import re
from datetime import datetime
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

SEARCH = 'https://jobs.adidas-group.com/search/?locationsearch=India'


def official(url, search=False):
    parsed = urlsplit(url)
    valid_path = parsed.path == '/search/' if search else bool(re.fullmatch(r'/job/[^/]+/\d+/', parsed.path))
    if (parsed.scheme != 'https' or parsed.netloc != 'jobs.adidas-group.com' or not valid_path
            or parsed.fragment or (search and parse_qs(parsed.query).get('locationsearch') != ['India'])):
        raise ValueError('adidas search/detail escaped its registered employer or India filter')
    return url


def records(content, url, offset, expected=None):
    soup = BeautifulSoup(content, 'html.parser')
    label = soup.select_one('.paginationLabel')
    match = re.fullmatch(r'Results\s+([\d,]+)\s*[–-]\s*([\d,]+)\s+of\s+([\d,]+)', label.get_text(' ', strip=True) if label else '')
    if not match:
        raise ValueError('adidas search omitted its published count')
    start, end, total = [int(x.replace(',', '')) for x in match.groups()]
    if total > 2000 or (expected is not None and total != expected):
        raise SnapshotChanged('adidas search count changed or exceeded its bound')
    rows = soup.select('tr.data-row')
    if total == 0:
        if rows or start or end:
            raise ValueError('adidas empty search has inconsistent records')
        return total, {}, None
    if start != offset + 1 or end > total or end < start or len(rows) != end-start+1:
        raise ValueError('adidas search omitted a result range')
    found = {}
    for row in rows:
        link = row.select_one('a.jobTitle-link[href]'); location = row.select_one('.jobLocation')
        if not link or not location or not link.get_text(strip=True):
            raise ValueError('adidas search has incomplete records')
        target = official(urljoin(url, link['href']))
        identifier = urlsplit(target).path.rstrip('/').split('/')[-1]
        if identifier in found:
            raise ValueError('adidas search repeated a job ID')
        found[identifier] = (target, link.get_text(' ', strip=True), location.get_text(' ', strip=True))
    next_url = None
    if end < total:
        for link in soup.select('.pagination a[href]'):
            candidate = urljoin(url, link['href'])
            if parse_qs(urlsplit(candidate).query).get('startrow') == [str(end)]:
                next_url = official(candidate, search=True); break
        if not next_url:
            raise ValueError('adidas search omitted its next page')
    return total, found, next_url


async def fetch_jobs(company):
    from .adapters import clean, client, location_text, make_job, request
    if company.careers_url != SEARCH or company.ats_identifier != SEARCH:
        raise ValueError('adidas source differs from its published India search')
    async with client(timeout=40) as x:
        url = SEARCH; found = {}; total = None; first = None
        for _ in range(100):
            response = await request(x, 'GET', url); response.raise_for_status()
            official(str(response.url), search=True)
            total, batch, next_url = records(response.text, url, len(found), total)
            if first is None: first = batch
            if found.keys() & batch.keys():
                raise SnapshotChanged('adidas search repeated IDs across pages')
            found.update(batch)
            if not next_url: break
            url = next_url
        if len(found) != total:
            raise ValueError('adidas search did not reconcile to its complete count')
        semaphore = asyncio.Semaphore(3)
        async def detail(identifier, row):
            url, title, _ = row
            async with semaphore:
                response = await request(x, 'GET', url); response.raise_for_status()
            if official(str(response.url)) != url:
                raise SnapshotChanged('adidas detail changed its public job identity')
            soup = BeautifulSoup(response.text, 'html.parser')
            def field(name):
                node = soup.select_one(f'[data-careersite-propertyid="{name}"]')
                return node.get_text(' ', strip=True) if node else ''
            titles = soup.select('[itemprop="title"]'); description = soup.select_one('.jobdescription')
            requisition = field('adcode'); city = field('city'); country = field('country')
            if (not titles or clean(titles[0].get_text()) != clean(title) or not description
                    or not clean(description.get_text()) or not requisition.isdigit() or not city or country != 'IN'):
                raise ValueError('adidas full detail lacks matching title, requisition, description or India location')
            # Public date is day precision. Never invent an hour or timezone.
            date = datetime.strptime(field('date'), '%b %d, %Y').date().isoformat()
            return make_job(requisition, title, company.name, location_text(city, field('state'), country),
                            clean(str(description)), 'adidas', 'company_career', url, url, SEARCH, posting=date)
        jobs = await asyncio.gather(*(detail(k, v) for k, v in found.items()))
        if len({job.external_job_id for job in jobs}) != total:
            raise ValueError('adidas details repeated requisition IDs')
        check = await request(x, 'GET', SEARCH); check.raise_for_status()
        official(str(check.url), search=True)
        _, latest, _ = records(check.text, SEARCH, 0, total)
        if latest != first:
            raise SnapshotChanged('adidas first page changed during full detail collection')
    return jobs, total
