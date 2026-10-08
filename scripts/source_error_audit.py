"""Read-only Actions capture of current errors, without changing source mappings."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urlsplit

from scraper import adapters
from scraper.avature import listing_page
from scraper.main import fetch_company_jobs, load_companies


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


if __name__ == '__main__':
    asyncio.run(run())
