"""Read-only Actions validation from captured official HTML; no guessed boards."""
import asyncio
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlsplit
from bs4 import BeautifulSoup
from scraper import adapters
from scraper.main import fetch_company_jobs
from scraper.models import Company

ROOT=Path('artifacts/next-evidence')
OUT=Path('artifacts/next-probe')


def normalized(url):
    parts=urlsplit(url)
    path=parts.path.rstrip('/')
    if (parts.hostname or '').endswith('.myworkdayjobs.com'):
        path=re.sub(r'^/[a-z]{2}(?:-[a-z]{2})?(?=/)', '', path, flags=re.I)
    return parts.netloc.lower()+path


def chain_to_board(pages, root_url, board_url):
    """Require a path through real published links, with captured redirects."""
    graph={}
    for page in pages:
        origin=normalized(page.get('final_url',page['url']))
        graph.setdefault(normalized(page['url']),set()).add(origin)
        graph.setdefault(origin,set()).update(normalized(url) for url in page.get('links',[]))
    target=normalized(board_url);queue=[(normalized(root_url),[root_url])];seen=set()
    while queue:
        current,path=queue.pop(0)
        if current in seen:continue
        seen.add(current)
        if current==target or current.startswith(target+'/job/'):
            return path
        queue.extend((next_url,path+[next_url]) for next_url in graph.get(current,set()) if next_url not in seen)
    return None


