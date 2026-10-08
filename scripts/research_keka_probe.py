"""Read-only Keka requests derived from the current published career widget."""
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from scraper.adapters import client, request

OUT = Path('artifacts/research-keka')
BOARDS = {'Jupiter': 'https://jupiter.keka.com/careers',
          'Open Financial Technologies': 'https://openfinancial.keka.com/careers/'}


async def run():
    OUT.mkdir(parents=True, exist_ok=True)
    cases = []
    async with client(timeout=30) as x:
        for name, board in BOARDS.items():
            folder = OUT / name.replace(' ', '-')
            folder.mkdir(exist_ok=True)
            case = {'company': name, 'board': board, 'production_writes': 0}
            cases.append(case)
            try:
                r = await request(x, 'GET', board)
                r.raise_for_status()
                (folder / 'board.html').write_text(r.text)
                match = re.search(r"fetch\('([^']+/careerportal/[^']+\.html)'\)", r.text)
                if not match:
                    raise ValueError('Published portal document missing')
                portal = urljoin(str(r.url), match[1])
                if urlsplit(portal).netloc != urlsplit(board).netloc:
                    raise ValueError('Portal document changed origin')
                r = await request(x, 'GET', portal)
                r.raise_for_status()
                (folder / 'portal.html').write_text(r.text)
                soup = BeautifulSoup(r.text, 'html.parser')
                widget = soup.select_one('script[src*="/api/embedjobs/js/"]')
                identifier = re.search(r"identifier:\s*'([^']+)'", r.text)
                domain = re.search(r"domain:\s*'([^']+)'", r.text)
                if not widget or not identifier or not domain:
                    raise ValueError('Published widget configuration missing')
                domain = domain[1]
                if urlsplit(domain).netloc != urlsplit(board).netloc:
                    raise ValueError('Widget domain changed origin')
                script = urljoin(portal, widget['src'])
                r = await request(x, 'GET', script)
                r.raise_for_status()
                (folder / 'widget.js').write_text(r.text)
                if 'api/embedjobs/${portalName}/active/' not in r.text or 'khConfig.portalName ?? "default"' not in r.text:
                    raise ValueError('Published listing request changed')
                if "'jobdetails/' + job.id" not in r.text:
                    raise ValueError('Published detail URL changed')
                endpoint = urljoin(domain, 'api/embedjobs/default/active/' + identifier[1])
                listing = await request(x, 'GET', endpoint)
                listing.raise_for_status()
                jobs = listing.json()
                (folder / 'jobs.json').write_text(json.dumps(jobs, indent=2))
                if not isinstance(jobs, list) or len(jobs) > 200:
                    raise ValueError('Listing shape or bounded detail limit changed')
                ids = [j['id'] for j in jobs]
                if len(ids) != len(set(ids)):
                    raise ValueError('Duplicate listing IDs')
                case.update(endpoint=endpoint, records=len(jobs), unique_ids=len(set(ids)),
                            widget_sha256=hashlib.sha256(r.content).hexdigest(), details=[])
                for job in jobs:
                    url = urljoin(domain, 'jobdetails/' + str(job['id']))
                    detail = await request(x, 'GET', url)
                    (folder / (str(job['id']) + '.html')).write_text(detail.text)
                    case['details'].append({'url': url, 'status': detail.status_code,
                                            'bytes': len(detail.content)})
                    detail.raise_for_status()
                case['status'] = 'LISTING_AND_DETAIL_HTML_CAPTURED_NOT_COMPLETE'
            except Exception as exc:
                case.update(status='UNRESOLVED', blocker=type(exc).__name__ + ': ' + str(exc)[:200])
            print(json.dumps(case), flush=True)
    (OUT / 'evidence.json').write_text(json.dumps(cases, indent=2))
    # Release gate is the production adapter, not an HTTP-200 discovery count.
    from scraper.adapters import ADAPTERS
    from scraper.main import load_companies
    company = next(c for c in load_companies() if c.name == 'Jupiter')
    if company.ats_provider != 'keka':
        raise ValueError('Jupiter registry repair is not configured for Keka')
    jobs, total = await ADAPTERS['keka'].fetch_jobs(company)
    verified = {'company': company.name, 'status': 'COMPLETE_ACTIONS_NOT_PRODUCTION',
                'total': total, 'details': len(jobs),
                'unique_ids': len({j.external_job_id for j in jobs}),
                'missing_descriptions': sum(not j.description for j in jobs)}
    if total != len(jobs) or total != verified['unique_ids'] or verified['missing_descriptions']:
        raise ValueError('Jupiter complete feed release gate failed')
    (OUT / 'jupiter-adapter-verification.json').write_text(json.dumps(verified, indent=2))
    print(json.dumps(verified), flush=True)


if __name__ == '__main__':
    asyncio.run(run())
