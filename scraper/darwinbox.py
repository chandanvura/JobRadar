"""Darwinbox ATS career platform adapter.

Supports high-value employers hosted on Darwinbox (Moneyview, Unacademy,
Sonata Software, Darwinbox, Porter, PharmEasy, Tata 1mg, Rapido, Clear, etc.)
by fetching active job postings via the candidate API.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import time
from typing import TYPE_CHECKING
import urllib.error
import urllib.request
from urllib.parse import urlparse

if TYPE_CHECKING:
    from .adapters import JobSource
    from .models import Company, Job


def _fetch_darwinbox_urllib(url: str, payload_bytes: bytes, subdomain: str = "") -> dict:
    if not subdomain:
        hostname = urlparse(url).hostname or ""
        if ".darwinbox.in" in hostname:
            subdomain = hostname.split(".")[0]
        else:
            subdomain = ""

    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "application/json, text/plain, */*",
        "Content-Type": "application/json",
        "Origin": f"https://{subdomain}.darwinbox.in" if subdomain else "https://darwinbox.in",
        "Referer": f"https://{subdomain}.darwinbox.in/ms/candidate/careers" if subdomain else "https://darwinbox.in",
        "sec-ch-ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-origin",
    }

    parsed_url = urllib.parse.urlparse(url)
    if parsed_url.scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme: {parsed_url.scheme}")

    last_exc = None
    for attempt in range(3):
        req = urllib.request.Request(
            url,
            data=payload_bytes,
            headers=headers,
        )
        try:
            with urllib.request.urlopen(req, timeout=20) as resp:  # nosec B310 - verified http/https above
                return json.loads(resp.read().decode("utf-8"))
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            last_exc = exc
            if attempt < 2:
                time.sleep(2 ** attempt)
            else:
                raise
    if last_exc:
        raise last_exc
    return {}


def parse_darwinbox_jobs(payload: dict | list, company: Company, subdomain: str) -> list[Job]:
    """Parse Darwinbox JSON API records into normalized Job models."""
    from .adapters import clean, location_text, make_job

    if isinstance(payload, dict):
        raw_items = payload.get("data")
        if raw_items is None and isinstance(payload.get("jobs"), list):
            raw_items = payload.get("jobs")
    elif isinstance(payload, list):
        raw_items = payload
    else:
        raise ValueError("Darwinbox jobs response is not a recognized schema")

    if raw_items is None:
        return []

    if not isinstance(raw_items, list) or len(raw_items) > 1000:
        raise ValueError("Darwinbox jobs array is missing, malformed, or exceeds bounded limit")

    seen_ids: set[str] = set()
    jobs: list[Job] = []

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        ident = str(item.get("id") or item.get("_id") or item.get("internal_job_code") or "").strip()
        raw_title = (
            str(item.get("title") or "").strip()
            or str(item.get("designation_display_name") or "").strip()
            or str(item.get("designation_title_name") or "").strip()
        )
        title = clean(raw_title)
        if not ident or not title:
            continue

        if ident in seen_ids:
            continue
        seen_ids.add(ident)

        loc_raw = (
            item.get("officelocation_show_arr")
            or item.get("locations")
            or item.get("officelocations_area")
            or item.get("officelocations_without_area")
            or item.get("country")
            or ""
        )
        if isinstance(loc_raw, list):
            location = location_text(*[clean(str(l)) for l in loc_raw if l])
        else:
            location = location_text(clean(str(loc_raw)))

        raw_desc = (
            item.get("jd")
            if item.get("jd") is not None
            else (item.get("jd_summary") if item.get("jd_summary") is not None else item.get("description"))
        )
        clean_desc = clean(str(raw_desc or ""))

        dept = clean(str(item.get("department_name") or item.get("department_name_only") or ""))
        exp = clean(str(item.get("experience") or ""))

        meta_parts: list[str] = []
        if dept:
            meta_parts.append(f"Department: {dept}")
        if exp:
            meta_parts.append(f"Experience: {exp}")

        desc = (
            "\n\n".join(meta_parts + [clean_desc])
            if meta_parts and clean_desc
            else (clean_desc or "\n\n".join(meta_parts))
        )

        job_url = f"https://{subdomain}.darwinbox.in/ms/candidatev2/main/careers/jobDetails/{ident}"
        app_url = job_url

        posted_val = item.get("posted_on") or item.get("created_on")
        posted = None
        if isinstance(posted_val, (int, float)) and posted_val > 0:
            if posted_val > 1e11:
                posted_val /= 1000.0
            try:
                posted = datetime.fromtimestamp(posted_val, tz=timezone.utc).isoformat()
            except (OverflowError, ValueError, OSError):
                posted = None
        elif isinstance(posted_val, str) and posted_val.strip():
            posted = posted_val.strip()

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


class DarwinboxCareerAdapter:
    """Adapter for employers on the Darwinbox career platform."""

    async def fetch_jobs(self, company: Company) -> tuple[list[Job], int]:
        parts = company.ats_identifier.split("|")
        subdomain = parts[0].strip()
        if not subdomain:
            hostname = urlparse(company.careers_url).hostname or ""
            if hostname.endswith(".darwinbox.in"):
                subdomain = hostname.split(".")[0]
            else:
                subdomain = company.name.lower().replace(" ", "")

        all_items: list[dict] = []
        page = 1
        limit = 100
        api_url = f"https://{subdomain}.darwinbox.in/ms/candidateapi/job/alljobs"

        while True:
            body = {"page": page, "limit": limit}
            payload = None
            try:
                from . import adapters
                async with adapters.client(timeout=15) as x:
                    resp = await adapters.request(
                        x,
                        "POST",
                        api_url,
                        json=body,
                        headers={
                            "Content-Type": "application/json",
                            "Accept": "application/json, text/plain, */*",
                        },
                    )
                    resp.raise_for_status()
                    payload = resp.json()
            except Exception:
                # Cloudflare TLS block on httpx; fallback to standard urllib transport
                payload = await asyncio.to_thread(
                    _fetch_darwinbox_urllib, api_url, json.dumps(body).encode("utf-8"), subdomain
                )

            if not isinstance(payload, dict):
                raise ValueError("Darwinbox response is not a valid JSON object")

            raw_items = payload.get("data")
            if raw_items is None and isinstance(payload.get("jobs"), list):
                raw_items = payload.get("jobs")

            if not isinstance(raw_items, list):
                break

            all_items.extend([i for i in raw_items if isinstance(i, dict)])
            cnt = payload.get("job_counts")
            total_count = int(cnt) if isinstance(cnt, (int, str)) and str(cnt).isdigit() else len(all_items)
            if len(all_items) >= total_count or len(raw_items) < limit or page >= 5:
                break
            page += 1

        jobs = parse_darwinbox_jobs(all_items, company, subdomain)
        return jobs, len(jobs)


try:
    from .adapters import JobSource
    JobSource.register(DarwinboxCareerAdapter)
except (ImportError, AttributeError):
    pass
