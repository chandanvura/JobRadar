"""Run an on-demand, read-only scan and export jobs matching profile.json."""
import argparse
import asyncio
import csv
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit

from scraper.main import fetch_company_jobs, load_companies
from scraper.models import Job
from scraper.normalization import enrich, posted_age_hours

ROOT = Path(__file__).resolve().parent


def remote_india(location):
    text = location.lower()
    return bool(re.search(r"\bremote\b|work from home|\bwfh\b", text) and
                re.search(r"\bindia\b|anywhere|worldwide", text) and
                not re.search(r"\b(?:us|usa|united states|europe|uk|united kingdom)\s+only\b", text))


def match(job, profile):
    """Keep unverified dates/experience visible, but never label them as fresh/eligible."""
    if job.city not in profile["cities"] and not (profile["allow_remote_india"] and remote_india(job.location)):
        return None
    if job.role_category not in profile["roles"]:
        return None
    if any(re.search(rf"\b{re.escape(term)}\b", job.title, re.I) for term in profile["exclude_title_terms"]):
        return None
    if job.experience_min is not None and job.experience_min > profile["maximum_required_years"]:
        return None
    if job.experience_max is not None and job.experience_max > profile["maximum_required_years"]:
        return None
    age = posted_age_hours(job.posted_at)
    if age is None:
        age = job.reported_age_hours
    # Employer-relative "today" is a 24-hour bucket, not an invented timestamp.
    if age is None and job.posted_label and re.search(r"\b(?:posted\s+)?today\b", job.posted_label, re.I):
        bucket = "24h (employer label)"
    elif age is None:
        bucket = "Date unverified"
    elif age < -6 or age > max(profile["freshness_hours"]):
        return None
    else:
        bucket = next((f"{hours}h" for hours in profile["freshness_hours"] if age <= hours), "Date unverified")
    relevant = [skill for skill in job.skills if skill.casefold() in {s.casefold() for s in profile["skills"]}]
    return {"source": job.ats_provider, "company": job.company, "title": job.title,
            "location": job.location, "employment_type": job.employment_type,
            "experience": job.experience_label, "posted_at": job.posted_at,
            "posted_label": job.posted_label, "freshness": bucket,
            "matched_skills": relevant, "job_url": job.job_url,
            "application_url": job.application_url, "description": job.description,
            "first_seen_at": job.first_seen_at,
            "score": len(relevant) * 3 + (20 if bucket.startswith("24h") else 10 if bucket == "72h" else 0)}


def import_csv(path):
    """Import user-supplied LinkedIn/other site rows; no login or browser bypass."""
    with path.open(newline="", encoding="utf-8-sig") as handle:
        for row in csv.DictReader(handle):
            url = (row.get("job_url") or row.get("url") or "").strip()
            if not urlsplit(url).scheme in ("http", "https"):
                continue
            yield Job(row.get("job_id") or url, row.get("title", ""), row.get("company", ""),
                      row.get("location", ""), row.get("description", ""),
                      urlsplit(url).hostname or "import", "user_export", url,
                      row.get("application_url") or url, url,
                      posted_at=row.get("posted_at") or None,
                      posted_label=row.get("posted_label") or None)


def canonical(url):
    parts = urlsplit(url)
    return urlunsplit((parts.scheme.lower(), parts.netloc.lower(), parts.path.rstrip("/"), "", ""))


async def scan(companies, concurrency=4):
    semaphore = asyncio.Semaphore(concurrency)
    async def one(company):
        async with semaphore:
            try:
                jobs, _ = await fetch_company_jobs(company)
                return jobs, None
            except Exception as exc:
                return [], f"{company.name}: {type(exc).__name__}: {exc}"
    return await asyncio.gather(*(one(c) for c in companies))


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit-sources", type=int, default=0, help="Test only the first N enabled sources; 0 scans all")
    parser.add_argument("--import-csv", type=Path, action="append", default=[], help="Import a user-supplied CSV of LinkedIn or other jobs")
    parser.add_argument("--output", type=Path, default=Path("job-search-results"))
    args = parser.parse_args()
    profile_path = Path(os.getenv("JOBRADAR_PROFILE", str(ROOT / "profile.json")))
    if not profile_path.is_file():
        profile_path = ROOT / "profile.example.json"
    profile = json.loads(profile_path.read_text(encoding="utf-8"))
    companies = [c for c in load_companies() if c.enabled]
    if args.limit_sources:
        companies = companies[:args.limit_sources]
    scans = await scan(companies)
    jobs = [j for batch, _ in scans for j in batch]
    for path in args.import_csv:
        jobs.extend(import_csv(path))
    matched = [record for job in jobs if (record := match(enrich(job), profile))]
    unique = {}
    for record in matched:
        key = canonical(record["application_url"] or record["job_url"])
        if key not in unique or unique[key]["score"] < record["score"]:
            unique[key] = record
    results = sorted(unique.values(), key=lambda r: (-r["score"], r["company"], r["title"]))
    failures = [error for _, error in scans if error]
    args.output.mkdir(parents=True, exist_ok=True)
    (args.output / "jobs.json").write_text(json.dumps({"scanned_at": datetime.now(timezone.utc).isoformat(),
        "sources_attempted": len(companies), "source_errors": failures, "jobs": results}, indent=2), encoding="utf-8")
    with (args.output / "jobs.csv").open("w", newline="", encoding="utf-8") as handle:
        columns = ["source", "company", "title", "location", "employment_type", "experience", "posted_at",
                   "posted_label", "freshness", "matched_skills", "job_url", "application_url", "description", "first_seen_at", "score"]
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        writer.writerows({**row, "matched_skills": "; ".join(row["matched_skills"])} for row in results)
    print(f"Scanned {len(companies)} sources; {len(results)} matching jobs; {len(failures)} source errors. Results: {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
