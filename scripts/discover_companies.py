"""Read-only employer discovery. Output is a review queue, never an enabled registry."""
import argparse
import asyncio
import csv
import json
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit, urlunsplit
import httpx

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/discovery-pilot.json').read_text())
HEADERS = {'User-Agent': 'JobRadarDiscovery/1.0 (+https://github.com/chandanvura/JobRadar)', 'Accept': 'application/json'}


def source_identity(url):
    """Use a board identity to deduplicate names such as HPE / Hewlett Packard Enterprise."""
    try:
        parsed = urlsplit(url)
        host = (parsed.hostname or '').lower()
        if parsed.scheme != 'https' or parsed.username or parsed.password or parsed.port not in (None, 443):
            return None
        parts = [part for part in parsed.path.split('/') if part]
        provider = None
        if host in {'job-boards.greenhouse.io', 'boards.greenhouse.io'} and parts:
            provider, tenant = 'greenhouse', parts[0]
        elif host in {'jobs.lever.co', 'jobs.eu.lever.co'} and parts:
            provider, tenant = 'lever', parts[0]
        elif host == 'jobs.ashbyhq.com' and parts:
            provider, tenant = 'ashby', parts[0]
        elif host == 'jobs.smartrecruiters.com' and parts:
            provider, tenant = 'smartrecruiters', parts[0]
        elif host.endswith('.myworkdayjobs.com') and parts:
            site = next((part for part in parts if not re.fullmatch(r'[a-z]{2}(?:-[A-Z]{2})?', part)), '')
            provider, tenant = 'workday', f'{host}|{site}'
        elif host.endswith('.oraclecloud.com') and parsed.path.startswith('/hcmUI/CandidateExperience/'):
            # CX sites can repeat the same employer and job. The tenant host is
            # the review identity, not an invented company name from the URL.
            provider, tenant = 'oracle', host
        elif host == 'www.careers-page.com' and parts:
            provider, tenant = 'manatal', parts[0]
        else:
            return None
        canonical = urlunsplit(('https', host, parsed.path, urlencode({k: v for k, v in parse_qs(parsed.query).items() if not k.startswith('utm_')}, doseq=True), ''))
        return {'key': f'{provider}:{tenant.casefold()}', 'provider': provider, 'url': canonical}
    except (TypeError, AttributeError, ValueError):
        return None


def review_candidates(payloads, registry, now=None):
    known_names = {row['company_name'].strip().casefold() for row in registry}
    known_boards = {identity['key'] for row in registry if (identity := source_identity(row['careers_url']))}
    candidates, skipped = {}, {'wrong_location': 0, 'invalid_company': 0, 'unsupported_source': 0, 'existing_source': 0}
    seen = set()
    for payload in payloads:
        if not isinstance(payload, dict) or not isinstance(payload.get('data'), list) or len(payload['data']) > CONFIG['page_size']:
            raise ValueError('Discovery source returned an invalid list')
        for job in payload['data']:
            if not isinstance(job, dict):
                raise ValueError('Discovery source returned an invalid record')
            location = job.get('location')
            if not isinstance(location, str) or not re.search(CONFIG['target_location_pattern'], location, re.I):
                skipped['wrong_location'] += 1
                continue
            name = job.get('company')
            if not isinstance(name, str) or not name.strip() or len(name) > 160 or re.search(r'https?:|[/\\]|\.com\b', name, re.I):
                skipped['invalid_company'] += 1
                continue
            identity = source_identity(job.get('url', ''))
            if not identity:
                skipped['unsupported_source'] += 1
                continue
            if name.strip().casefold() in known_names or identity['key'] in known_boards:
                skipped['existing_source'] += 1
                continue
            if identity['key'] not in candidates:
                candidates[identity['key']] = {'company': name.strip(), 'aliases': [], 'board_identity': identity['key'], 'provider_hint': identity['provider'], 'status': 'needs_official_verification', 'enabled': False, 'evidence': []}
            candidate = candidates[identity['key']]
            if name.strip() not in candidate['aliases']:
                candidate['aliases'].append(name.strip())
            if identity['url'] not in seen and len(candidate['evidence']) < 3:
                candidate['evidence'].append({'url': identity['url'], 'location': location, 'title': str(job.get('title', ''))[:240], 'aggregator_posted_at': job.get('posted_at'), 'employer_date_verified': False})
                seen.add(identity['url'])
    ordered = sorted(candidates.values(), key=lambda item: item['company'].casefold())
    return {'version': 1, 'source': CONFIG['source'], 'reviewed_at': now or datetime.now(timezone.utc).isoformat(),
            'status': 'review_required', 'candidates': ordered[:CONFIG['max_candidates']],
            'candidate_count_before_limit': len(ordered), 'deferred_candidates': max(0, len(ordered)-CONFIG['max_candidates']),
            'deferred_review': ordered[CONFIG['max_candidates']:],
            'skipped': skipped, 'production_writes': 0}


async def collect():
    payloads = []
    async with asyncio.timeout(CONFIG['run_timeout_seconds']):
        async with httpx.AsyncClient(timeout=CONFIG['request_timeout_seconds'], headers=HEADERS, follow_redirects=False) as client:
            for query in CONFIG['queries']:
                response = await client.get(CONFIG['source'] + '/api/v1/jobs/search', params={'q': query, 'countries': 'in', 'limit': CONFIG['page_size'], 'offset': 0})
                response.raise_for_status()  # No retry storm on 429 or provider failure.
                payloads.append(response.json())
    return payloads


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', nargs='+', help='Review saved API responses without network requests')
    parser.add_argument('--output', default='artifacts/company-discovery/candidates.json')
    args = parser.parse_args()
    with (ROOT / 'companies/companies.csv').open() as source:
        registry = list(csv.DictReader(source))
    payloads = [json.loads(Path(path).read_text()) for path in args.input] if args.input else asyncio.run(collect())
    report = review_candidates(payloads, registry)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix('.pending')
    temporary.write_text(json.dumps(report, indent=2) + '\n')
    temporary.replace(target)  # A failed collection cannot replace the last good report.
    print(json.dumps({'candidates': len(report['candidates']), 'deferred': report['deferred_candidates'], 'production_writes': 0}))


if __name__ == '__main__':
    main()
