"""Read complete employer-hosted Avature HTML listings and full job sections."""
import asyncio
import re
from datetime import datetime
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged
from .models import JobBatch


def listing_page(text, base, host):
    soup = BeautifulSoup(text, 'html.parser')
    summary = re.sub(r'\s+', ' ', soup.get_text(' ', strip=True))
    match = re.search(r'(\d+)\s*-\s*(\d+)\s+of\s+([\d,]+)(\+?)\s+(?:results|jobs)', summary, re.I)
    if not match: raise ValueError('Avature public listing has no verifiable result count')
    start, end, total = (int(match[i].replace(',', '')) for i in (1, 2, 3))
    if match[4] or total > 2000: raise ValueError('Avature listing exceeds the bounded complete scan')
    records = {}
    for article in soup.select('article.article--result'):
        link = article.select_one('h3 a[href*="/JobDetail"],h2 a[href*="/JobDetail"]')
        if not link: raise ValueError('Avature result is missing its job detail link')
        url = urljoin(base, link['href']); parsed = urlparse(url)
        identifier = (parse_qs(parsed.query).get('jobId') or [parsed.path.rstrip('/').split('/')[-1]])[0]
        if parsed.scheme != 'https' or parsed.hostname != host or not identifier.isdigit():
            raise ValueError('Avature public job does not match its employer host')
        if identifier in records: raise ValueError('Avature listing repeated a public job identifier')
        subtitle = article.select_one('.article__header__text__subtitle')
        location = subtitle.get_text(' ', strip=True) if subtitle else ''
        posting = None
        for field in article.select('.article__details__data'):
            icon = field.select_one('img[alt]')
            body = field.find('p')
            label = icon.get('alt', '').lower().rstrip(': ') if icon else ''
            if label == 'office location' and body:
                location = body.get_text(' ', strip=True)
            if label == 'posted date' and body:
                posting = datetime.strptime(body.get_text(' ', strip=True), '%d %b %Y').date().isoformat()
        posted = re.search(r'\bPosted\s+(\d{1,2}-[A-Za-z]{3}-\d{4})', location)
        if posted: posting = datetime.strptime(posted[1], '%d-%b-%Y').date().isoformat()
        records[identifier] = {'title': link.get_text(' ', strip=True), 'location': location, 'url': url, 'posting': posting}
    if len(records) != end - start + 1:
        raise ValueError('Avature listing did not match its reported page range')
    next_page = soup.select_one('a.paginationNextLink[href]')
    return records, start, end, total, urljoin(base, next_page['href']) if next_page else None


def detail_section(soup):
    for article in soup.select('article.article--details'):
        header = article.select_one('.article__header')
        if header and re.search(r'Description\s*(?:and|&)\s*Requirements', header.get_text(' ', strip=True), re.I):
            body = article.select_one('.article__content')
            return body.get_text(' ', strip=True) if body else ''
    # Macquarie publishes responsibilities and requirements as separate panels.
    articles = soup.select('article.article--details')
    headings = [article.select_one('.article__header__text__title') for article in articles]
    titles = {heading.get_text(' ', strip=True).lower() for heading in headings if heading}
    if {'what role will you play?', 'what you offer'} <= titles:
        sections = []
        for article, heading in zip(articles, headings):
            if heading or not article.select('.article__content__view__field__label'):
                body = article.select_one('.article__content')
                if body:
                    sections.append(body.get_text(' ', strip=True))
        return '\n'.join(sections)
    return ''


class AvatureCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, jsonld_objects, likely_target, location_text, make_job, request
        parsed = urlparse(company.careers_url); host = parsed.hostname
        if parsed.scheme != 'https' or host != company.ats_identifier:
            raise ValueError('Avature employer host does not match its registered source')
        async with client(timeout=40) as x:
            response = await request(x, 'GET', company.careers_url); response.raise_for_status()
            found, start, end, total, next_url = listing_page(response.text, str(response.url), host)
            first_ids = list(found)
            if start != 1: raise ValueError('Avature complete scan must begin at page one')
            if len(found) < total:
                if not next_url: raise ValueError('Avature public listing omitted its next page')
                next_parsed = urlparse(next_url); query = parse_qs(next_parsed.query)
                if next_parsed.scheme != 'https' or next_parsed.hostname != host:
                    raise ValueError('Avature pagination must remain on the official employer host')
                if query.get('jobOffset') != [str(end)] or query.get('jobRecordsPerPage') != [str(end)]:
                    raise ValueError('Avature pagination does not match its public page size')
                semaphore = asyncio.Semaphore(4)
                async def page(offset):
                    params = dict(query); params['jobOffset'] = [str(offset)]
                    url = next_parsed._replace(query=urlencode(params, doseq=True)).geturl()
                    async with semaphore: result = await request(x, 'GET', url)
                    result.raise_for_status()
                    batch, first, last, count, more = listing_page(result.text, str(result.url), host)
                    if count != total:
                        raise SnapshotChanged('Avature public listing total changed during pagination')
                    if first != offset + 1 or last != min(offset + end, total):
                        raise ValueError('Avature public listing changed or omitted records during pagination')
                    return batch
                for batch in await asyncio.gather(*(page(offset) for offset in range(end, total, end))):
                    if found.keys() & batch.keys():
                        raise SnapshotChanged('Avature pagination repeated a public job across valid pages')
                    found.update(batch)
            if len(found) != total: raise ValueError('Avature listing did not match its complete result count')
            check = await request(x, 'GET', company.careers_url); check.raise_for_status()
            first, start, last, checked_total, more = listing_page(check.text, str(check.url), host)
            if checked_total != total or list(first) != first_ids:
                raise SnapshotChanged('Avature public listing changed during final verification')
            semaphore = asyncio.Semaphore(5)
            missing = []
            async def convert(identifier, item):
                if not likely_target(item['title'], item['location']): return None
                async with semaphore: result = await cached_get(x, item['url'])
                if result.status_code in (404, 410):
                    missing.append(identifier)
                    return None
                result.raise_for_status(); soup = BeautifulSoup(result.text, 'html.parser')
                ld = list(jsonld_objects(soup)); detail = ld[0] if ld else {}
                description = clean(detail.get('description')) or detail_section(soup)
                if not description: raise ValueError('Avature public detail is missing its full requirements')
                general = soup.select_one('article.article--details')
                location = item['location']
                if general:
                    values = []
                    for field in general.select('.article__content__view__field'):
                        label = field.select_one('.article__content__view__field__label')
                        value = field.select_one('.article__content__view__field__value')
                        if not value: continue
                        label_text = label.get_text(' ', strip=True) if label else ''
                        text = value.get_text(' ', strip=True)
                        if re.search(r'country|region|state|city|location', label_text, re.I): values.append(text)
                        elif not label and re.match(r'(?:Additional\s+)?Locations?\b', text, re.I):
                            values.append(re.sub(r'^(?:Additional\s+)?Locations?\s*:?\s*', '', text, flags=re.I))
                    # Only explicitly published location fields establish the city.
                    location = location_text(values) or location
                posting = detail.get('datePosted') or item['posting']
                return make_job(identifier, detail.get('title') or item['title'], company.name, location, description,
                                'avature', 'company_career', item['url'], item['url'], company.careers_url, posting=posting)
            jobs = await asyncio.gather(*(convert(identifier, item) for identifier, item in found.items()))
        warning = f'Limited coverage: {len(missing)} relevant Avature details disappeared during collection' if missing else None
        return JobBatch([job for job in jobs if job], warning), total
