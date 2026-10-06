"""Read the complete job list embedded in public Paylocity career pages."""
import asyncio
import json
import re
from urllib.parse import urlparse

from bs4 import BeautifulSoup


def page_data(text):
    for script in BeautifulSoup(text, 'html.parser').find_all('script'):
        match = re.search(r'window\.pageData\s*=\s*', script.get_text())
        if match:
            data, _ = json.JSONDecoder().raw_decode(script.get_text()[match.end():])
            if not isinstance(data, dict):
                raise ValueError('Paylocity public page data is malformed')
            return data
    raise ValueError('Paylocity page is missing its public job data')


def public_jobs(data, board):
    rows = data.get('Jobs')
    if not isinstance(rows, list) or len(rows) > 2000 or data.get('ShowInternal') is not False:
        raise ValueError('Paylocity public job list is missing, internal, or unbounded')
    # The public lead URL binds the embedded data to the requested board.
    if data.get('LeadJoinUrl', '').lower() != '/recruiting/publicleads/new/' + board.lower():
        raise ValueError('Paylocity job list does not match the employer board')
    seen = set()
    for row in rows:
        identifier = str(row.get('JobId', ''))
        if not identifier.isdigit() or identifier in seen or row.get('IsInternal') is not False:
            raise ValueError('Paylocity public list repeated, omitted, or exposed an internal identifier')
        seen.add(identifier)
    return rows


def detail_description(text, identifier, title):
    soup = BeautifulSoup(text, 'html.parser')
    canonical = soup.find('meta', property='og:url')
    expected = f'https://recruiting.paylocity.com/Recruiting/Jobs/Details/{identifier}'
    if not canonical or canonical.get('content', '').rstrip('/') != expected:
        raise ValueError('Paylocity public detail does not match its listing')
    if page_data(text).get('jobTitle') != title:
        raise ValueError('Paylocity public detail title does not match its listing')
    sections = []
    for header in soup.select('.job-listing-header'):
        if header.get_text(strip=True) in ('Description', 'Requirements'):
            body = header.find_next_sibling('div')
            if body:
                sections.append(str(body))
    if not sections:
        raise ValueError('Paylocity public detail is missing its full description')
    return '\n'.join(sections)


class PaylocityCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import cached_get, clean, client, likely_target, location_text, make_job, request
        board = company.ats_identifier
        parsed = urlparse(company.careers_url)
        if (parsed.scheme != 'https' or parsed.hostname != 'recruiting.paylocity.com'
                or not re.fullmatch(r'[0-9a-fA-F-]{36}', board)
                or parsed.path.lower() != '/recruiting/jobs/all/' + board.lower() or parsed.query):
            raise ValueError('Paylocity employer URL does not match its registered board')
        async with client(timeout=40) as x:
            response = await request(x, 'GET', company.careers_url)
            response.raise_for_status()
            rows = public_jobs(page_data(response.text), board)
            semaphore = asyncio.Semaphore(5)
            async def convert(row):
                loc = row.get('JobLocation') or {}
                location = location_text(row.get('LocationName'), loc.get('City'), loc.get('State'), loc.get('Country'))
                title = row.get('JobTitle', '')
                if not likely_target(title, location):
                    return None
                identifier = str(row['JobId'])
                url = f'https://recruiting.paylocity.com/Recruiting/Jobs/Details/{identifier}'
                async with semaphore:
                    detail = await cached_get(x, url)
                if detail.status_code in (404, 410):
                    return None
                detail.raise_for_status()
                description = clean(detail_description(detail.text, identifier, title))
                if not description:
                    raise ValueError('Paylocity full description is empty')
                return make_job(identifier, title, company.name, location, description, 'paylocity',
                                'company_career', url, url, company.careers_url,
                                posting=row.get('PublishedDate'))
            jobs = await asyncio.gather(*(convert(row) for row in rows))
        return [job for job in jobs if job], len(rows)
