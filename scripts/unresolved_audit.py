"""Recheck a maximum of 50 unresolved feeds on Actions, without publishing jobs."""
import argparse
import asyncio
import json
from datetime import datetime, timezone
from pathlib import Path

from scraper.main import load_companies, scrape
from scripts.ats_detective import validate_names


async def run(manifest, output):
    registry = {company.name: company for company in load_companies() if company.enabled}
    names = validate_names(manifest['companies'], registry)
    semaphore = asyncio.Semaphore(3)
    custom = asyncio.Semaphore(2)

    async def check(name):
        company = registry[name]
        try:
            jobs, status, error, total = await asyncio.wait_for(
                scrape(company, semaphore, custom), timeout=180)
            warning = status.get('warning') or ''
            state = ('SOURCE_ERROR' if error else 'LIMITED' if warning.startswith('Limited coverage')
                     else 'CANDIDATE_COMPLETE_IDENTITY_REVIEW_REQUIRED')
            case = dict(company=name, provider=company.ats_provider, careers_url=company.careers_url,
                        identifier=company.ats_identifier, state=state, collection=status, error=error,
                        reported_listings=total, candidates=len(jobs),
                        unique_candidate_ids=len({job.external_job_id for job in jobs}),
                        missing_descriptions=sum(not job.description for job in jobs),
                        unknown_dates=sum(job.posted_at is None for job in jobs))
        except TimeoutError:
            case = dict(company=name, state='SOURCE_ERROR', error='Bounded source audit timed out')
        print(json.dumps(case), flush=True)
        return case

    cases = await asyncio.gather(*(check(name) for name in names))
    report = dict(batch=manifest['batch'], checked_at=datetime.now(timezone.utc).isoformat(),
                  production_writes=0, cases=cases,
                  note='Successful collection is a candidate; official identity must still be reviewed.')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    asyncio.run(run(json.loads(args.manifest.read_text()), args.output))


if __name__ == '__main__':
    main()
