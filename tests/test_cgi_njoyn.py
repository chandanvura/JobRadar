import asyncio
import json
import httpx
import pytest
from scraper import adapters
from scraper.cgi_njoyn import CGINjoynCareerAdapter, parse_job_detail, parse_listing_rows
from scraper.models import Company

LISTING_HTML_P1 = """
<html><body>
<div class="row">Page 1 of 2</div>
<table>
  <tr><th>Position ID</th><th>Title</th><th>Category</th><th>City</th><th>Country</th></tr>
  <tr>
    <td><a href="xweb.asp?NTKN=c&amp;clid=21001&amp;Page=JobDetails&amp;Jobid=J1126-0001&amp;BRID=101&amp;lang=1">J1126-0001</a></td>
    <td>Associate Software Engineer</td>
    <td>Engineering</td>
    <td>Bengaluru</td>
    <td>India</td>
  </tr>
  <tr>
    <td><a href="xweb.asp?NTKN=c&amp;clid=21001&amp;Page=JobDetails&amp;Jobid=J1126-0002&amp;BRID=102&amp;lang=1">J1126-0002</a></td>
    <td>Payroll Specialist</td>
    <td>Finance</td>
    <td>Mumbai</td>
    <td>India</td>
  </tr>
</table>
</body></html>
"""

LISTING_HTML_P2 = """
<html><body>
<div class="row">Page 2 of 2</div>
<table>
  <tr><th>Position ID</th><th>Title</th><th>Category</th><th>City</th><th>Country</th></tr>
  <tr>
    <td><a href="xweb.asp?NTKN=c&amp;clid=21001&amp;Page=JobDetails&amp;Jobid=J1126-0003&amp;BRID=103&amp;lang=1">J1126-0003</a></td>
    <td>Java Developer</td>
    <td>Engineering</td>
    <td>Hyderabad</td>
    <td>India</td>
  </tr>
</table>
</body></html>
"""

DETAIL_HTML = """
<html><head>
<script type="application/ld+json">
{
  "@context": "http://schema.org/",
  "@type": "JobPosting",
  "title": "Associate Software Engineer",
  "description": "Requirements:\n<p>0-2 years experience in Java and Python.</p>",
  "datePosted": "2026-11-11",
  "jobLocation": {
    "@type": "Place",
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Bengaluru",
      "addressRegion": "KA",
      "addressCountry": "IN "
    }
  }
}
</script>
</head></html>
"""


def test_parse_listing_rows_and_detail_handles_unescaped_ld_json():
    rows, total_pages = parse_listing_rows(
        LISTING_HTML_P1,
        "https://cgi.njoyn.com/CORP/xweb/xweb.asp?page=joblisting&CLID=21001&CountryID=IN",
    )
    assert total_pages == 2
    assert set(rows) == {"J1126-0001", "J1126-0002"}
    assert rows["J1126-0001"]["location"] == "Bengaluru, India"

    detail = parse_job_detail(DETAIL_HTML)
    assert detail is not None
    assert detail["title"] == "Associate Software Engineer"
    assert detail["datePosted"] == "2026-11-11"
    assert "0-2 years experience in Java and Python." in detail["description"]
    assert detail["location"] == "Bengaluru, KA, IN"


def test_cgi_njoyn_adapter_paginates_and_filters_target_candidates(monkeypatch):
    fetched_details = []

    async def mock_request(client, method, url, **kwargs):
        req = httpx.Request(method, url)
        pn = (kwargs.get("params") or {}).get("pn")
        html_body = LISTING_HTML_P1 if pn == "1" else LISTING_HTML_P2
        return httpx.Response(200, text=html_body, request=req)

    async def mock_detail(client, url):
        fetched_details.append(url)
        return httpx.Response(200, text=DETAIL_HTML, request=httpx.Request("GET", url))

    monkeypatch.setattr(adapters, "request", mock_request)
    monkeypatch.setattr(adapters, "fetch_detail", mock_detail)

    company = Company(
        "CGI",
        "https://cgi.njoyn.com/CORP/xweb/xweb.asp?page=joblisting&CLID=21001&CountryID=IN",
        "cgi_njoyn",
        "21001|IN",
    )
    jobs, discovered = asyncio.run(CGINjoynCareerAdapter().fetch_jobs(company))
    assert discovered == 3
    # Non-target Mumbai Payroll Specialist is filtered out before detail fetch
    assert len(jobs) == 2
    assert len(fetched_details) == 2
    assert all(j.ats_provider == "cgi_njoyn" and j.posted_precision == "day" for j in jobs)
