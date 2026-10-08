"""Actions-only release gate for the complete official Kissflow careers feed."""
import asyncio
import hashlib
import json
from pathlib import Path
from scraper import adapters
from scraper.kissflow import BOARD
from scraper.main import fetch_company_jobs
from scraper.models import Company


async def run():
    output = Path('artifacts/kissflow-release')
    output.mkdir(parents=True, exist_ok=True)
    original = adapters.request
    responses = []
    async def capture(client, method, url, **kwargs):
        response = await original(client, method, url, **kwargs)
        artifact = str(len(responses)) + '.body'
        (output / artifact).write_text(response.text)
        responses.append(dict(url=str(response.url), method=method, status=response.status_code,
                              sha256=hashlib.sha256(response.content).hexdigest(), artifact=artifact))
        return response
    adapters.request = capture
    try:
        jobs, total = await fetch_company_jobs(Company('Kissflow', BOARD, 'kissflow', 'kissflow'))
        unique = len({job.external_job_id for job in jobs})
        if total != len(jobs) or unique != total or any(not job.description for job in jobs):
            raise ValueError('Kissflow complete IDs and full descriptions did not reconcile')
        report = dict(company='Kissflow', status='COMPLETE_ACTIONS_NOT_PRODUCTION',
                      official_chain=['https://kissflow.com/', BOARD], listed=total,
                      unique_ids=unique, full_descriptions=len(jobs),
                      scope='All roles in employer-published static Open Positions list',
                      published_total_type='Static role cards; no separate numeric API total',
                      jobs=[dict(id=j.external_job_id,title=j.title,location=j.location,
                                 description_length=len(j.description),posting=j.posted_at,url=j.job_url) for j in jobs],
                      responses=responses)
        (output / 'evidence.json').write_text(json.dumps(report, indent=2))
        print(json.dumps(report), flush=True)
    finally:
        adapters.request = original


if __name__ == '__main__':
    asyncio.run(run())
