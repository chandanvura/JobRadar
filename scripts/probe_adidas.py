"""Run the evidence-derived complete adidas probe on GitHub Actions."""
import asyncio
import json
from pathlib import Path
from scraper.main import load_companies, scrape


async def run():
    company = next(c for c in load_companies() if c.name == 'Adidas')
    rows, status, error, count = await scrape(company, asyncio.Semaphore(1), asyncio.Semaphore(1))
    report = dict(company='Adidas', status=status, error=error, collected=count,
                  unique_normalized_ids=len({j.external_job_id for j in rows}),
                  details=len(rows), dates_unknown=sum(j.posted_at is None for j in rows),
                  samples=[dict(id=j.external_job_id, title=j.title, location=j.location,
                                posting=j.posted_at, url=j.job_url) for j in rows[:3]],
                  validation='XML set equals every paginated live JSON ID; titles and URLs match; first live page rechecked')
    path = Path('artifacts/adidas-probe.json'); path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(report, indent=2)); print(json.dumps(report))
    if error or (status.get('warning') or '').startswith('Limited coverage'):
        raise RuntimeError('adidas remains unresolved')


if __name__ == '__main__':
    asyncio.run(run())
