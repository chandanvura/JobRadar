"""Zerodha public structured careers API adapter.

Parses structured JSON job postings from https://careers.zerodha.com/api/jobs,
extracting job title, department, location, clean description, and application URLs.
"""
from __future__ import annotations
import html
import re
from typing import TYPE_CHECKING
from urllib.parse import parse_qs, urlparse

from . import adapters
from .adapters import JobSource, clean, location_text, make_job

if TYPE_CHECKING:
    from .models import Company, Job

ZERODHA_JOBS_API = "https://careers.zerodha.com/api/jobs"
ZERODHA_CAREERS_BASE = "https://careers.zerodha.com"

WELL_KNOWN_DEPARTMENTS = (
    "Legal",
    "Engineering",
    "Technology",
    "Product",
    "Design",
    "Finance",
    "Operations",
    "Compliance",
    "Security",
    "Human Resources",
    "HR",
    "Marketing",
    "Sales",
    "Support",
)


def extract_department(title: str, desc_html: str, desc_clean: str) -> str:
    """Extract department from structured attributes, description markers, or role title."""
    # 1. Explicit Department label in HTML or plain text
    match = re.search(r"(?:Department|Dept)\s*:\s*([^\n<,;]+)", desc_html, re.I)
    if match:
        dept = clean(match.group(1)).strip()
        if dept:
            return dept

    match_text = re.search(r"(?:Department|Dept)\s*:\s*([^\n,;]+)", desc_clean, re.I)
    if match_text:
        dept = match_text.group(1).strip()
        if dept:
            return dept

    # 2. Match department from title
    for dept_name in WELL_KNOWN_DEPARTMENTS:
        if re.search(rf"\b{re.escape(dept_name)}\b", title, re.I):
            return dept_name

    return ""


def extract_application_url(desc_html: str, fallback_url: str) -> str:
    """Extract direct application or form link embedded in description HTML."""
    links = re.findall(r'href=[\'"]([^\'"]+)[\'"]', desc_html)
    for link in links:
        link = html.unescape(link.strip())
        parsed = urlparse(link)
        # Unwrap Google redirect if present (e.g. google.com/url?q=https://forms.gle/...)
        if "google.com" in parsed.netloc and parsed.path.startswith("/url"):
            qs = parse_qs(parsed.query)
            if "q" in qs and qs["q"]:
                target = qs["q"][0]
                target_parsed = urlparse(target)
                if target_parsed.scheme in ("http", "https"):
                    return target

        if any(h in parsed.netloc for h in ("forms.gle", "docs.google.com", "typeform.com", "airtable.com")):
            return link

        if "careers.zerodha.com" in parsed.netloc and ("/apply" in parsed.path or "/application" in parsed.path):
            return link

    return fallback_url


def parse_zerodha_jobs(payload: dict, company: Company) -> list[Job]:
    """Parse Zerodha's JSON API response into normalized Job models."""
    if not isinstance(payload, dict):
        raise ValueError("Zerodha jobs API returned an unexpected response schema")

    items = payload.get("data")
    if not isinstance(items, list) or len(items) > 500:
        raise ValueError("Zerodha jobs array is missing, malformed, or exceeds bounded limit")

    seen_ids: set[str] = set()
    jobs: list[Job] = []

    for item in items:
        if not isinstance(item, dict):
            raise ValueError("Zerodha job item is not an object")

        ident = str(item.get("name") or item.get("id") or "").strip()
        title = clean(item.get("job_title", ""))
        if not ident or not title:
            raise ValueError("Zerodha job item missing required identifier or title")

        if ident in seen_ids:
            raise ValueError(f"Zerodha jobs response contains duplicate identifier: {ident}")
        seen_ids.add(ident)

        location = location_text(item.get("location"), item.get("location_type"))
        desc_html = item.get("description") or ""
        clean_desc = clean(desc_html)

        dept = str(item.get("department") or "").strip()
        if not dept:
            dept = extract_department(title, desc_html, clean_desc)

        if dept and f"Department: {dept}" not in clean_desc:
            clean_desc = f"Department: {dept}\n\n{clean_desc}"

        job_url = f"{ZERODHA_CAREERS_BASE}/#{ident}"
        app_url = extract_application_url(desc_html, job_url)

        job = make_job(
            ident,
            title,
            company.name,
            location,
            clean_desc,
            company.ats_provider,
            "company_career",
            job_url,
            app_url,
            company.careers_url,
            posting=None,
        )
        jobs.append(job)

    return jobs


class ZerodhaCareerAdapter(JobSource):
    """Adapter for Zerodha's official career portal JSON API."""

    async def fetch_jobs(self, company: Company) -> tuple[list[Job], int]:
        endpoint = (
            company.careers_url
            if company.careers_url.endswith("/api/jobs")
            else ZERODHA_JOBS_API
        )
        async with adapters.client(timeout=30) as x:
            response = await adapters.request(x, "GET", endpoint)
            response.raise_for_status()
            payload = response.json()
            jobs = parse_zerodha_jobs(payload, company)
            return jobs, len(jobs)
