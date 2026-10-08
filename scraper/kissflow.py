"""Kissflow's employer-published static role list and complete descriptions."""
import re
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from .snapshot import SnapshotChanged

OFFICIAL = 'https://kissflow.com/'
BOARD = 'https://careers.kissflow.com/'


def listing_records(text):
    soup = BeautifulSoup(text, 'html.parser')
    if not any(h.get_text(' ', strip=True) == 'Open Positions' for h in soup.select('h2')):
        raise ValueError('Kissflow current Open Positions list is missing')
    cards = soup.select('.career-col a.career-in-row[href]')
    if not cards or len(cards) > 100:
        raise ValueError('Kissflow static list is empty or exceeds bounded collection')
    records = {}
    for card in cards:
        url = urljoin(BOARD, card['href'])
        parsed = urlsplit(url)
        title = card.select_one('h6')
        experience = card.select_one('p')
        if (parsed.scheme != 'https' or parsed.netloc != 'careers.kissflow.com' or
                not re.fullmatch(r'/[a-z0-9-]+', parsed.path) or parsed.query or parsed.fragment or
                title is None or not title.get_text(' ', strip=True) or url in records):
            raise ValueError('Kissflow static list has wrong-origin, duplicate or malformed roles')
        records[url] = (title.get_text(' ', strip=True), experience.get_text(' ', strip=True) if experience else '')
    if soup.select('a[rel="next"]'):
        raise ValueError('Kissflow static list now advertises pagination')
    return records


def detail_record(text, url, title, experience):
    from .adapters import clean
    soup = BeautifulSoup(text, 'html.parser')
    canonical = soup.select_one('link[rel="canonical"][href]')
    heading = soup.select_one('h1.job-title')
    description = soup.select_one('.jd')
    if (canonical is None or canonical['href'] != url or heading is None or
            heading.get_text(' ', strip=True) != title or description is None):
        raise ValueError('Kissflow role title, canonical identity or full description is missing')
    requirements = clean(str(description))
    if not requirements or not re.search(r'Required (?:Skills|Experience)', requirements):
        raise ValueError('Kissflow role omitted its complete required skills')
    for node in soup.select('script,style,nav,header,footer'):
        node.decompose()
    visible = soup.get_text(' ', strip=True)
    location = re.search(r'Work Location:\s*(.*?)\s+Apply now\b', visible)
    if location is None or not location[1].strip() or experience not in visible:
        raise ValueError('Kissflow published work location or experience did not reconcile')
    return location[1].strip(), experience + ' ' + requirements


class KissflowCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, request, make_job
        if (company.name != 'Kissflow' or company.careers_url != BOARD or company.ats_identifier != 'kissflow'):
            raise ValueError('Unverified Kissflow source configuration')
        async with client(timeout=40) as x:
            root = await request(x, 'GET', OFFICIAL)
            root.raise_for_status()
            owned = BeautifulSoup(root.text, 'html.parser')
            if BOARD not in {urljoin(str(root.url), a['href']) for a in owned.select('a[href]')}:
                raise ValueError('Kissflow official homepage no longer publishes this careers board')
            response = await request(x, 'GET', BOARD)
            response.raise_for_status()
            soup = BeautifulSoup(response.text, 'html.parser')
            scripts = [urljoin(BOARD, s['src']) for s in soup.select('script[src]') if 'module_Career_job_list.min.js' in s['src']]
            if len(scripts) != 1 or urlsplit(scripts[0]).netloc != 'careers.kissflow.com':
                raise ValueError('Kissflow published static listing module changed')
            module = await request(x, 'GET', scripts[0])
            module.raise_for_status()
            if ('.career-viewbody' not in module.text or '.dnd-career-all' not in module.text or
                    re.search(r'\bfetch\s*\(|ajax\s*\(|axios|XMLHttpRequest', module.text)):
                raise ValueError('Kissflow listing is no longer the verified static HTML consumer')
            first = listing_records(response.text)
            jobs = []
            for url, (title, experience) in first.items():
                detail = await request(x, 'GET', url)
                detail.raise_for_status()
                location, description = detail_record(detail.text, url, title, experience)
                jobs.append(make_job(urlsplit(url).path.strip('/'), title, company.name, location,
                                     description, 'kissflow', 'company_career', url, url, BOARD))
            final = await request(x, 'GET', BOARD)
            final.raise_for_status()
            if listing_records(final.text) != first:
                raise SnapshotChanged('Kissflow role inventory changed during full detail collection')
        return jobs, len(first)
