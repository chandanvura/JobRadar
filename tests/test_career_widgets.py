import json
import pytest
from scraper.career_widgets import flight_records, kula_records, juspay_records
from scraper.adapters import parse_public_xml, workday_country_facets, discover_ats
from bs4 import BeautifulSoup


def flight_page(rows):
    return '<script>self.__next_f.push(' + json.dumps([1, rows]) + ')</script>'


def test_flight_text_respects_utf8_byte_length_and_does_not_execute_code():
    text = 'Payments → Bengaluru\nNext line'
    wire = ':HL["/styles.css","style"]\n1:T' + format(len(text.encode()), 'x') + ',' + text
    wire += '2:' + json.dumps({'jobs': [{'ats_job': {'job_description': '$1'}}]}) + '\n'
    rows, refs = kula_records(flight_page(wire))
    assert refs['1'] == text
    assert rows[0]['ats_job']['job_description'] == '$1'
    with pytest.raises(ValueError):
        flight_records('<script>self.__next_f.push(alert("bad"))</script>')
    with pytest.raises(ValueError, match='Truncated'):
        flight_records(flight_page('1:T100,x'))


def test_kula_rejects_missing_or_ambiguous_job_lists():
    with pytest.raises(ValueError): kula_records(flight_page('1:{"other":[]}\n'))
    with pytest.raises(ValueError): kula_records(flight_page('1:{"jobs":[]}\n2:{"jobs":[]}\n'))


def test_astro_job_list_preserves_explicit_opening_flags():
    job = {'job_id': [0, 'BE01'], 'opening_status': [0, True], 'job_title': [0, 'SDE']}
    props = json.dumps({'jobData': [1, [[0, job]]]})
    soup = BeautifulSoup('<astro-island></astro-island>', 'html.parser')
    soup.find('astro-island')['props'] = props
    assert juspay_records(str(soup))[0]['opening_status'] is True
    with pytest.raises(ValueError): juspay_records('<h1>Careers</h1>')


def test_workday_uses_employer_country_facet_and_excludes_indiana():
    facets = [{'facetParameter': 'locationMainGroup', 'values': [
        {'facetParameter': 'locationCountry', 'values': [
            {'descriptor': 'India', 'id': 'IN'}, {'descriptor': 'Indiana', 'id': 'BAD'}]},
        {'facetParameter': 'locations', 'values': [
            {'descriptor': 'Bengaluru, India', 'id': 'BLR'}]}]}]
    assert workday_country_facets(facets, 'India') == {'locationCountry': ['IN']}
    assert workday_country_facets(facets, 'France') == {}
    assert workday_country_facets([{'facetParameter': 'locations', 'values': [
        {'descriptor': 'Bengaluru, India', 'id': 'BLR'},
        {'descriptor': 'Indianapolis, Indiana', 'id': 'BAD'}]}], 'India') == {'locations': ['BLR']}


def test_trakstar_xml_uses_namespaced_locations_and_trusted_https_links():
    xml = '''<rss xmlns:job="https://recruiterbox.com/rss/job/"><channel><item>
      <title>Support Engineer</title><link>http://example.hire.trakstar.com/jobs/1</link>
      <description>Full role description</description><pubDate>Mon, 05 Oct 2026 00:00:00 GMT</pubDate>
      <job:locationCity>Bengaluru</job:locationCity><job:locationCountry>India</job:locationCountry>
      </item></channel></rss>'''
    jobs, count = parse_public_xml(xml, 'Example', 'https://example.hire.trakstar.com/jobfeeds/example')
    assert count == 1 and jobs[0].location == 'Bengaluru · India'
    assert jobs[0].job_url.startswith('https://example.hire.trakstar.com/')
    assert jobs[0].posted_at is None  # RSS refresh time cannot establish posting age.
    assert not parse_public_xml(xml, 'Other', 'https://other.example/careers')[0]