async def run():
    OUT.mkdir(parents=True,exist_ok=True)
    evidence=json.loads((ROOT/'evidence.json').read_text())
    manifest=json.loads(Path('companies/ats-next-2026-10-08.json').read_text())
    results=[]
    original=adapters.request
    for case in evidence['cases']:
        name=case['company'];result={'company':name,'status':'UNRESOLVED'};records=[]
        async def capture(client,method,url,**kwargs):
            response=await original(client,method,url,**kwargs)
            digest=hashlib.sha256(response.content).hexdigest()
            file=f"{name.replace(' ','-')}-{len(records)}.body"
            (OUT/file).write_text(response.text)
            records.append({'url':str(response.url),'method':method,'payload':kwargs.get('json'),'status':response.status_code,'sha256':digest,'artifact':file})
            return response
        adapters.request=capture
        try:
            pages=list(case['pages']);detected=[];job_links=[]
            for page in pages:
                artifact=page.get('artifact','')
                if not artifact.endswith('.html'):continue
                text=(ROOT/artifact).read_text()
                soup=BeautifulSoup(text,'html.parser')
                page.setdefault('links',[]).extend(page.get('scripts',[]))
                found=adapters.discover_ats(soup,page['final_url'])
                if found and found[0]=='workday':
                    detected.append(found);page.setdefault('links',[]).append(found[2])
                for anchor in soup.select('a[href]'):
                    url=urljoin(page['final_url'],anchor['href'])
                    if '/job/' in urlsplit(url).path and urlsplit(url).hostname==urlsplit(page['final_url']).hostname:
                        job_links.append((url,page['final_url']))
            async with adapters.client(timeout=40) as client:
                if name=='HubSpot':
                    scripts='\n'.join((ROOT/page['artifact']).read_text() for page in pages if page.get('artifact','').endswith('.js') and 'careers' in page['url'])
                    endpoints=set(re.findall(r'serverUrl:\s*"(https://[^"\s]+)"',scripts))
                    if len(endpoints)!=1:raise ValueError('No unique published HubSpot GraphQL endpoint')
                    endpoint=endpoints.pop();query=json.loads(Path('companies/hubspot-public-queries.json').read_text())['Jobs']
                    compact=lambda text:re.sub(r'[\s,]','',text.replace('\\n','\n'))
                    if compact(query) not in compact(scripts):raise ValueError('Published HubSpot Jobs payload changed')
                    response=await capture(client,'POST',endpoint,json={'operationName':'Jobs','query':query,'variables':{}})
                    response.raise_for_status();payload=response.json();jobs=(payload.get('data') or {}).get('jobs')
                    result.update(endpoint=endpoint,errors=payload.get('errors'),jobs_is_list=isinstance(jobs,list))
                    if not isinstance(jobs,list) or payload.get('errors'):raise ValueError('Official HubSpot jobs backend did not return a usable inventory')
                    result.update(status='PUBLIC_LIST_REQUIRES_DETAIL_VERIFICATION',advertised_total=len(jobs))
                else:
                    if name=='Southwest Airlines':
                        # Read only literal career links from scripts linked by the official root.
                        published=[]
                        for source in pages.copy():
                            artifact=source.get('artifact','')
                            if not artifact.endswith('.js') or urlsplit(source['url']).hostname!='www.southwest.com':continue
                            text=(ROOT/artifact).read_text()
                            links=re.findall(r'https://[^\s\"\'<>\\]+',text)
                            careers=[url for url in links if urlsplit(url).hostname=='careers.southwestair.com']
                            source.setdefault('links',[]).extend(careers)
                            published.extend(careers)
                        for url in list(dict.fromkeys(published))[:3]:
                            response=await capture(client,'GET',url)
                            if response.status_code!=200:continue
                            soup=BeautifulSoup(response.text,'html.parser')
                            links=[urljoin(str(response.url),a['href']) for a in soup.select('a[href]')]
                            found=adapters.discover_ats(soup,str(response.url))
                            if found and found[0]=='workday':links.append(found[2]);detected.append(found)
                            pages.append({'url':url,'final_url':str(response.url),'links':links})
                    if not detected:
                        for url,parent in list(dict.fromkeys(job_links))[:2]:
                            response=await capture(client,'GET',url);response.raise_for_status()
                            soup=BeautifulSoup(response.text,'html.parser')
                            links=[urljoin(str(response.url),a['href']) for a in soup.select('a[href]')]
                            pages.append({'url':url,'final_url':str(response.url),'links':links,'linked_from':parent})
                            found=adapters.discover_ats(soup,str(response.url))
                            if found and found[0]=='workday':
                                detected.append(found);pages[-1]['links'].append(found[2])
                    tenants={identifier for _,identifier,_ in detected}
                    if len(tenants)!=1:raise ValueError('No unique employer-published Workday tenant/site')
                    tenant_site=tenants.pop();published=next(url for _,identifier,url in detected if identifier==tenant_site)
                    parsed=urlsplit(published);tenant,site=tenant_site.split('|')
                    board=f'https://{parsed.netloc}/{site}'
                    official_root=manifest['evidence_links'][name][0]
                    chain=chain_to_board(pages,official_root,board)
                    if not chain:raise ValueError('Official root to this exact Workday board link chain is incomplete')
                    scope=tenant_site+'|India' if name in {'Vanguard','Southwest Airlines'} else tenant_site
                    company=Company(name,board,'workday_all',scope)
                    jobs,total=await fetch_company_jobs(company)
                    unique=len({job.external_job_id for job in jobs})
                    warning=getattr(jobs,'coverage_warning',None)
                    if warning or total!=len(jobs) or unique!=total or any(not job.description for job in jobs):
                        raise ValueError('Workday India full totals, unique IDs and details did not reconcile')
                    result.update(status='COMPLETE_ACTIONS_NOT_PRODUCTION',official_chain=chain,board=board,identifier=company.ats_identifier,
                                  advertised_total=total,details=len(jobs),unique_ids=unique,unknown_dates=sum(job.posted_at is None for job in jobs),
                                  unknown_locations=sum(job.location in ('','Not specified') for job in jobs),missing_descriptions=0)
        except Exception as exc:
            result['error']=type(exc).__name__+': '+str(exc)
        finally:adapters.request=original
        result['responses']=records;results.append(result)
        print(json.dumps({key:value for key,value in result.items() if key!='responses'}),flush=True)
    (OUT/'evidence.json').write_text(json.dumps(results,indent=2))


if __name__=='__main__':asyncio.run(run())
