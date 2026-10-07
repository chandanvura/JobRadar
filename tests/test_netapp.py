import json
import pytest
from scraper.netapp import listing,detail
from scraper.snapshot import SnapshotChanged


def page(ids,total=2,current=1):
    links=''.join(f'<a data-job-id="{i}" href="/job/city/engineer/27600/{i}"><h2>Engineer {i}</h2></a>' for i in ids)
    return f'<section id="search-results" data-total-results="{total}" data-total-pages="{max(1,(total+1)//2)}" data-current-page="{current}" data-records-per-page="2"><ul id="search-results-list">{links}</ul></section>'


@pytest.mark.parametrize('failure',[None,'truncated','employer','changed_total','wrong_page'])
def test_advertised_complete_pages_and_employer_links(failure):
    text=page([1,2]);expected=(2,1,2)
    if failure=='truncated':text=page([1])
    if failure=='employer':text=text.replace('/27600/','/9999/')
    if failure=='changed_total':expected=(3,2,2)
    if failure=='wrong_page':text=page([1,2],current=2)
    if failure:
        with pytest.raises((ValueError,SnapshotChanged)):listing(text,expected)
    else:
        totals,rows,_=listing(text);assert totals==expected and set(rows)=={'1','2'}


@pytest.mark.parametrize('failure',[None,'wrong_employer','wrong_job','requirements'])
def test_detail_identity_real_date_and_unknown_location(failure):
    url='https://careers.netapp.com/job/city/engineer/27600/1'
    job=dict(**{'@type':'JobPosting','@context':'https://schema.org'},title='Engineer 1',hiringOrganization=dict(name='NetApp'),url=url,description='<p>Actual Python requirements</p>',datePosted='2026-9-10')
    if failure=='wrong_employer':job['hiringOrganization']['name']='Other'
    if failure=='wrong_job':job['url']=url[:-1]+'2'
    if failure=='requirements':job['description']='UNAVAILABLE'
    text='<script type="application/ld+json">'+json.dumps(job)+'</script>'
    if failure:
        with pytest.raises(ValueError):detail(text,dict(url=url,title='Engineer 1'))
    else:
        parsed=detail(text,dict(url=url,title='Engineer 1'));assert parsed['posted']=='2026-09-10' and parsed['location']=='' and parsed['description']=='Actual Python requirements'


@pytest.mark.parametrize('failure',[None,'duplicate','missing_detail','snapshot'])
def test_complete_http_scan_all_details_and_final_snapshot(monkeypatch,failure):
    import asyncio
    import httpx
    from scraper import adapters
    from scraper.netapp import BOARD,NetAppCareerAdapter
    from scraper.models import Company
    roots=[];details=[]
    async def request(client,method,url,**kwargs):
        if url==BOARD:
            roots.append(url);ids=[1,2]
            if failure=='snapshot' and len(roots)>1:ids=[1,9]
            text='<title>NetApp jobs</title><script src="https://tbcdn.talentbrew.com/company/27600/js/asset.js"></script>'+page(ids,total=3)
            text=text.replace('id="search-results"','id="search-results" data-ajax-url="/search-jobs/results"')
            return httpx.Response(200,text=text,request=httpx.Request(method,url))
        if url.endswith('/results'):
            assert kwargs['params']['CurrentPage']==2 and kwargs['params']['RecordsPerPage']==2
            return httpx.Response(200,json={'results':page([1 if failure=='duplicate' else 3],total=3,current=2)},request=httpx.Request(method,url))
        ident=url.rsplit('/',1)[-1];details.append(ident)
        payload=dict(**{'@type':'JobPosting'},title='Engineer '+ident,hiringOrganization=dict(name='NetApp'),url=url,description='<p>Actual requirements</p>',jobLocation=[dict(address=dict(addressLocality='Bangalore',addressCountry='IN')),dict(address=dict(addressLocality='Hyderabad',addressCountry='IN'))])
        text='<script type="application/ld+json">'+json.dumps(payload)+'</script>'
        return httpx.Response(404 if failure=='missing_detail' else 200,text=text,request=httpx.Request(method,url))
    monkeypatch.setattr(adapters,'request',request)
    company=Company('NetApp',BOARD,'netapp','27600')
    if failure:
        with pytest.raises((ValueError,SnapshotChanged)):asyncio.run(NetAppCareerAdapter().fetch_jobs(company))
    else:
        jobs,count=asyncio.run(NetAppCareerAdapter().fetch_jobs(company));assert count==len(jobs)==3 and set(details)=={'1','2','3'} and len(roots)==2
        assert all(j.posted_at is None and 'Bangalore' in j.location and 'Hyderabad' in j.location for j in jobs)
