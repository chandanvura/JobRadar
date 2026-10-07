"""Read-only follow-up probes for current SAS and NetApp public links."""
import asyncio
import json
from pathlib import Path
from urllib.parse import urljoin,urlsplit,parse_qs
from bs4 import BeautifulSoup
from scraper.adapters import client,request,jsonld_objects

async def run():
    out=Path('artifacts/ats-followups-2026-10-07');out.mkdir(parents=True,exist_ok=True);cases=[]
    async with client(timeout=40) as x:
        case=dict(company='SAS',pages=[],status='UNVERIFIED');cases.append(case)
        try:
            r=await request(x,'GET','https://globalcareers-sas.icims.com/jobs/intro');r.raise_for_status()
            soup=BeautifulSoup(r.text,'html.parser');form=next(f for f in soup.select('form[action]') if '/jobs/search' in f['action']);url=urljoin(str(r.url),form['action'])
            ids=set();links={};first=None;expected=None
            for page in range(40):
                r=await request(x,'GET',url);r.raise_for_status();(out/f'sas-{page}.html').write_text(r.text)
                soup=BeautifulSoup(r.text,'html.parser');selected=soup.select_one('.iCIMS_PagingBatch a.selected')
                import re
                m=re.search(r'Page\s*(\d+)\s*of\s*(\d+)',selected.get_text(' ',strip=True) if selected else '')
                if not m or int(m[1])!=page+1:raise ValueError('SAS advertised page is missing or unexpected')
                total=int(m[2])
                if expected is None:expected=total
                if total!=expected:raise ValueError('SAS total pages changed')
                rows=soup.select('.iCIMS_JobsTable .row');this={}
                for row in rows:
                    a=row.select_one('.title a[href]');href=urljoin(str(r.url),a['href']);path=urlsplit(href);match=re.match(r'/jobs/(\d+)/',path.path)
                    if not match or path.hostname not in ('global-sas.icims.com','globalcareers-sas.icims.com','careers-sas.icims.com','ideasglobal-sas.icims.com'):raise ValueError('SAS listed detail does not match observed employer portals')
                    if match[1] in ids or match[1] in this:raise ValueError('SAS repeated job identifier')
                    this[match[1]]=href
                if not this:raise ValueError('SAS omitted advertised listings')
                if first is None:first=this
                ids.update(this);links.update(this);case['pages'].append(dict(url=str(r.url),advertised_pages=total,jobs=len(this)))
                next_link=next((a for a in soup.select('a[href]') if re.search(r'\bnext\b',(a.get('title') or '')+' '+a.get_text(' ',strip=True),re.I) and 'invisible' not in a.get('class',[])),None)
                if page+1==total:
                    if next_link:raise ValueError('SAS advertised last page still has next')
                    break
                if not next_link:raise ValueError('SAS omitted next page before its advertised last page')
                url=urljoin(str(r.url),next_link['href'])
                if urlsplit(url).hostname!='globalcareers-sas.icims.com' or parse_qs(urlsplit(url).query).get('pr')!=[str(page+1)]:raise ValueError('SAS next link has unexpected scope')
            else:raise ValueError('SAS exceeded bounded listing')
            r=await request(x,'GET',next(iter(links.values())));r.raise_for_status();(out/'sas-first-detail.html').write_text(r.text)
            jobs=list(jsonld_objects(BeautifulSoup(r.text,'html.parser')))
            case.update(status='LISTING_ACTIONS_DETAILS_UNVERIFIED',unique_ids=len(ids),detail_example={k:jobs[0].get(k) for k in ['title','hiringOrganization','datePosted','identifier']} if jobs else None)
        except Exception as exc:case['blocker']=str(exc)
        print(json.dumps(case),flush=True)
        case=dict(company='NetApp',pages=[],status='UNVERIFIED');cases.append(case)
        try:
            url='https://careers.netapp.com/search-jobs';r=await request(x,'GET',url);r.raise_for_status();soup=BeautifulSoup(r.text,'html.parser');search=soup.select_one('#search-results')
            script=next(urljoin(str(r.url),s['src']) for s in soup.select('script[src]') if s['src'].endswith('/search.js'))
            asset=await request(x,'GET',script);asset.raise_for_status();(out/'talentbrew-search.js').write_text(asset.text)
            total=int(search['data-total-results']);pages=int(search['data-total-pages']);size=int(search['data-records-per-page']);ids=set()
            params={key:search.get('data-'+attribute,'') for key,attribute in [('Distance','distance'),('FacetTerm','facet-term'),('FacetType','facet-type'),('SearchResultsModuleName','search-results-module-name'),('SortCriteria','sort-criteria'),('SortDirection','sort-direction'),('SearchType','search-type'),('OrganizationIds','organization-ids'),('ResultsType','results-type')]}
            params.update(RecordsPerPage=size,Keywords='',Location='',ShowRadius='false',IsPagination='True',ActiveFacetID=0)
            endpoint=urljoin(str(r.url),search['data-ajax-url'])
            for page in range(1,pages+1):
                if page==1:doc=soup
                else:
                    params['CurrentPage']=page;response=await request(x,'GET',endpoint,params=params,headers={'X-Requested-With':'XMLHttpRequest'});response.raise_for_status();payload=response.json();(out/f'netapp-{page}.json').write_text(json.dumps(payload));doc=BeautifulSoup(payload['results'],'html.parser')
                this={a['data-job-id'] for a in doc.select('#search-results-list a[data-job-id][href]')}
                if len(this)!=min(size,total-(page-1)*size) or ids & this:raise ValueError('NetApp listing is truncated or repeated')
                for a in doc.select('#search-results-list a[data-job-id][href]'):
                    parts=urlsplit(urljoin(url,a['href'])).path.split('/')
                    if len(parts)<3 or parts[-2]!='27600':raise ValueError('NetApp job link employer ID changed')
                ids.update(this);case['pages'].append(dict(page=page,jobs=len(this)))
            if len(ids)!=total:raise ValueError('NetApp total does not reconcile')
            first_link=soup.select_one('#search-results-list a[data-job-id][href]')
            detail=await request(x,'GET',urljoin(url,first_link['href']));detail.raise_for_status();(out/'netapp-first-detail.html').write_text(detail.text)
            job=list(jsonld_objects(BeautifulSoup(detail.text,'html.parser')))
            case.update(status='LISTING_ACTIONS_DETAILS_UNVERIFIED',advertised_total=total,unique_ids=len(ids),detail_example={k:job[0].get(k) for k in ['title','hiringOrganization','datePosted','identifier','url','jobLocation']} if job else None)
        except Exception as exc:case['blocker']=str(exc)
        print(json.dumps(case),flush=True)
    (out/'evidence.json').write_text(json.dumps(cases,indent=2))

if __name__=='__main__':asyncio.run(run())
