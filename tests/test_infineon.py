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
