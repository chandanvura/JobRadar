"""Summarize captured public career evidence; never grant feed completeness."""
import json
import re
from pathlib import Path
from urllib.parse import urlsplit
from bs4 import BeautifulSoup


def main():
    root = Path('artifacts/continue-evidence')
    evidence = json.loads((root / 'evidence.json').read_text())
    for case in evidence['cases']:
        print('EMPLOYER ' + case['company'], flush=True)
        for page in case['pages']:
            safe = {key: page[key] for key in ('url', 'final_url', 'http_status', 'title', 'blocker', 'sha256') if key in page}
            print(json.dumps(safe), flush=True)
            artifact = page.get('artifact')
            if not artifact:
                continue
            text = (root / artifact).read_text()
            if artifact.endswith('.html'):
                soup = BeautifulSoup(text, 'html.parser')
                links = [url for url in page.get('links', []) if re.search(r'career|job|position|opening|lever|greenhouse|ashby|workday', url, re.I)]
                print(json.dumps({'published_links': links[:60], 'scripts': page.get('scripts', [])[:20]}), flush=True)
                for node in soup.select('script,style,nav,footer,header'):
                    node.decompose()
                visible = soup.get_text(' ', strip=True)
                print(json.dumps({'visible_text': visible[:10000]}), flush=True)
            else:
                # Only literal read-only discovery clues from captured assets.
                literals = re.findall(r'''["'](https://[^"'\s<>]+|/[^"'\s<>]{1,180})["']''', text)
                urls = [url for url in dict.fromkeys(literals) if re.search(r'career|job|position|opening|lever|greenhouse|ashby|workday', url, re.I) and not urlsplit(url).query]
                print(json.dumps({'public_asset_clues': urls[:80]}), flush=True)


if __name__ == '__main__':
    main()
