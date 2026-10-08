"""Read-only Actions capture of current errors, without changing source mappings."""
import asyncio
import json
import re
from pathlib import Path
from urllib.parse import parse_qs, urljoin, urlsplit

from bs4 import BeautifulSoup
from scraper import adapters
from scraper.avature import listing_page
from scraper.main import fetch_company_jobs, load_companies
from scraper.models import Company


async def public_candidates(output):
    from scripts import refreshed_candidates
    refreshed_candidates.OUT.mkdir(parents=True, exist_ok=True)
    async with adapters.client(timeout=40) as client:
        hubspot = {'company': 'HubSpot', 'status': 'UNRESOLVED'}
        try:
            case = next(c for c in json.loads(Path('artifacts/source-audit/evidence.json').read_text())['cases'] if c['company'] == 'HubSpot')
            assets = ''.join((Path('artifacts/source-audit') / row['artifact']).read_text()
                             for row in case['pages'] if row.get('artifact', '').endswith('.js') and 'careers' in row['url'])
            endpoint = re.search(r'serverUrl:"(https://[^"]+)"', assets).group(1)
            query = json.loads(Path('companies/hubspot-public-queries.json').read_text())['Jobs']
            compact = lambda value: re.sub(r'[\s,]', '', value.replace('\\n', '\n'))
            if compact(query) not in compact(assets):
                raise ValueError('Published Jobs query changed; old payload must not be reused')
            response = await adapters.request(client, 'POST', endpoint, json={'operationName': 'Jobs', 'query': query, 'variables': {}})
            (output / 'hubspot-graphql.json').write_text(response.text)
            data = response.json()
            hubspot.update(endpoint=endpoint, http_status=response.status_code, errors=data.get('errors'),
                           jobs_is_list=isinstance((data.get('data') or {}).get('jobs'), list))
        except Exception as exc:
            hubspot['error'] = type(exc).__name__ + ': ' + str(exc)
        (output / 'HubSpot-case.json').write_text(json.dumps(hubspot, indent=2))
        print(json.dumps(hubspot), flush=True)

        planful = {'company': 'Planful', 'status': 'UNVERIFIED'}
        try:
            board = 'https://planful.com/jobs/careers-list/'
            chain = await refreshed_candidates.official_chain(client, 'Planful', 'https://planful.com/', board)
            if not chain['verified']:
                raise ValueError('Official Planful navigation did not reach its registered careers page')
            response = await adapters.request(client, 'GET', board)
            response.raise_for_status()
            (output / 'Planful-careers.html').write_text(response.text)
            soup = BeautifulSoup(response.text, 'html.parser')
            embeds = [urljoin(str(response.url), node.get('src') or node.get('href'))
                      for node in soup.select('script[src],iframe[src],a[href]')]
            embeds = [url for url in embeds if urlsplit(url).hostname in {'boards.greenhouse.io', 'job-boards.greenhouse.io'} and parse_qs(urlsplit(url).query).get('for')]
            tenants = {parse_qs(urlsplit(url).query)['for'][0] for url in embeds}
            if len(tenants) != 1:
                raise ValueError('No unique employer-published Greenhouse tenant')
            tenant = tenants.pop()
            branding = await adapters.request(client, 'GET', embeds[0])
            branding.raise_for_status()
            (output / 'Planful-board.html').write_text(branding.text)
            if 'planful' not in BeautifulSoup(branding.text, 'html.parser').get_text(' ', strip=True).lower():
                raise ValueError('Linked board does not identify Planful')
            jobs, total = await fetch_company_jobs(Company('Planful', board, 'greenhouse', tenant))
            if getattr(jobs, 'coverage_warning', None) or total != len(jobs) or len({j.external_job_id for j in jobs}) != total or any(not j.description for j in jobs):
                raise ValueError('Complete Planful inventory and details did not reconcile')
            planful.update(status='COMPLETE_ACTIONS_NOT_PRODUCTION', official_chain=chain['chain'],
                           identifier=tenant, advertised_total=total, details=len(jobs),
                           unique_ids=len({j.external_job_id for j in jobs}), missing_descriptions=0)
        except Exception as exc:
            planful['error'] = type(exc).__name__ + ': ' + str(exc)
        (output / 'Planful-case.json').write_text(json.dumps(planful, indent=2))
        print(json.dumps(planful), flush=True)


async def run():
    output = Path('artifacts/source-error-audit')
    output.mkdir(parents=True, exist_ok=True)
    company = next(c for c in load_companies() if c.name == 'Macquarie Group')
    records = []
    original = adapters.request

    async def capture(client, method, url, **kwargs):
        response = await original(client, method, url, **kwargs)
        record = {'url': str(response.url), 'status': response.status_code}
        if '/SearchJobs' in urlsplit(str(response.url)).path:
            path = output / f'listing-{len(records)}.html'
            path.write_text(response.text)
            record['artifact'] = str(path)
            if response.status_code == 200:
                try:
                    rows, start, end, total, more = listing_page(response.text, str(response.url), company.ats_identifier)
                    record.update(ids=list(rows), start=start, end=end, total=total, next=more)
                except ValueError as exc:
                    record['parser_error'] = str(exc)
        records.append(record)
        return response

    adapters.request = capture
    result = {'company': company.name, 'status': 'UNRESOLVED', 'production_writes': 0}
    try:
        jobs, total = await asyncio.wait_for(fetch_company_jobs(company), timeout=600)
        warning = getattr(jobs, 'coverage_warning', None)
        result.update(status='COMPLETE_ACTIONS_NOT_PRODUCTION' if not warning else 'PARTIAL',
                      advertised_total=total, candidates=len(jobs), warning=warning,
                      unique_candidate_ids=len({j.external_job_id for j in jobs}))
    except Exception as exc:
        result['error'] = type(exc).__name__ + ': ' + str(exc)
    finally:
        adapters.request = original
    result['requests'] = records
    (output / 'evidence.json').write_text(json.dumps(result, indent=2))
    print(json.dumps({k: v for k, v in result.items() if k != 'requests'}), flush=True)
    await public_candidates(output)


if __name__ == '__main__':
    asyncio.run(run())
