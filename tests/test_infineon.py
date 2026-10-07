import json
import unittest
from scraper.infineon import listing,detail
from scraper.snapshot import SnapshotChanged


class InfineonTests(unittest.TestCase):
    def row(self):return {'id':123,'positionUrl':'/careers/job/123','name':'Engineer','locations':['Bangalore','Hyderabad'],'standardizedLocations':['Bengaluru, KA, IN','Hyderabad, TS, IN']}
    def test_listing_and_duplicate_protection(self):
        total,rows=listing({'data':{'count':1,'positions':[self.row()]}},0)
        self.assertEqual(total,1);self.assertEqual(list(rows),['123'])
        for batch in [[],[self.row(),self.row()]]:
            with self.assertRaises(ValueError):listing({'data':{'count':1,'positions':batch}},0)
        with self.assertRaises(SnapshotChanged):listing({'data':{'count':1,'positions':[self.row()]}},0,2)

    def test_foreign_private_sources_rejected(self):
        for change in [{'positionUrl':'https://other.example/careers/job/123'},{'isPrivate':True}]:
            row=self.row();row.update(change)
            with self.assertRaises(ValueError):listing({'data':{'count':1,'positions':[row]}},0)

    def test_full_detail_preserves_multiple_locations_and_unknown_date(self):
        _,rows=listing({'data':{'count':1,'positions':[self.row()]}},0);item=rows['123']
        job={'@type':'JobPosting','title':'Engineer','url':item['url'],'description':'Requirements and responsibilities','hiringOrganization':{'name':'Infineon','sameAs':'infineon.com'}}
        def html():return '<script type="application/ld+json">'+json.dumps(job)+'</script>'
        result=detail(html(),item)
        self.assertIsNone(result['posted']);self.assertIn('Bangalore',result['location']);self.assertIn('Hyderabad',result['location'])
        job['url']='https://other.example/123'
        with self.assertRaises(ValueError):detail(html(),item)

    def test_zero_inventory_is_complete_and_unknown_total_is_rejected(self):
        self.assertEqual(listing({'data':{'count':0,'positions':[]}},0),(0,{}))
        with self.assertRaises(ValueError):listing({'data':{'positions':[]}},0)


class CompleteInfineonTests(unittest.IsolatedAsyncioTestCase):
    async def test_every_detail_is_fetched_including_non_target_city(self):
        from unittest.mock import patch
        import httpx
        from scraper.infineon import InfineonCareerAdapter,BOARD
        from scraper.models import Company
        rows=[{'id':n,'positionUrl':f'/careers/job/{n}','name':'Engineer','locations':[city],'standardizedLocations':[]} for n,city in [(123,'Delhi'),(456,'Bangalore')]]
        calls=[]
        class Context:
            async def __aenter__(self):return self
            async def __aexit__(self,*args):return False
        async def request(client,method,url,**kwargs):
            calls.append(url)
            req=httpx.Request(method,url)
            if url==BOARD:return httpx.Response(200,text='<code id="pcsx-data">{"domain":"infineon.com"}</code>',request=req)
            if url.endswith('/search'):
                offset=kwargs['params']['start']
                return httpx.Response(200,json={'data':{'count':2,'positions':rows[offset:offset+1]}},request=req)
            row=next(r for r in rows if str(r['id'])==kwargs['params']['position_id'])
            data={'@type':'JobPosting','title':'Engineer','description':'Full requirements','url':url,'hiringOrganization':{'name':'Infineon','sameAs':'infineon.com'}}
            return httpx.Response(200,json={'data':{'id':row['id'],'name':row['name'],'locations':row['locations'],'jobDescription':'Full requirements','positionUrl':row['positionUrl'],'publicUrl':'https://jobs.infineon.com'+row['positionUrl']}},request=req)
        with patch('scraper.adapters.client',return_value=Context()),patch('scraper.adapters.request',side_effect=request):
            jobs,count=await InfineonCareerAdapter().fetch_jobs(Company('Infineon Technologies',BOARD,'infineon','infineon.com'))
        self.assertEqual(count,2);self.assertEqual(len(jobs),2)
        self.assertEqual({j.external_job_id for j in jobs},{'123','456'})
        self.assertTrue(all(j.posted_at is None for j in jobs))
        self.assertEqual(sum('/position_details' in url for url in calls),2)
