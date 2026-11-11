"""Collect India career listings and embedded descriptions from Google Careers SSR pages."""
import json
import re
from urllib.parse import urlparse

BASE_URL = "https://www.google.com/about/careers/applications/jobs/results/"
MAX_PAGES = 25
_CALLBACK_RE = re.compile(r"AF_initDataCallback\(\{key:\s*'(ds:\d+)',.*?data:(.*?)\}\);\s*</script>", re.S)


def extract_results_payload(html_text):
    """Parse Google's ds:1 AF_initDataCallback payload containing job listings and total count."""
    decoder = json.JSONDecoder()
    for match in _CALLBACK_RE.finditer(html_text or ""):
        if match.group(1) != "ds:1":
            continue
        raw = match.group(2).lstrip()
        try:
            data, _ = decoder.raw_decode(raw)
        except json.JSONDecodeError:
            continue
        if isinstance(data, list) and data and isinstance(data[0], list):
            rows = data[0]
            total = int(data[2]) if len(data) > 2 and str(data[2]).isdigit() else len(rows)
            page_size = int(data[3]) if len(data) > 3 and str(data[3]).isdigit() else 20
            return rows, total, max(1, page_size)
    raise ValueError("Google Careers results payload is missing or changed format")


def _html_section(field):
    if isinstance(field, list) and len(field) > 1 and isinstance(field[1], str):
        return field[1]
    return ""


def _job_slug(title):
    return re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")


def parse_google_job(row, company_name, career_page_url):
    """Convert a Google Careers ds:1 row array into a Job dataclass instance."""
    from .adapters import clean, epoch_ms, location_text, make_job

    if not isinstance(row, list) or len(row) < 13:
        return None
    job_id = str(row[0] or "").strip()
    title = str(row[1] or "").strip()
    if not job_id or not title:
        return None

    apply_url = str(row[2] or "").strip()
    slug = _job_slug(title)
    detail_url = f"{BASE_URL}{job_id}-{slug}" if slug else f"{BASE_URL}{job_id}"

    loc_items = row[9] if isinstance(row[9], list) else []
    locations = [loc[0] for loc in loc_items if isinstance(loc, list) and loc and isinstance(loc[0], str)]
    location = location_text(locations)

    about_html = _html_section(row[10])
    qualifications_html = _html_section(row[4])
    responsibilities_html = _html_section(row[3])
    description = clean("\n".join(part for part in (about_html, qualifications_html, responsibilities_html) if part))
    if not description:
        return None

    posting = None
    ts_pair = row[12]
    if isinstance(ts_pair, list) and ts_pair and isinstance(ts_pair[0], (int, float)) and ts_pair[0] > 0:
        posting = epoch_ms(float(ts_pair[0]) * 1000)

    return make_job(
        job_id,
        title,
        company_name,
        location,
        description,
        "google_careers",
        "company_career",
        detail_url,
        apply_url or detail_url,
        career_page_url,
        posting=posting,
    )


class GoogleCareersAdapter:
    async def fetch_jobs(self, company):
        from .adapters import client, request

        parsed = urlparse(company.careers_url)
        if parsed.scheme != "https" or parsed.hostname != "www.google.com":
            raise ValueError("Google Careers URL does not match www.google.com")

        location_query = company.ats_identifier.strip() or "India"
        async with client(timeout=30) as x:
            discovered = {}
            page_no = 1
            total_expected = None
            while page_no <= MAX_PAGES:
                params = {"location": location_query, "page": str(page_no)}
                response = await request(x, "GET", BASE_URL, params=params)
                response.raise_for_status()
                rows, advertised, page_size = extract_results_payload(response.text)
                if total_expected is None:
                    total_expected = advertised
                if not rows:
                    break
                new_added = 0
                for row in rows:
                    job_id = str(row[0] or "").strip() if isinstance(row, list) and row else ""
                    if job_id and job_id not in discovered:
                        discovered[job_id] = row
                        new_added += 1
                if new_added == 0 or len(discovered) >= advertised or len(rows) < page_size:
                    break
                page_no += 1

        jobs = [
            job
            for row in discovered.values()
            for job in [parse_google_job(row, company.name, company.careers_url)]
            if job is not None
        ]
        return jobs, len(discovered)
