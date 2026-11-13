"""Collect India career listings and verified JobPosting details from CGI's Njoyn portal."""
import asyncio
import json
import re
from urllib.parse import urljoin, urlparse

from bs4 import BeautifulSoup

BASE_URL = "https://cgi.njoyn.com/CORP/xweb/"
LISTING_URL = BASE_URL + "xweb.asp"
MAX_PAGES = 20
DETAIL_CONCURRENCY = 4


def parse_page_total(soup):
    """Return total page count advertised by the Njoyn results header, defaulting to 1."""
    for text in soup.find_all(string=re.compile(r"\bPage\s+\d+\s+of\s+(\d+)\b", re.I)):
        match = re.search(r"\bPage\s+\d+\s+of\s+(\d+)\b", text, re.I)
        if match:
            return min(MAX_PAGES, max(1, int(match.group(1))))
    return 1


def parse_listing_rows(html_text, page_url):
    """Extract job rows (id, title, location, detail_url) from an Njoyn search page."""
    soup = BeautifulSoup(html_text, "html.parser")
    total_pages = parse_page_total(soup)
    records = {}
    for row in soup.select("table tr"):
        link = row.find("a", href=re.compile(r"Page=JobDetails", re.I))
        if not link:
            continue
        cells = [cell.get_text(" ", strip=True) for cell in row.find_all("td")]
        if len(cells) < 4:
            continue
        job_id = cells[0].strip()
        title = cells[1].strip()
        city = cells[3].strip()
        country = cells[4].strip() if len(cells) > 4 else ""
        if not job_id or not title:
            continue
        location = ", ".join(part for part in (city, country) if part)
        records[job_id] = {
            "id": job_id,
            "title": title,
            "location": location,
            "detail_url": urljoin(page_url, link["href"]),
        }
    return records, total_pages


def parse_job_detail(html_text, fallback_title="", fallback_location=""):
    """Extract description, posted date, title, and location from CGI JobPosting LD+JSON."""
    from .adapters import clean

    soup = BeautifulSoup(html_text, "html.parser")
    for script in soup.select('script[type="application/ld+json"]'):
        raw = script.string or script.get_text()
        if not raw or "JobPosting" not in raw:
            continue
        try:
            data = json.loads(raw, strict=False)
        except json.JSONDecodeError:
            continue
        items = data if isinstance(data, list) else data.get("@graph", [data])
        for item in items:
            if not isinstance(item, dict) or item.get("@type") != "JobPosting":
                continue
            description = clean(item.get("description", ""))
            if not description:
                continue
            title = item.get("title") or fallback_title
            addr = (item.get("jobLocation") or {}).get("address") or {}
            loc_parts = [
                str(addr.get(k) or "").strip()
                for k in ("addressLocality", "addressRegion", "addressCountry")
                if str(addr.get(k) or "").strip()
            ]
            location = ", ".join(loc_parts) or fallback_location
            return {
                "title": title,
                "description": description,
                "location": location,
                "datePosted": item.get("datePosted"),
            }
    return None


class CGINjoynCareerAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, fetch_detail, likely_target, make_job, request

        if "|" not in company.ats_identifier:
            raise ValueError("CGI Njoyn identifier must be formatted as '<clid>|<country_id>'")
        clid, country_id = company.ats_identifier.split("|", 1)
        parsed = urlparse(company.careers_url)
        if parsed.scheme != "https" or parsed.hostname != "cgi.njoyn.com":
            raise ValueError("CGI Njoyn careers_url does not match cgi.njoyn.com")

        async with client(timeout=30) as x:
            discovered = {}
            page_no = 1
            total_pages = 1
            while page_no <= total_pages:
                params = {"page": "joblisting", "CLID": clid, "CountryID": country_id, "pn": str(page_no)}
                response = await request(x, "GET", LISTING_URL, params=params)
                response.raise_for_status()
                rows, advertised_pages = parse_listing_rows(response.text, str(response.url))
                total_pages = max(total_pages, advertised_pages)
                new_keys = set(rows) - set(discovered)
                discovered.update(rows)
                if not rows or not new_keys:
                    break
                page_no += 1

            targets = [item for item in discovered.values() if likely_target(item["title"], item["location"])]
            semaphore = asyncio.Semaphore(DETAIL_CONCURRENCY)

            async def convert(item):
                async with semaphore:
                    detail_resp = await fetch_detail(x, item["detail_url"])
                    if detail_resp.status_code in (404, 410):
                        return None
                    detail_resp.raise_for_status()
                    parsed_detail = parse_job_detail(detail_resp.text, item["title"], item["location"])
                    if not parsed_detail:
                        return None
                    return make_job(
                        item["id"],
                        parsed_detail["title"],
                        company.name,
                        parsed_detail["location"],
                        parsed_detail["description"],
                        "cgi_njoyn",
                        "company_career",
                        item["detail_url"],
                        item["detail_url"],
                        company.careers_url,
                        posting=parsed_detail["datePosted"],
                    )

            collected = await asyncio.gather(*(convert(item) for item in targets))
            return [job for job in collected if job], len(discovered)
