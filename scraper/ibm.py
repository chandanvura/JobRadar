"""IBM Careers Elasticsearch API adapter."""
import asyncio
from datetime import datetime, timezone
import json
import re
from urllib.parse import parse_qs, urlparse

from bs4 import BeautifulSoup
import httpx

from .models import JobBatch

IBM_SEARCH_API = "https://www-api.ibm.com/search/api/v2"
DEFAULT_PAGE_SIZE = 50
MAX_PAGES = 100
DETAIL_CONCURRENCY = 4


def build_search_payload(country="in", keyword=None, size=DEFAULT_PAGE_SIZE, from_offset=0):
    """Build Elasticsearch query payload for IBM Careers API."""
    must_clauses = [{"term": {"country": country}}]
    if keyword:
        # Wildcard or term query for keyword filtering (e.g. Confluent)
        must_clauses.append({"wildcard": {"title": f"*{keyword}*"}})

    return {
        "appId": "careers",
        "scopes": ["careers2"],
        "query": {
            "bool": {
                "must": must_clauses
            }
        },
        "size": size,
        "from": from_offset,
        "_source": [
            "id",
            "title",
            "url",
            "field_keyword_19",
            "field_keyword_05",
            "field_keyword_08",
            "field_keyword_18",
            "body",
        ],
    }


def extract_job_id_from_url(url):
    """Extract numeric jobId parameter from IBM Careers detail url."""
    if not url:
        return None
    try:
        parsed = urlparse(url)
        params = parse_qs(parsed.query)
        job_ids = params.get("jobId")
        if job_ids and job_ids[0].strip():
            return job_ids[0].strip()
    except Exception:
        pass
    return None


def parse_ibm_hit(hit, company_name="IBM", career_page_url=None):
    """Convert an Elasticsearch hit dictionary into a Job dataclass instance."""
    from .adapters import clean, location_text, make_job

    source = hit.get("_source") or {}
    title = clean(source.get("title") or "")
    url = (source.get("url") or "").strip()
    location_raw = source.get("field_keyword_19") or source.get("field_keyword_05") or ""
    location = location_text(location_raw)
    body = clean(source.get("body") or "")

    if not title or not url:
        return None

    # Job external ID: prefer jobId from URL, fallback to hit['_source']['id'] or hit['_id']
    job_id = extract_job_id_from_url(url) or source.get("id") or hit.get("_id")
    if not job_id:
        return None
    job_id = str(job_id).strip()

    return make_job(
        job_id,
        title,
        company_name,
        location,
        body,
        "ibm",
        "company_career",
        url,
        url,
        career_page_url or url,
        posting=None,
    )


class IBMCareersAdapter:
    """Scrapes jobs from IBM Careers Elasticsearch API."""

    def __init__(self, page_size=DEFAULT_PAGE_SIZE, max_pages=MAX_PAGES):
        self.page_size = page_size
        self.max_pages = max_pages

    async def fetch_jobs(self, company):
        from .adapters import client, fetch_detail, jsonld_objects, parse_posting, request

        endpoint = company.ats_identifier.strip() if company.ats_identifier and company.ats_identifier.startswith("http") else IBM_SEARCH_API

        # Keyword filter if company specifies Confluent or similar in name/ats_identifier
        keyword = None
        if "confluent" in (company.name or "").lower():
            keyword = "confluent"

        discovered = {}
        total_hits = 0

        async with client(timeout=35) as x:
            from_offset = 0
            page_no = 0

            while page_no < self.max_pages:
                payload = build_search_payload(country="in", keyword=keyword, size=self.page_size, from_offset=from_offset)
                headers = {"Content-Type": "application/json"}
                response = await request(x, "POST", endpoint, json=payload, headers=headers)
                response.raise_for_status()

                data = response.json()
                hits_container = data.get("hits") or {}
                total_info = hits_container.get("total")
                if isinstance(total_info, dict):
                    total_hits = total_info.get("value", 0)
                elif isinstance(total_info, int):
                    total_hits = total_info
                else:
                    total_hits = 0

                hits = hits_container.get("hits") or []
                if not hits:
                    break

                for hit in hits:
                    job = parse_ibm_hit(hit, company_name=company.name, career_page_url=company.careers_url)
                    if job and job.external_job_id not in discovered:
                        discovered[job.external_job_id] = job

                from_offset += len(hits)
                page_no += 1
                if from_offset >= total_hits or len(hits) < self.page_size:
                    break

            # Attempt detail page enrichment for datePosted
            gate = asyncio.Semaphore(DETAIL_CONCURRENCY)

            async def verify_date(job):
                try:
                    async with gate:
                        resp = await fetch_detail(x, job.job_url)
                    if resp.status_code == 200 and resp.text:
                        soup = BeautifulSoup(resp.text, "html.parser")
                        for item in jsonld_objects(soup):
                            if item.get("@type") == "JobPosting" and item.get("datePosted"):
                                job.posted_at, job.posted_label, job.posted_precision, job.reported_age_hours = parse_posting(item["datePosted"])
                                return
                except Exception:
                    pass

                # Fallback to current verification if detail does not provide datePosted
                job.posted_at = datetime.now(timezone.utc).isoformat()
                job.posted_precision = "exact"
                job.posted_label = "Current verification"

            await asyncio.gather(*(verify_date(job) for job in discovered.values()))

        jobs_list = list(discovered.values())
        return JobBatch(jobs_list), len(discovered)
