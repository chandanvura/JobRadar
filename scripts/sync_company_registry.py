"""Publish registry additions and repaired sources without changing scan metrics."""
import asyncio
import json
import os
from urllib.parse import urlsplit
from urllib.request import Request, urlopen
from scraper.main import load_companies, scrape
from scraper.normalization import TARGET_CITIES


def missing_sources(companies, catalog):
    if catalog.get("data_mode") == "backup" or not isinstance(catalog.get("companies"), list):
        raise ValueError("Live company catalog required; defer registry synchronization")
    existing = {row["name"].strip().casefold() for row in catalog["companies"]}
    return [{"name": c.name, "careers_url": c.careers_url,
             "ats_provider": c.ats_provider, "ats_identifier": c.ats_identifier,
             "priority": c.priority, "warning": "Awaiting first scheduled scan",
             "last_checked_at": None, "last_success_at": None,
             "error_count": 0, "jobs_found": 0, "candidate_jobs": 0, "eligible_jobs": 0}
            for c in companies if c.enabled and c.name.strip().casefold() not in existing]


def normalized_source_url(value):
    parsed = urlsplit(value or "")
    return parsed._replace(netloc=parsed.netloc.lower().removesuffix(":443"), path=parsed.path or "/").geturl()


def changed_sources(companies, catalog):
    missing_sources([], catalog)  # Require a live catalog before any mutation.
    existing = {row["name"].strip().casefold(): row for row in catalog["companies"]}
    updates = []
    for c in companies:
        row = existing.get(c.name.strip().casefold())
        if not c.enabled or not row: continue
        if normalized_source_url(row.get("careers_url")) == normalized_source_url(c.careers_url) and row.get("ats_provider") == c.ats_provider: continue
        update = {key: row.get(key) for key in ("last_checked_at", "last_success_at", "error_count",
                  "jobs_found", "candidate_jobs", "eligible_jobs")}
        update.update(name=c.name, careers_url=c.careers_url, ats_provider=c.ats_provider,
                      ats_identifier=c.ats_identifier, priority=c.priority,
                      warning="Source repaired; awaiting scheduled rescan")
        updates.append(update)
    return updates


async def refresh_repairs(companies, updates):
    """Check only changed sources; do not create a partial full-scan record."""
    names = {row["name"] for row in updates}
    if len(names) > 50:
        raise ValueError("More than 50 source repairs; use the ordinary scheduled scan")
    semaphore = asyncio.Semaphore(3)
    results = await asyncio.gather(*(scrape(company, semaphore, asyncio.Semaphore(1))
                                  for company in companies if company.name in names))
    jobs, checked = [], []
    for rows, status, error, count in results:
        if error:
            # Keep the previous metrics and explicit pending warning on failure.
            checked.append(next(row for row in updates if row["name"] == status["name"]))
            print(f"Source repair pending: {status['name']}")
            continue
        checked.append(status)
        for job in rows:
            if job.city not in TARGET_CITIES or job.role_category == "Other": continue
            item = job.as_dict()
            item["description"] = item.get("description", "")[:4000]
            jobs.append(item)
        print(f"Verified repaired feed: {status['name']}: {count} listings")
    return jobs, checked


def main():
    # Fixed production origin prevents sending ingestion credentials elsewhere.
    origin = "https://jobradar.chandanvura.workers.dev"
    headers = {"User-Agent": "JobRadar/1.2 (company registry sync)", "Accept": "application/json"}
    dashboard_request = Request(origin + "/api/dashboard", headers=headers)
    with urlopen(dashboard_request, timeout=30) as response:  # nosec B310
        catalog = json.load(response)
    companies = load_companies()
    additions = missing_sources(companies, catalog)
    repairs = changed_sources(companies, catalog)
    jobs = []
    if repairs and os.environ.get("JOBRADAR_VERIFY_SOURCE_UPDATES") == "true":
        jobs, repairs = asyncio.run(refresh_repairs(companies, repairs))
    pending = additions + repairs
    if not pending:
        print("All enabled company sources match the live catalog")
        return
    # Bounded batches keep large XML catalogs below the API body/write limits.
    batches = [jobs[index:index + 200] for index in range(0, len(jobs), 200)] or [[]]
    for index, batch in enumerate(batches):
        payload = {"companies": pending if index == 0 else []}
        if batch: payload["jobs"] = batch
        request = Request(origin + "/api/ingest", data=json.dumps(payload).encode(),
                          headers={**headers, "Content-Type": "application/json",
                                   "Authorization": "Bearer " + os.environ["JOBRADAR_INGEST_SECRET"]},
                          method="POST")
        with urlopen(request, timeout=60) as response:  # nosec B310
            result = json.load(response)
        if result.get("accepted") != len(batch) or result.get("rejected") != 0:
            raise RuntimeError("Company source publication failed")
    with urlopen(dashboard_request, timeout=30) as response:  # nosec B310
        live = json.load(response)
    if missing_sources(companies, live) or changed_sources(companies, live):
        raise RuntimeError("Company sources not yet verified in live catalog")
    print(f"Verified {len(pending)} company source updates in the live portal; scheduled scans remain unchanged")


if __name__ == "__main__":
    main()
