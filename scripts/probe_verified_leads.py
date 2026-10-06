"""Verify two employer-linked boards without publishing discovery to production."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urlsplit
from bs4 import BeautifulSoup
from scraper.adapters import client, discover_ats, request
from scraper.main import load_companies, scrape

OFFICIAL = {
    'Dream Sports': 'https://www.dreamsports.group/careers/',
    'ThoughtSpot': 'https://www.thoughtspot.com/fr/careers',
}


async def run():
    registry = {c.name: c for c in load_companies()}
    report = []
    for name, official in OFFICIAL.items():
        company = registry[name]
        async with client(timeout=40) as x:
            page = await request(x, 'GET', official); page.raise_for_status()
            lead = discover_ats(BeautifulSoup(page.text, 'html.parser'), str(page.url))
            expected = company.ats_identifier
            if not lead or lead[1] != expected:
                raise ValueError(f'{name}: current official page no longer verifies the board identity')
            board = await request(x, 'GET', company.careers_url); board.raise_for_status()
            board_soup = BeautifulSoup(board.text, 'html.parser')
            title = board_soup.title.get_text(' ', strip=True) if board_soup.title else None
            ui_ids = None
            if company.ats_provider == 'lever':
                ui_ids = {urlsplit(a['href']).path.rstrip('/').split('/')[-1]
                          for a in board_soup.select('a.posting-title[href]')}
        rows, status, error, count = await scrape(company, asyncio.Semaphore(1), asyncio.Semaphore(1))
        if error or (status.get('warning') or '').startswith('Limited coverage'):
            raise ValueError(f'{name}: complete HTTP collection failed: {error or status.get("warning")}')
        ids = {j.external_job_id for j in rows}
        if company.ats_provider == 'lever' and (not ui_ids or ui_ids != ids or len(ids) != count
                                               or any(not j.description for j in rows)):
            raise ValueError(f'{name}: Lever live UI IDs or full requirements do not reconcile')
        item = dict(company=name, official=official, actual_board=company.careers_url,
                    identity_lead=lead, board_title=title, status=status, collected=count,
                    normalized_details=len(rows), unique_detail_ids=len(ids),
                    payload='GET public Lever JSON without a limit' if company.ats_provider == 'lever' else 'POST CXS jobs, limit=20, offsets +20; final first-page check',
                    samples=[dict(id=j.external_job_id, title=j.title, location=j.location, posting=j.posted_at,
                                  url=j.job_url) for j in rows[:3]])
        report.append(item); print(json.dumps(item), flush=True)
    output = Path('artifacts/verified-leads.json'); output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2))


if __name__ == '__main__':
    asyncio.run(run())
