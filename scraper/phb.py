"""Collect complete public HTML job boards using the PHB career template."""
import asyncio
import re
from datetime import datetime
from urllib.parse import parse_qs, urlencode, urljoin, urlparse

from bs4 import BeautifulSoup


HTML_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}


def listing(text, base, host):
    soup = BeautifulSoup(text, 'html.parser')
    container = soup.select_one('#js-job-search-results[data-results]')
    summary = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))
    match = re.search(r'Displaying\s+([\d,]+)\s+to\s+([\d,]+)\s+of\s+([\d,]+)\s+matching jobs', summary, re.I)
    if not container or not match:
        raise ValueError('PHB public listing is missing its verifiable result count')
    start, end, count = [int(value.replace(',', '')) for value in match.groups()]
    if count > 3000 or str(count) != container['data-results']:
        raise ValueError('PHB public listing count is inconsistent or exceeds the bounded scan')
    rows = {}
    for card in container.select('.card-job[data-id]'):
        identifier = card['data-id']; link = card.select_one('h2 a[href]')
        if not re.fullmatch(r'[A-Za-z]?[0-9]+', identifier) or not link:
            raise ValueError('PHB result omitted its public job identifier')
        url = urljoin(base, link['href']); parsed = urlparse(url)
        if parsed.scheme != 'https' or parsed.hostname != host or identifier not in parsed.path.split('/'):
            raise ValueError('PHB public job does not match its employer host and identifier')
        if identifier in rows:
            raise ValueError('PHB public listing repeated a job identifier')
        location = card.select_one('.job-meta li')
        rows[identifier] = {'title': link.get_text(' ', strip=True), 'url': url,
                            'location': location.get_text(' ', strip=True) if location else ''}
    if len(rows) != (end - start + 1 if count else 0):
        raise ValueError('PHB public listing did not match its reported page range')
    next_link = None
    for link in soup.select('a[href]'):
        target = urljoin(base, link['href']); parsed = urlparse(target)
        page = parse_qs(parsed.query).get('page', [])
        if (parsed.hostname == host and parsed.scheme == 'https' and page
                and page[0].isdigit() and int(page[0]) == 2):
            next_link = target; break
    return rows, start, end, count, next_link


def detail(text, identifier, title):
    soup = BeautifulSoup(text, 'html.parser')
    heading = soup.find('h1'); code = soup.select_one('.hero-eyebrow')
    if not heading or heading.get_text(' ', strip=True) != title or not code or code.get_text(strip=True).casefold() != identifier.casefold():
        raise ValueError('PHB public detail does not match its listing')
    body = soup.select_one('#js-job-detail')
    description = body.get_text(' ', strip=True) if body else ''
    if not description:
        raise ValueError('PHB public detail is missing its full description')
    location = soup.select_one('.job-meta-location strong')
    posting = None
    for item in soup.select('.job-meta-item'):
        value = item.find('strong')
        if value and item.get_text(' ', strip=True).startswith('Date published '):
            posting = datetime.strptime(value.get_text(' ', strip=True), '%b %d %Y').date().isoformat()
    return description, location.get_text(' ', strip=True) if location else '', posting


class PHBPaginationError(ValueError):
    """The public pages changed or served inconsistent ranges during a scan."""


class PHBCareerAdapter:
    async def fetch_jobs(self, company):
        for attempt in range(2):
            try:
                return await self._fetch_jobs(company)
            except PHBPaginationError:
                if attempt:
                    raise

    async def _fetch_jobs(self, company):
        from .adapters import client, likely_target, make_job, request
        parsed = urlparse(company.careers_url); host = parsed.hostname
        if parsed.scheme != 'https' or host != company.ats_identifier or parsed.query or not parsed.path.endswith('/jobs/'):
            raise ValueError('PHB employer board does not match its registered source')
        async with client(timeout=40) as x:
            response = await request(x, 'GET', company.careers_url, params={'page': 1, 'pagesize': 100}, headers=HTML_HEADERS)
            response.raise_for_status()
            rows, start, end, count, next_link = listing(response.text, str(response.url), host)
            if count and start != 1:
                raise ValueError('PHB complete scan must begin at page one')
            semaphore = asyncio.Semaphore(6)
            if len(rows) < count:
                if not next_link or not end:
                    raise ValueError('PHB listing omitted its public pagination')
                next_parsed = urlparse(next_link)
                if next_parsed.path != parsed.path:
                    raise ValueError('PHB pagination changed the employer board')
                query = parse_qs(next_parsed.query)
                async def page(number):
                    values = dict(query); values['page'] = [str(number)]; values['pagesize'] = [str(end)]
                    url = next_parsed._replace(query=urlencode(values, doseq=True), fragment='').geturl()
                    async with semaphore:
                        result = await request(x, 'GET', url, headers=HTML_HEADERS)
                    result.raise_for_status()
                    batch, first, last, total, more = listing(result.text, str(result.url), host)
                    if total != count or first != (number - 1) * end + 1 or last != min(number * end, count):
                        raise PHBPaginationError(f'PHB public pagination changed, repeated, or omitted its reported range: page={number}, range={first}-{last}, total={total}, expected_total={count}, page_size={end}')
                    return batch
                batches = await asyncio.gather(*(page(number) for number in range(2, (count + end - 1) // end + 1)))
                for batch in batches:
                    if rows.keys() & batch.keys():
                        raise PHBPaginationError('PHB public pagination repeated job identifiers')
                    rows.update(batch)
            if len(rows) != count:
                raise ValueError('PHB complete job list does not match its reported count')
            async def convert(identifier, row):
                if not likely_target(row['title'], row['location']):
                    return None
                async with semaphore:
                    # HTML representation depends on the browser request headers.
                    # Keep this public request separate from caches of bot representations.
                    result = await request(x, 'GET', row['url'], headers=HTML_HEADERS)
                if result.status_code in (404, 410):
                    return None
                result.raise_for_status()
                description, location, posting = detail(result.text, identifier, row['title'])
                return make_job(identifier, row['title'], company.name, location or row['location'], description,
                                'phb', 'company_career', row['url'], row['url'], company.careers_url, posting=posting)
            jobs = await asyncio.gather(*(convert(identifier, row) for identifier, row in rows.items()))
        return [job for job in jobs if job], count
