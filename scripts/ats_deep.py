"""Read-only Actions evidence capture: employer HTML and its linked public assets.

No guessed boards, production writes, browser execution or credential extraction.
The bounded artifact retains public bodies for endpoint derivation, while console
output exposes only safe URLs/status/counts. Discovery never grants completeness.
"""
import argparse
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from scraper.adapters import client, request
from scraper.main import load_companies
from scripts.ats_detective import validate_names

EXCLUDE = re.compile(r'googletagmanager|google-analytics|analytics|sentry|transcend|cookie|consent|facebook|polyfill|jquery|flickity|lottie|bootstrap', re.I)

def public_references(soup, page_url):
    """Read published links, including browser module-preload dependencies."""
    base = soup.select_one('base[href]')
    base_url = urljoin(page_url, base['href']) if base else page_url
    links = [urljoin(base_url, node.get('href') or node.get('src'))
             for node in soup.select('a[href],iframe[src],link[rel="sitemap"][href],link[rel="alternate"][href]')
             if node.get('href') or node.get('src')]
    assets = [urljoin(base_url, node['src']) for node in soup.select('script[src]')]
    assets += [urljoin(base_url, node['href'])
               for node in soup.select('link[rel="modulepreload"][href],link[rel="preload"][as="script"][href]')]
    # Keka's published wrapper fetches a same-origin career-portal HTML document.
    # Read literal one-argument GET URLs only; never execute scripts or infer paths.
    for node in soup.select('script:not([src])'):
        for path in re.findall(r'''\bfetch\(\s*["']([^"']+)["']\s*\)''', node.get_text()):
            target = urljoin(base_url, path)
            if urlsplit(target).netloc == urlsplit(page_url).netloc:
                links.append(target)
    return list(dict.fromkeys(links)), list(dict.fromkeys(assets))

async def run(manifest, output):
    registry = {c.name: c for c in load_companies() if c.enabled}
    names = validate_names(manifest['companies'], registry)
    asset_limit = manifest.get('max_assets', 24)
    if type(asset_limit) is not int or not 1 <= asset_limit <= 64:
        raise ValueError('Public asset limit must be an integer from 1 to 64')
    output.mkdir(parents=True, exist_ok=True)
    gate = asyncio.Semaphore(3)
    async def investigate(name):
        key = hashlib.sha256(name.encode()).hexdigest()[:12]
        folder = output/key; folder.mkdir(exist_ok=True)
        records=[]; seen=set()
        async with gate, client(timeout=25) as x:
            async def fetch(url, linked_from=None):
                parsed=urlsplit(url)
                if parsed.scheme!='https' or parsed.username or parsed.password or url in seen:return None
                seen.add(url)
                rec=dict(url=url,linked_from=linked_from)
                records.append(rec)
                try:
                    r=await request(x,'GET',url,headers={'Accept':'text/html,application/xhtml+xml'})
                    rec.update(final_url=str(r.url),http_status=r.status_code,content_type=r.headers.get('content-type'),sha256=hashlib.sha256(r.content).hexdigest())
                    if r.status_code!=200:return None
                    if len(r.content)>8_000_000:
                        rec['blocker']='Public body exceeds bounded capture';return None
                    text=r.text
                    if any(t in text.lower() for t in ['cf-chl-','token.awswaf.com','<title>just a moment']):
                        rec['blocker']='Public challenge';return None
                    suffix='.js' if 'javascript' in r.headers.get('content-type','') or parsed.path.endswith('.js') else '.html'
                    p=folder/(str(len(records))+suffix);p.write_text(text);rec['artifact']=str(p.relative_to(output))
                    if suffix=='.js':return text
                    soup=BeautifulSoup(text,'html.parser');rec['title']=soup.title.get_text(' ',strip=True) if soup.title else None
                    rec['links'], rec['scripts'] = public_references(soup, str(r.url))
                    rec['jsonld_blocks']=len(soup.select('script[type="application/ld+json"]'))
                    return soup
                except Exception as exc:
                    rec['blocker']=type(exc).__name__+': '+str(exc)[:180];return None
            starts=[registry[name].careers_url]+manifest.get('evidence_links',{}).get(name,[])
            for url in dict.fromkeys(starts):
                soup=await fetch(url)
                if not isinstance(soup,BeautifulSoup):continue
                source=records[-1]
                linked=[u for u in source.get('links',[]) if urlsplit(u).scheme=='https' and not urlsplit(u).fragment and not EXCLUDE.search(u) and not urlsplit(u).path.endswith(('.css','.jpg','.png','.svg')) and any(t in u.lower() for t in ['jobs','job-board','candidate','careerportal','kula.ai','rippling','greenhouse','lever.co','ashby','workday','workable','smartrecruiters','bamboohr','openings','find-your-job','search-results','search-roles'])]
                linked=list(dict.fromkeys(linked));linked.sort(key=lambda u:0 if any(t in u for t in ['job-board','kula.ai','rippling','greenhouse','lever.co','ashby','workday','workable','smartrecruiters','bamboohr','darwinbox','ripplehire']) else 1);linked=linked[:2]
                for target in linked:await fetch(target,url)
            # Inspect only scripts actually published by fetched employer/board HTML.
            scripts=list(dict.fromkeys((u,p.get('final_url',p['url'])) for p in records.copy() for u in p.get('scripts',[]) if not EXCLUDE.search(u)))
            scripts.sort(key=lambda v:0 if re.search(r'career|search|main[.-]|app/.+page|candidate|bundle|/ef-|/base[.-]',v[0],re.I) else 1)
            for script,parent in scripts[:asset_limit]:await fetch(script,parent)
        case=dict(company=name,status='DISCOVERED_UNVERIFIED',pages=records,production_writes=0)
        (folder/'case.json').write_text(json.dumps(case,indent=2))
        print(json.dumps(dict(company=name,pages=len(records),successful=sum(p.get('http_status')==200 for p in records),status=case['status'])),flush=True)
        return case
    cases=await asyncio.gather(*(investigate(name) for name in names))
    (output/'evidence.json').write_text(json.dumps(dict(batch=manifest['batch'],cases=cases,production_writes=0),indent=2))

def main():
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--output',type=Path,default='artifacts/ats-deep-2026-10-07');a=p.parse_args()
    asyncio.run(run(json.loads(a.manifest.read_text()),a.output))

if __name__=='__main__':main()