def test_european_lever_board_discovery_uses_european_identifier():
    soup = BeautifulSoup('<a href="https://jobs.eu.lever.co/payu/123">Jobs</a>', 'html.parser')
    assert discover_ats(soup, 'https://corporate.payu.com/careers')[:2] == ('lever', 'eu|payu')


def test_widget_collection_excludes_private_jobs_and_keeps_unknown_dates(monkeypatch):
    import asyncio
    import httpx
    import scraper.adapters as adapters
    from scraper.career_widgets import KulaCareerAdapter, PyjamaCareerAdapter, JuspayCareerAdapter
    from scraper.models import Company
    description = '<p>Full employer description – Bengaluru</p>'
    rows = [{'id': 1, 'title': 'Software Engineer', 'listed': True, 'kind': 'external',
             'is_confidential': False, 'launch_at': '2026-10-01T10:00:00Z',
             'ats_job': {'job_description': description, 'offices': [{'location': 'Bengaluru, India'}]}},
            {'id': 2, 'title': 'Private Engineer', 'listed': True, 'kind': 'internal',
             'ats_job': {'job_description': 'secret'}},
            {'id': 3, 'title': 'Confidential Engineer', 'listed': True, 'kind': 'external',
             'is_confidential': True, 'ats_job': {'job_description': 'secret'}}]
    html = flight_page('1:' + json.dumps({'jobs': rows}) + '\n')
    async def request(client, method, url, **kwargs):
        req = httpx.Request(method, url)
        if 'kula.ai' in url: return httpx.Response(200, text=html, request=req)
        if 'jobs.pyjamahr.com' in url:
            config = {'props': {'pageProps': {'companyDetails': {'uuid': '123', 'slug': 'example'}}}}
            return httpx.Response(200, text='<script id="__NEXT_DATA__">'+json.dumps(config)+'</script>', request=req)
        return httpx.Response(200, json={'count': 2, 'next': None, 'results': [
            {'id': 1, 'slug': 'engineer', 'title': 'Engineer', 'published_internally': False},
            {'id': 2, 'slug': 'private', 'title': 'Private Engineer', 'published_internally': True}]}, request=req)
    async def detail(client, url, **kwargs):
        return httpx.Response(200, json={'id': 1, 'title': 'Engineer', 'description': description,
                                        'location': 'Bengaluru', 'published_internally': False,
                                        'created_at': '2026-10-05T11:00:00Z'}, request=httpx.Request('GET', url))
    monkeypatch.setattr(adapters, 'request', request)
    monkeypatch.setattr(adapters, 'cached_get', detail)
    async def run():
        jobs, count = await KulaCareerAdapter().fetch_jobs(Company('Example', 'https://careers.kula.ai/example', 'kula', 'example'))
        assert count == 1 and [j.title for j in jobs] == ['Software Engineer']
        assert jobs[0].posted_at.startswith('2026-10-01')
        jobs, count = await PyjamaCareerAdapter().fetch_jobs(Company('Example', 'https://jobs.pyjamahr.com/example', 'pyjamahr', '123'))
        assert count == 2 and len(jobs) == 1
        assert jobs[0].posted_at is None
        assert jobs[0].job_url == 'https://jobs.pyjamahr.com/example/engineer'
    asyncio.run(run())


def test_bamboo_list_cannot_hide_incomplete_pagination(monkeypatch):
    import asyncio
    import httpx
    import scraper.adapters as adapters
    from scraper.career_widgets import BambooCareerAdapter
    from scraper.models import Company
    async def request(client, method, url, **kwargs):
        return httpx.Response(200, json={'meta': {'totalCount': 2}, 'result': [{'id': '1'}]}, request=httpx.Request(method, url))
    monkeypatch.setattr(adapters, 'request', request)
    with pytest.raises(ValueError, match='incomplete'):
        asyncio.run(BambooCareerAdapter().fetch_jobs(Company('Example','https://example.bamboohr.com/careers','bamboohr','example')))
