"""Probe endpoints derived from the public Jibe search application on Actions."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urljoin
from bs4 import BeautifulSoup
from scraper.adapters import client, request

JIBE={
 'AMD':'https://careers.amd.com/careers-home/jobs',
 'AXA':'https://careers.axa.com/jobs',
 'GitHub':'https://www.github.careers/careers-home/jobs',
 'DocuSign':'https://careers.docusign.com/jobs',
 'Costco':'https://careers.costco.com/jobs',
 'Avalara':'https://careers.avalara.com/',
}
# These are observed official links, not fabricated tenants.
BOARDS={
 'SAS':'https://globalcareers-sas.icims.com/jobs/intro',
 'DocuSign India':'https://indiacareers-docusign.icims.com/',
 'Moneyview':'https://moneyview.darwinbox.in/ms/candidate/careers',
 'Tredence':'https://tredence.ripplehire.com/candidate/',
 'NetApp':'https://careers.netapp.com/search-jobs',
 'Deutsche Boerse Group':'https://careers.deutsche-boerse.com/',
 'Avalara current':'https://app.careerpuck.com/job-board/avalara',
}

async def run():
    out=Path('artifacts/ats-endpoints-2026-10-07');out.mkdir(parents=True,exist_ok=True);cases=[]
    async with client(timeout=30) as x:
        for name,url in JIBE.items():
            folder=out/name;folder.mkdir(exist_ok=True);case=dict(company=name,pages=[]);cases.append(case)
            try:
                page=await request(x,'GET',url);page.raise_for_status();(folder/'board.html').write_text(page.text)
                soup=BeautifulSoup(page.text,'html.parser')
                assets=[urljoin(str(page.url),s['src']) for s in soup.select('script[src]') if 'search/' in s['src'] and 'main.js' in s['src']]
                if len(assets)!=1:raise ValueError('Current board no longer links the evidence-derived Jibe search application')
                asset=await request(x,'GET',assets[0]);asset.raise_for_status()
                if 'this.http.get("/api/jobs"' not in asset.text or 'searchJobBySlug' not in asset.text:raise ValueError('Published script no longer verifies jobs endpoints')
                endpoint=urljoin(str(page.url),'/api/jobs')
                r=await request(x,'GET',endpoint,params={'page':1,'limit':20,'internal':'false'})
                case['pages'].append(dict(url=str(r.url),status=r.status_code,content_type=r.headers.get('content-type')))
                r.raise_for_status();d=r.json();(folder/'listing.json').write_text(json.dumps(d,indent=2))
                case['keys']=list(d);case['counts']={k:v for k,v in d.items() if isinstance(v,(int,str)) and k not in ['request_id']}
                jobs=d.get('jobs') or [];case['jobs_on_page']=len(jobs)
                # Public payload tells the detail slug; never guess an identifier.
                if name in ('AMD','AXA') and any(v.get('term')=='India' for v in d.get('filter',{}).get('facetList',{}).get('country',[])):
                    filtered=await request(x,'GET',endpoint,params={'page':1,'limit':20,'internal':'false','country':'India'});filtered.raise_for_status();(folder/'india.json').write_text(json.dumps(filtered.json(),indent=2));case['india_count']=filtered.json().get('count');case['india_total']=filtered.json().get('totalCount')
                if jobs:
                    case['job_fields']=list(jobs[0]);slug=jobs[0].get('data',jobs[0]).get('slug')
                    if slug:
                        detail=await request(x,'GET',endpoint+'/'+slug);case['pages'].append(dict(url=str(detail.url),status=detail.status_code));detail.raise_for_status();(folder/'detail.json').write_text(json.dumps(detail.json(),indent=2))
            except Exception as exc:case['blocker']=str(exc)
            print(json.dumps(case),flush=True)
        for name,url in BOARDS.items():
            folder=out/name;folder.mkdir(exist_ok=True);case=dict(company=name,pages=[]);cases.append(case)
            try:
                headers={'User-Agent':'Mozilla/5.0 (compatible; JobRadar/1.2; public employer feed research)','Accept':'text/html,application/xhtml+xml'} if name=='Moneyview' else {}
                r=await request(x,'GET',url,headers=headers);r.raise_for_status();(folder/'board.html').write_text(r.text)
                soup=BeautifulSoup(r.text,'html.parser');case.update(bytes=len(r.content),title=soup.title.get_text() if soup.title else None,scripts=[urljoin(str(r.url),s['src']) for s in soup.select('script[src]')])
                links=list(dict.fromkeys(urljoin(str(r.url),a['href']) for a in soup.select('a[href]')))
                forms=[urljoin(str(r.url),f['action']) for f in soup.select('form[action]') if '/jobs/search' in f['action']]
                search=next(iter(forms),None) or next((u for u in links if '/jobs/search' in u or '/search-jobs' in u and '/search-jobs' not in str(r.url)),None)
                if search:
                    r=await request(x,'GET',search);r.raise_for_status();(folder/'search.html').write_text(r.text);case['search_url']=str(r.url)
                # RequireJS module URL is published in data-main, not script src.
                modules=[urljoin(str(r.url),s['data-main']) for s in soup.select('script[data-main]')]
                case['data_main']=modules
                if name=='Avalara current':
                    for i,script in enumerate(case['scripts']):
                        if 'app.careerpuck.com' in script:
                            a=await request(x,'GET',script)
                            if a.status_code==200:(folder/f'asset-{i}.js').write_text(a.text)
                for module in modules:
                    u=module if module.endswith('.js') else module+'.js'
                    a=await request(x,'GET',u);case['pages'].append(dict(url=u,status=a.status_code));a.raise_for_status();(folder/'module.js').write_text(a.text)
                    # Follow literal RequireJS application dependencies only.
                    import re
                    deps=re.findall(r'[\"\'](app|apps/[^\"\']+|entities/[^\"\']+)[\"\']',a.text)
                    for i,dep in enumerate(dict.fromkeys(deps)):
                        target=urljoin(u,dep+'.js');asset=await request(x,'GET',target);case['pages'].append(dict(url=target,status=asset.status_code))
                        if asset.status_code==200:(folder/f'dep-{i}.js').write_text(asset.text)
            except Exception as exc:case['blocker']=str(exc)
            print(json.dumps(case),flush=True)
        a=await request(x,'GET','https://wac-cdn.atlassian.com/static/master/11535/assets/build/js/96486.js')
        (out/'atlassian-jsx.js').write_text(a.text)
    (out/'evidence.json').write_text(json.dumps(cases,indent=2))

if __name__=='__main__':asyncio.run(run())
