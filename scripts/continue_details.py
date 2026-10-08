"""Inspect only endpoints and detail links published in this Actions capture."""
import asyncio
import hashlib
import json
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from scraper.adapters import client, request


async def run():
    root = Path('artifacts/continue-evidence')
    evidence = json.loads((root / 'evidence.json').read_text())
    async with client(timeout=40) as x:
        for case in evidence['cases']:
            if case['company'] != 'Upstox':
                continue
            for page in case['pages']:
                artifact = page.get('artifact', '')
                if not artifact.endswith('.js'):
                    continue
                text = (root / artifact).read_text()
                endpoint = 'https://service.upstox.com/content/open/v1/jobs/'
                if endpoint not in text:
                    continue
                start = text.index(endpoint)
                print(json.dumps({'company': 'Upstox', 'published_consumer': text[max(0,start-1200):start+6000]}), flush=True)
                response = await request(x, 'GET', endpoint)
                response.raise_for_status()
                (root / 'upstox-list.json').write_text(response.text)
                print(json.dumps({'company': 'Upstox', 'url': str(response.url), 'http_status': response.status_code, 'sha256': hashlib.sha256(response.content).hexdigest(), 'payload': response.json()}), flush=True)
        for case in evidence['cases']:
            if case['company'] not in ('Jumbotail', 'Kissflow', 'Dynatrace'):
                continue
            page = next(p for p in case['pages'] if p.get('artifact','').endswith('.html'))
            soup = BeautifulSoup((root / page['artifact']).read_text(), 'html.parser')
            if case['company'] == 'Dynatrace':
                for p in case['pages']:
                    if p.get('artifact','').endswith('.html') and '/jobs/' in p['url']:
                        doc = BeautifulSoup((root / p['artifact']).read_text(), 'html.parser')
                        print(json.dumps({'company': 'Dynatrace', 'inline_modules': [s.get_text()[:15000] for s in doc.select('script:not([src])') if s.get('type') == 'module']}), flush=True)
                continue
            nodes = [a for a in soup.select('a[href]') if 'view job' in a.get_text(' ',strip=True).lower() or 'explore more' in a.get_text(' ',strip=True).lower()]
            print(json.dumps({'company':case['company'], 'role_elements':[str(a.parent)[:4000] for a in nodes]}), flush=True)
            for index, a in enumerate(nodes[:2]):
                url = urljoin(page['final_url'], a['href'])
                if not url.startswith('https://'):
                    continue
                response = await request(x, 'GET', url)
                print(json.dumps({'company':case['company'], 'detail_url':str(response.url), 'http_status':response.status_code, 'detail_html':response.text[:2000], 'detail_text':BeautifulSoup(response.text,'html.parser').get_text(' ',strip=True)[-16000:]}), flush=True)
                (root / (case['company']+f'-detail-{index}.html')).write_text(response.text)


if __name__ == '__main__':
    asyncio.run(run())
