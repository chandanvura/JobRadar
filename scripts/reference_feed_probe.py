"""Actions-only first-party probes for endpoints published in reviewed GitHub code.

Secondary implementations are leads, never employer-ownership or coverage proof.
Every failure is retained; this script cannot write the registry or production.
"""
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup
from scraper.adapters import client, request, jsonld_objects
from scripts.ats_deep import public_references

OUT = Path('artifacts/reference-feed-probes')

async def run():
    OUT.mkdir(parents=True, exist_ok=True)
    cases = []
    async with client(timeout=40) as x:
        async def capture(case, method, url, label, **kwargs):
            r = await request(x, method, url, **kwargs)
            (OUT / (label + '.body')).write_text(r.text)
            case['requests'].append(dict(method=method, url=url, final_url=str(r.url),
                http_status=r.status_code, sha256=hashlib.sha256(r.content).hexdigest(),
                artifact=label + '.body'))
            r.raise_for_status()
            return r

        async def detail(case, url, label, allowed_host):
            p = urlparse(url)
            if p.scheme != 'https' or p.hostname != allowed_host:
                raise ValueError('Published detail URL does not match employer host')
            r = await capture(case, 'GET', url, label)
            soup = BeautifulSoup(r.text, 'html.parser')
            nodes = list(jsonld_objects(soup))
            case.setdefault('sample_details', []).append(dict(url=url,
                jsonld_jobs=len(nodes), title=soup.title.get_text(' ', strip=True) if soup.title else None,
                job_nodes=nodes))

        case = dict(company='IBM', status='UNVERIFIED', requests=[],
            endpoint_reference='https://github.com/Esteban-PG/Job-alert-bot/blob/6895e99a4853a9e226d0c0af65c494de319c6bd6/jobbot/fetchers/ibm.py')
        cases.append(case)
        try:
            page = await capture(case, 'GET', 'https://www.ibm.com/careers/search', 'ibm-board')
            if not all(s in page.text for s in ['careerSearchScope', 'careers2', 'careerSearchAppId', "appid: 'careers'", "language: 'zz'", 'India']):
                raise ValueError('Current IBM search configuration does not corroborate endpoint payload')
            body = dict(appId='careers', scopes=['careers2'], query={'bool': {'must': []}},
                post_filter={'term': {'field_keyword_05': 'India'}}, size=30, sort=[{'_score': 'desc'}, {'pageviews': 'desc'}],
                lang='zz', localeSelector={}, sm={'query': '', 'lang': 'zz'},
                _source=['_id', 'title', 'url', 'description', 'language', 'field_keyword_05', 'field_keyword_08', 'field_keyword_17', 'field_keyword_18', 'field_keyword_19'],
                aggs={'all_countries': {'filter': {'match_all': {}}, 'aggs': {'field_keyword_05': {'terms': {'field': 'field_keyword_05', 'size': 1000}}}}})
            case['payload'] = body
            for offset in [0, 30]:
                response = await capture(case, 'POST', 'https://www-api.ibm.com/search/api/v2', 'ibm-search-' + str(offset), json={**body, 'from': offset})
                data = response.json(); hits = data.get('hits', {})
                case.setdefault('pages', []).append(dict(offset=offset, total=hits.get('total'), count=len(hits.get('hits', []))))
                if offset == 0:
                    countries = data.get('aggregations', {}).get('all_countries', {}).get('field_keyword_05', {}).get('buckets', [])
                    case['country_facet'] = countries
                    rows = hits.get('hits', [])
                    if rows:
                        source = rows[0].get('_source', {})
                        case['first_record'] = source
                        await detail(case, source['url'], 'ibm-detail', 'careers.ibm.com')
            case['status'] = 'PUBLIC_PROBE_ONLY'
        except Exception as exc: case['blocker'] = type(exc).__name__ + ': ' + str(exc)[:300]
        print(json.dumps({k: v for k, v in case.items() if k in ['company', 'status', 'blocker', 'pages']}), flush=True)

        case = dict(company='Dassault Systemes', status='UNVERIFIED', requests=[],
            endpoint_reference='https://github.com/career-ops-hq/career-ops/blob/3be1cdf033d54e977c9770441122c9e7cf3c823f/providers/dassault.mjs')
        cases.append(case)
        try:
            page = await capture(case, 'GET', 'https://www.3ds.com/careers/jobs', 'dassault-board')
            if 'Dassault Syst' not in page.text or 'exaleadApi' not in page.text or 'card_content_type' not in page.text:
                raise ValueError('Current Dassault careers configuration is not corroborated')
            params = [('lang', 'en'), ('r', 'f/card_content_type/career'), ('r', 'f/card_content_categories_facet/cards language/en'), ('start', '0')]
            case['params'] = params
            response = await capture(case, 'GET', 'https://www.3ds.com/apisearch/card_search_api', 'dassault-search', params=params)
            from defusedxml import ElementTree as ET
            root = ET.fromstring(response.text)
            case['xml_root'] = root.tag
            case['xml_attributes'] = root.attrib
            hits = root.findall('.//{*}Hit'); case['first_page_count'] = len(hits)
            if hits:
                fields = {m.get('name'): m.findtext(".//{*}MetaString[@name='value']") for m in hits[0].findall('.//{*}Meta')}
                case['first_record'] = fields
                await detail(case, fields['content_cta_1_url'], 'dassault-detail', 'www.3ds.com')
            case['status'] = 'PUBLIC_PROBE_ONLY'
        except Exception as exc: case['blocker'] = type(exc).__name__ + ': ' + str(exc)[:300]
        print(json.dumps({k: v for k, v in case.items() if k in ['company', 'status', 'blocker', 'first_page_count', 'xml_root', 'xml_attributes']}), flush=True)

        for name, board in [('Siemens', 'https://jobs.siemens.com/careers'), ('Infineon Technologies', 'https://jobs.infineon.com/careers')]:
            case = dict(company=name, status='UNVERIFIED', requests=[]); cases.append(case)
            try:
                label = name.lower().split()[0]
                page = await capture(case, 'GET', board, label + '-board')
                soup = BeautifulSoup(page.text, 'html.parser')
                links, scripts = public_references(soup, str(page.url)); case['published_links'] = links; case['published_scripts'] = scripts
                if name == 'Siemens':
                    target = next(u for u in links if '/SearchJobs' in u and urlparse(u).hostname == 'jobs.siemens.com')
                    result = await capture(case, 'GET', target, 'siemens-search')
                    case['search_url'] = str(result.url)
                    ss = BeautifulSoup(result.text, 'html.parser')
                    case['result_text'] = ss.get_text(' ', strip=True)
                    job_links = list(dict.fromkeys(urljoin(str(result.url), a['href']) for a in ss.select('a[href*="/JobDetail/"]')))
                    case['first_page_urls'] = job_links
                    if job_links: await detail(case, job_links[0], 'siemens-detail', 'jobs.siemens.com')
                else:
                    config = soup.find('code', id='pcsx-data')
                    if not config: raise ValueError('Published Eightfold PCSX configuration missing')
                    cfg = json.loads(config.get_text()); case['pcsx_config'] = cfg
                    domain = cfg.get('domain')
                    if not domain or not re.fullmatch(r'[\w.-]+', domain): raise ValueError('Published domain missing')
                    result = await capture(case, 'GET', 'https://jobs.infineon.com/api/pcsx/search', 'infineon-search', params={'domain': domain, 'query': '', 'location': 'India', 'start': 0, 'sort_by': 'timestamp'})
                    case['search_response'] = result.json()
                case['status'] = 'PUBLIC_PROBE_ONLY'
            except Exception as exc: case['blocker'] = type(exc).__name__ + ': ' + str(exc)[:300]
            print(json.dumps({k: v for k, v in case.items() if k in ['company', 'status', 'blocker', 'search_url']}), flush=True)
    (OUT / 'evidence.json').write_text(json.dumps(dict(cases=cases, production_writes=0, complete_feeds=0), indent=2))

if __name__ == '__main__': asyncio.run(run())
