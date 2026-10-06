"""Bounded, read-only HTTP case ledger. Run on Actions; never writes to D1.

python -m scripts.ats_detective --manifest companies/ats-detective-batch-01.json
Discovery clues are not employer-verified mappings or complete collection.
"""
import argparse
import asyncio
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin, urlsplit

import httpx
from bs4 import BeautifulSoup
from scraper.adapters import HEADERS, discover_ats
from scraper.main import load_companies, scrape

ORIGIN = 'https://jobradar.chandanvura.workers.dev'


def validate_names(names, registry):
    if not isinstance(names, list) or not 1 <= len(names) <= 50:
        raise ValueError('Each batch must contain 1 to 50 companies')
    if any(not isinstance(name, str) for name in names) or len(set(names)) != len(names):
        raise ValueError('Company names must be distinct strings')
    if set(names) - registry.keys():
        raise ValueError('Unknown or disabled company in batch')
    return names


def counts(catalog):
    if catalog.get('data_mode') == 'backup' or not isinstance(catalog.get('companies'), list):
        raise ValueError('A current live production catalog is required')
    rows = catalog['companies']
    return dict(companies=len(rows), limited=sum((r.get('warning') or '').startswith('Limited coverage') for r in rows),
                errors=sum(bool(r.get('error_count')) for r in rows), server_time=catalog.get('server_time'))


def public_links(text, base):
    soup = BeautifulSoup(text, 'html.parser')
    links, scripts = [], []
    for node in soup.select('a[href],iframe[src],script[src],link[href]'):
        raw = node.get('href') or node.get('src')
        url = urljoin(base, raw)
        parsed = urlsplit(url)
        if parsed.scheme != 'https' or parsed.username or parsed.password:
            continue
        # Publish URLs only, never inline configuration, keys or JS snippets.
        if node.name == 'script':
            scripts.append(url)
        elif any(term in url.lower() for term in ('career', 'jobs', 'greenhouse', 'lever.co', 'ashby', 'workday', 'sitemap', '.xml')):
            links.append(url)
    return soup, list(dict.fromkeys(links))[:80], list(dict.fromkeys(scripts))[:30]


async def run(manifest, output):
    registry = {c.name: c for c in load_companies() if c.enabled}
    names = validate_names(manifest['companies'], registry)
    output.mkdir(parents=True, exist_ok=True)
    semaphore = asyncio.Semaphore(3)
    async with httpx.AsyncClient(headers=HEADERS, follow_redirects=True, timeout=20) as client:
        response = await client.get(ORIGIN + '/api/dashboard'); response.raise_for_status()
        before = response.json(); baseline = counts(before)
        (output / 'baseline.json').write_text(json.dumps(before, indent=2))
        async def investigate(name):
            company = registry[name]
            case = dict(company=name, careers_url=company.careers_url, provider=company.ats_provider,
                        identifier=company.ats_identifier, status='UNRESOLVED', score=0,
                        ownership='Requires manual current first-party link-chain review', pages=[])
            async with semaphore:
                try:
                    page = await client.get(company.careers_url)
                    item = dict(url=str(page.url), http_status=page.status_code, content_type=page.headers.get('content-type'),
                                sha256=hashlib.sha256(page.content).hexdigest())
                    case['pages'].append(item)
                    page.raise_for_status()
                    soup, links, scripts = public_links(page.text, str(page.url))
                    item.update(title=soup.title.get_text(' ', strip=True) if soup.title else None,
                                links=links, scripts=scripts, jsonld_blocks=len(soup.select('script[type="application/ld+json"]')))
                    # Existing parser supplies evidence-based leads only.
                    case['ats_lead'] = discover_ats(soup, str(page.url))
                    case['status'] = 'DISCOVERED_UNVERIFIED'
                    for url in [u for u in scripts if any(t in u.lower() for t in ('career', 'jobs'))][:2]:
                        asset = await client.get(url)
                        case['pages'].append(dict(url=str(asset.url), http_status=asset.status_code,
                                                  content_type=asset.headers.get('content-type'),
                                                  sha256=hashlib.sha256(asset.content).hexdigest()))
                    if name == 'HubSpot':
                        # Both endpoint and query fields occur in linked first-party assets.
                        endpoint = 'https://wtcfns.hubspot.com/careers/graphql'
                        query = 'query Jobs { jobs { id title department { name id } office { id location } location { name } } }'
                        probe = await client.post(endpoint, json={'query': query, 'variables': {}})
                        body = probe.json()
                        case['http_probe'] = dict(url=endpoint, method='POST', query=query, status=probe.status_code,
                                                  errors=[e.get('message') for e in body.get('errors', [])],
                                                  has_jobs=isinstance((body.get('data') or {}).get('jobs'), list))
                        case['blocker'] = 'Published GraphQL upstream returns errors; do not map as empty or complete'
                except (httpx.HTTPError, ValueError) as exc:
                    case['status'] = 'BLOCKED_PUBLIC_ACCESS' if isinstance(exc, httpx.HTTPError) else 'UNRESOLVED'
                    case['blocker'] = str(exc)[:250]
                if name in ('Maersk', 'MetLife'):
                    try:
                        rows, status, error, discovered = await asyncio.wait_for(
                            scrape(company, asyncio.Semaphore(1), asyncio.Semaphore(1)), timeout=480)
                        case['collection'] = dict(status=status, error=error, advertised_collected=discovered,
                                                  normalized_jobs=len(rows))
                        case['status'] = 'VERIFIED_PARTIAL' if error or (status.get('warning') or '').startswith('Limited coverage') else 'DISCOVERED_UNVERIFIED'
                        case['blocker'] = error or case.get('blocker')
                    except TimeoutError:
                        case['blocker'] = 'Bounded full-snapshot probe timed out; remains unresolved'
                print(json.dumps(dict(company=name, status=case['status'], blocker=case.get('blocker'))), flush=True)
                return case
        cases = await asyncio.gather(*(investigate(name) for name in names))
        response = await client.get(ORIGIN + '/api/dashboard'); response.raise_for_status()
        after = counts(response.json())
    report = dict(checked_at=datetime.now(timezone.utc).isoformat(), batch=manifest['batch'],
                  before=baseline, after=after, production_writes=0, cases=cases,
                  note='Read-only discovery; production changes from concurrent scheduled scans are not credited to this batch.')
    (output / 'evidence.json').write_text(json.dumps(report, indent=2))
    lines = ['| Company | HTTP | Provider | Collected | Candidates / eligible | Case status | Blocker |',
             '|---|---|---|---|---|---|---|']
    for c in cases:
        status = c.get('collection', {}).get('status', {})
        fields = [c['company'], str(c['pages'][0]['http_status']) if c['pages'] else 'unknown', c['provider'],
                  str(c.get('collection', {}).get('advertised_collected', 'unknown')),
                  f"{status.get('candidate_jobs', 'unknown')} / {status.get('eligible_jobs', 'unknown')}",
                  c['status'], c.get('blocker') or 'Ownership/completeness review pending']
        lines.append('| ' + ' | '.join(str(f).replace('|', '/').replace('\n', ' ') for f in fields) + ' |')
    (output / 'evidence.md').write_text('\n'.join(lines) + '\n')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', required=True, type=Path)
    parser.add_argument('--output', default='artifacts/ats-detective-01', type=Path)
    args = parser.parse_args()
    asyncio.run(run(json.loads(args.manifest.read_text()), args.output))


if __name__ == '__main__':
    main()
