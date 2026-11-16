"""TurboHire ATS career platform adapter.

Supports high-value employers hosted on TurboHire (such as Flipkart, Navi, etc.)
by acquiring an unauthenticated guest token and reading public postings via the
TurboHire career page API.
"""
from __future__ import annotations
import json
from typing import TYPE_CHECKING
from urllib.parse import urlparse

from . import adapters
from .adapters import JobSource, clean, location_text, make_job

if TYPE_CHECKING:
    from .models import Company, Job

TURBOHIRE_GUEST_ENDPOINT = "https://api.turbohire.co/api/token/noauth"  # nosec B105
TURBOHIRE_API_JOBS_URL = "https://api.turbohire.co/api/careerpagev2/filteredjobs"


def parse_turbohire_location(loc_raw: object) -> str:
    """Extract location string(s) from TurboHire's location structure or JSON array."""
    if not loc_raw:
        return ""

    if isinstance(loc_raw, str):
        trimmed = loc_raw.strip()
        if trimmed.startswith("[") and trimmed.endswith("]"):
            try:
                parsed = json.loads(trimmed)
                if isinstance(parsed, list):
                    addresses = [
                        item.get("Address", "")
                        for item in parsed
                        if isinstance(item, dict) and item.get("Address")
                    ]
                    if addresses:
                        return location_text(*addresses)
            except (json.JSONDecodeError, ValueError):
                pass
        return location_text(loc_raw)

    if isinstance(loc_raw, list):
        addresses = [
            item.get("Address", "")
            for item in loc_raw
            if isinstance(item, dict) and item.get("Address")
        ]
        return location_text(*addresses)

    if isinstance(loc_raw, dict):
        return location_text(loc_raw.get("Address", ""))

    return ""


def parse_turbohire_jobs(payload: dict | list, company: Company, base_url: str) -> list[Job]:
    """Parse TurboHire JSON API records into normalized Job models."""
    if isinstance(payload, dict):
        raw_items = payload.get("Result")
    elif isinstance(payload, list):
        raw_items = payload
    else:
        raise ValueError("TurboHire jobs response is not a recognized schema")

    if not isinstance(raw_items, list) or len(raw_items) > 1000:
        raise ValueError("TurboHire jobs array is missing, malformed, or exceeds bounded limit")

    seen_ids: set[str] = set()
    jobs: list[Job] = []

    for item in raw_items:
        if not isinstance(item, dict):
            raise ValueError("TurboHire job item is not an object")

        ident = str(item.get("JobId") or item.get("JobIdObfuscated") or "").strip()
        title = clean(item.get("JobTitle", ""))
        if not ident or not title:
            raise ValueError("TurboHire job item missing required identifier or title")

        if ident in seen_ids:
            continue
        seen_ids.add(ident)

        location = parse_turbohire_location(item.get("Location"))
        desc_html = item.get("JobDescV2") or item.get("Description") or ""
        clean_desc = clean(desc_html)

        dept = clean(str(item.get("Department") or ""))
        skills = item.get("Skills")
        exp = item.get("Experience")

        meta_parts: list[str] = []
        if dept:
            meta_parts.append(f"Department: {dept}")
        if isinstance(skills, list) and skills:
            skills_str = ", ".join(clean(str(s)) for s in skills if s)
            if skills_str:
                meta_parts.append(f"Skills: {skills_str}")
        if isinstance(exp, dict) and ("MinExp" in exp or "MaxExp" in exp):
            min_exp, max_exp = exp.get("MinExp"), exp.get("MaxExp")
            if min_exp is not None and max_exp is not None:
                meta_parts.append(f"Experience: {min_exp} to {max_exp} years")
            elif min_exp is not None:
                meta_parts.append(f"Experience: {min_exp}+ years")

        desc = (
            "\n\n".join(meta_parts + [clean_desc])
            if meta_parts and clean_desc
            else (clean_desc or "\n\n".join(meta_parts))
        )

        job_url = f"{base_url}/job/publicjobs/{ident}"
        app_url = job_url
        posted = item.get("PublishedDate") or item.get("UpdatedDate")

        job = make_job(
            ident,
            title,
            company.name,
            location,
            desc,
            company.ats_provider,
            "company_career",
            job_url,
            app_url,
            company.careers_url,
            posting=posted,
        )
        jobs.append(job)

    return jobs


class TurboHireCareerAdapter(JobSource):
    """Adapter for employers on the TurboHire ATS platform."""

    async def fetch_jobs(self, company: Company) -> tuple[list[Job], int]:
        parts = company.ats_identifier.split("|")
        if len(parts) == 2:
            subdomain, org_id = parts[0].strip(), parts[1].strip()
        else:
            org_id = company.ats_identifier.strip()
            hostname = urlparse(company.careers_url).hostname or ""
            if hostname.endswith(".turbohire.co"):
                subdomain = hostname.split(".")[0]
            else:
                subdomain = company.name.lower().replace(" ", "")

        base_url = f"https://{subdomain}.turbohire.co"
        token_headers = {
            "Origin": base_url,
            "Referer": f"{base_url}/",
            "Accept": "application/json, text/plain, */*",
        }

        async with adapters.client(timeout=30) as x:
            # 1. Fetch unauthenticated session token
            token_resp = await adapters.request(x, "GET", TURBOHIRE_GUEST_ENDPOINT, headers=token_headers)
            token_resp.raise_for_status()
            token_data = token_resp.json()
            if not isinstance(token_data, dict) or not token_data.get("access_token"):
                raise ValueError("TurboHire failed to return a valid access token")
            access_token = token_data["access_token"]

            # 2. Fetch job listings using authenticated bearer token
            jobs_url = f"{TURBOHIRE_API_JOBS_URL}?orgId={org_id}&pageType=0"
            api_headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "Origin": base_url,
                "Referer": f"{base_url}/",
                "Accept": "application/json, text/plain, */*",
            }
            jobs_resp = await adapters.request(x, "POST", jobs_url, headers=api_headers, json={})
            jobs_resp.raise_for_status()
            payload = jobs_resp.json()

            jobs = parse_turbohire_jobs(payload, company, base_url)
            return jobs, len(jobs)
