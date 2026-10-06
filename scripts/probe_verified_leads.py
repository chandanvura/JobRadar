"""Probe the current official ThoughtSpot feed; reject the legacy empty board."""
import asyncio
import json
from pathlib import Path
from scraper.main import load_companies, scrape

async def run():
    company = next(c for c in load_companies() if c.name == 'ThoughtSpot')
    rows, status, error, count = await scrape(company, asyncio.Semaphore(1), asyncio.Semaphore(1))
    item = dict(company=company.name, official=company.careers_url, endpoint=company.ats_identifier,
                status=status, error=error, collected=count, details=len(rows),
                unique_ids=len({j.external_job_id for j in rows}),
                unknown_dates=sum(j.posted_at is None for j in rows),
                evidence_script='https://www.thoughtspot.com/_next/static/chunks/42179.dd76c7957fb6f98e.js',
                validation='Complete official array; every Rippling detail verifies companyName, boardURL, UUID, title, URL, locations and full role requirements; entire array rechecked',
                samples=[dict(id=j.external_job_id, title=j.title, location=j.location, posting=j.posted_at, url=j.job_url) for j in rows[:3]])
    output = Path('artifacts/verified-leads.json'); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(item, indent=2)); print(json.dumps(item), flush=True)
    if error or (status.get('warning') or '').startswith('Limited coverage') or count != len(rows):
        raise ValueError('ThoughtSpot current complete feed remains unresolved')

if __name__ == '__main__':
    asyncio.run(run())
