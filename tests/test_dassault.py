import json
import unittest
from scraper.dassault import listing,detail
from scraper.snapshot import SnapshotChanged


def xml(total=1,start=0,estimated='false',ident='123',host='www.3ds.com'):
    fields={'card_id':ident,'content_type':'career','content_lang':'en','content_title':'Engineer','content_cta_1_url':f'https://{host}/careers/jobs/engineer-{ident}'}
    metas=''.join(f'<Meta name="{k}"><MetaString name="value">{v}</MetaString></Meta>' for k,v in fields.items())
    return f'<Answer xmlns="exa:com.exalead.search.v10" nhits="{total}" nmatches="{total}" start="{start}" estimated="{estimated}"><Hit>{metas}</Hit></Answer>'


class DassaultTests(unittest.TestCase):
    def test_namespaced_exact_listing(self):
        count,rows=listing(xml(),0)
        self.assertEqual(count,1)
        self.assertEqual(rows['123']['url'],'https://www.3ds.com/careers/jobs/engineer-123')

    def test_truncation_estimate_and_foreign_employer_rejected(self):
        for text in [xml(total=2),xml(estimated='true'),xml(host='other.example')]:
            with self.assertRaises(ValueError):listing(text,0)
        with self.assertRaises(SnapshotChanged):listing(xml(),0,2)

    def test_detail_identity_and_real_unknowns(self):
        job={'@type':'JobPosting','identifier':'123','title':'Engineer','description':'Complete requirements','hiringOrganization':{'name':'Dassault Systèmes','sameAs':'https://www.3ds.com/'},'jobLocation':{'address':{'addressLocality':'Pune','addressCountry':'India'}}}
        def html():return '<script type="application/ld+json">'+json.dumps(job)+'</script><div class="jobdetails-body-container">Complete requirements</div>'
        result=detail(html(),'123',{'title':'Engineer'})
        self.assertIsNone(result['posted'])
        self.assertIn('Pune',result['location'])
        job['identifier']='456'
        with self.assertRaises(ValueError):detail(html(),'123',{'title':'Engineer'})

    def test_duplicate_ids_rejected(self):
        text=xml();hit=text[text.index('<Hit>'):text.index('</Hit>')+6]
        with self.assertRaises(ValueError):listing(text.replace('</Answer>',hit+'</Answer>'),0)

    def test_zero_inventory_and_xml_entity_attack(self):
        self.assertEqual(listing('<Answer xmlns="exa:com.exalead.search.v10" nhits="0" nmatches="0" start="0" estimated="false"/>',0),(0,{}))
        from defusedxml.common import DefusedXmlException
        with self.assertRaises(DefusedXmlException):listing('<!DOCTYPE x [<!ENTITY secret SYSTEM "file:///etc/passwd">]><Answer>&secret;</Answer>',0)
