import json
import re
from urllib.parse import urlparse

from .adapters import JobSource, clean, location_text, make_job
from .models import Company, JobBatch
from .locations import india_discovery_location

OFFICIAL_CAREERS_URL = "https://www.deel.com/careers/"
INDIA_LOCATION_KEYWORDS = ("india", "bangalore", "bengaluru", "hyderabad", "remote india", "remote (india)", "remote - india")


def extract_deel_jobs_json(html_text: str) -> list[dict]:
    """
    Extract the embedded JSON array from Deel's careers HTML page.
    Look for \"jobs\":[...] before ,\"departments\":.
    Handles escaped quotes in Next.js / RSC payload.
    """
    if not html_text:
        raise ValueError("Deel careers page response is empty")

    marker = '\\"jobs\\":['
    dept_marker = ',\\"departments\\":'
    idx = html_text.find(marker)
    if idx == -1:
        # Fallback to unescaped if page format changes
        marker = '"jobs":['
        dept_marker = ',"departments":'
        idx = html_text.find(marker)
        if idx == -1:
            raise ValueError("Could not find embedded jobs JSON in Deel careers HTML")
        start = idx + len(marker) - 1
        end = html_text.find(dept_marker, start)
        if end == -1:
            raise ValueError("Could not find departments boundary in Deel careers HTML")
        raw_json = html_text[start:end]
    else:
        start = idx + len(marker) - 1
        end = html_text.find(dept_marker, start)
        if end == -1:
            raise ValueError("Could not find departments boundary in Deel careers HTML")
        raw_escaped = html_text[start:end]
        raw_json = raw_escaped.replace('\\"', '"').replace('\\\\', '\\')

    try:
        data = json.loads(raw_json)
    except Exception as e:
        raise ValueError(f"Failed to parse Deel embedded jobs JSON: {e}") from e

    if not isinstance(data, list):
        raise ValueError(f"Deel embedded jobs JSON expected to be list, got {type(data)}")

    return data


def is_india_location(locations: list[str]) -> bool:
    """Check if any of the locations refer to India / Bangalore / Hyderabad / Remote India."""
    for loc in locations:
        if not loc or not isinstance(loc, str):
            continue
        text = loc.strip().lower()
        if any(keyword in text for keyword in INDIA_LOCATION_KEYWORDS):
            return True
        if india_discovery_location(loc):
            return True
    return False


def parse_deel_job(item: dict, company_name: str, career_page_url: str):
    """
    Parse a single job item from Deel's jobs array into a Job object.
    Only returns a Job if it matches India / Bangalore / Hyderabad / Remote India.
    """
    attrs = item.get("attributes") or {}

    # Gather locations
    raw_all_locs = attrs.get("all_locations") or []
    raw_loc_list = attrs.get("locations_list") or []

    loc_candidates = []
    if isinstance(raw_all_locs, list):
        for loc in raw_all_locs:
            if isinstance(loc, str):
                loc_candidates.append(loc)
            elif isinstance(loc, dict) and loc.get("location"):
                loc_candidates.append(str(loc["location"]))
    elif isinstance(raw_all_locs, str):
        loc_candidates.append(raw_all_locs)

    if isinstance(raw_loc_list, list):
        for loc in raw_loc_list:
            if isinstance(loc, dict) and loc.get("location"):
                loc_candidates.append(str(loc["location"]))
            elif isinstance(loc, str):
                loc_candidates.append(loc)

    loc_name = attrs.get("location_name")
    if loc_name and isinstance(loc_name, str):
        loc_candidates.append(loc_name)

    # Filter for India locations
    if not is_india_location(loc_candidates):
        return None

    title = (attrs.get("title") or "").strip()
    if not title:
        return None

    # Identify job ID
    job_id = attrs.get("ashby_id") or attrs.get("job_id") or str(item.get("id") or "")
    if not job_id:
        return None

    # Form links
    ext_link = attrs.get("external_link") or ""
    slug = attrs.get("slug") or ""
    if ext_link:
        job_url = ext_link
    elif slug:
        job_url = f"https://www.deel.com{slug}" if slug.startswith("/") else f"https://www.deel.com/{slug}"
    else:
        job_url = f"https://jobs.deel.com/deel/job-details/{job_id}/application"

    apply_url = ext_link or job_url
    published_date = attrs.get("ashby_published_date") or attrs.get("ashby_updated_at")

    # Build location string
    # Prioritize India-relevant locations or clean representation
    seen_locs = list(dict.fromkeys(loc_candidates))
    india_locs = [l for l in seen_locs if is_india_location([l])]
    formatted_location = location_text(*(india_locs if india_locs else seen_locs))

    desc = clean(attrs.get("full_job_description") or "")
    if not desc:
        department = attrs.get("department_name") or ""
        team = attrs.get("team_name") or ""
        employment_type = attrs.get("employment_type") or ""
        comp = attrs.get("compensation_tier_summary") or ""
        desc_parts = [p for p in [title, department, team, employment_type, comp] if p]
        desc = " | ".join(desc_parts)

    return make_job(
        str(job_id),
        title,
        company_name,
        formatted_location,
        desc,
        "deel",
        "company_career",
        job_url,
        apply_url,
        career_page_url,
        posting=published_date,
    )


class DeelAdapter(JobSource):
    """
    Adapter for Deel careers page (https://www.deel.com/careers/).
    Extracts embedded Next.js JSON array containing Ashby job records.
    Filters for positions in India / Bangalore / Hyderabad / Remote India.
    """

    async def fetch_jobs(self, company: Company):
        from .adapters import client, request

        target_url = company.careers_url or OFFICIAL_CAREERS_URL
        async with client(timeout=30) as x:
            resp = await request(x, "GET", target_url)
            resp.raise_for_status()
            html_text = resp.text

        raw_items = extract_deel_jobs_json(html_text)
        total_discovered = len(raw_items)

        jobs = []
        for item in raw_items:
            job = parse_deel_job(item, company.name, target_url)
            if job is not None:
                jobs.append(job)

        return JobBatch(jobs), total_discovered
