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


def selected_repairs(companies, catalog, names):
    """Explicit adapter-only repairs; never infer a full scan from a code push."""
    missing_sources([], catalog)
    if not names or len(names) > 50 or len(set(names)) != len(names):
        raise ValueError("Select 1 to 50 distinct company names")
    registry = {c.name: c for c in companies if c.enabled}
    live = {row['name']: row for row in catalog['companies']}
    if set(names) - (registry.keys() & live.keys()):
        raise ValueError("Selected repairs must exist in the enabled registry and live catalog")
    updates = []
    for name in names:
        c = registry[name]
        update = dict(live[name])
        update.update(name=name, careers_url=c.careers_url, ats_provider=c.ats_provider,
                      ats_identifier=c.ats_identifier, priority=c.priority,
                      warning='Source updated; awaiting verification')
        updates.append(update)
    return updates


def changed_sources(companies, catalog):
    missing_sources([], catalog)  # Require a live catalog before any mutation.
    existing = {row["name"].strip().casefold(): row for row in catalog["companies"]}
    updates = []
    for c in companies:
        row = existing.get(c.name.strip().casefold())
        if not c.enabled or not row: continue
        pending = (row.get("warning") or "") in (
            "Limited coverage: source update awaiting verification",
            "Source updated; awaiting verification",
        )
        if (normalized_source_url(row.get("careers_url")) == normalized_source_url(c.careers_url)
                and row.get("ats_provider") == c.ats_provider and not pending): continue
        update = {key: row.get(key) for key in ("last_checked_at", "last_success_at", "error_count",
                  "jobs_found", "candidate_jobs", "eligible_jobs")}
        update.update(name=c.name, careers_url=c.careers_url, ats_provider=c.ats_provider,
                      ats_identifier=c.ats_identifier, priority=c.priority,
                      warning=("Limited coverage: source update awaiting verification"
                               if (row.get("warning") or "").startswith("Limited coverage")
                               else "Source updated; awaiting verification"))
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
    selected = json.loads(os.environ['JOBRADAR_REPAIR_COMPANIES']) if os.environ.get('JOBRADAR_REPAIR_COMPANIES') else None
    additions = [] if selected is not None else missing_sources(companies, catalog)
    repairs = selected_repairs(companies, catalog, selected) if selected is not None else changed_sources(companies, catalog)
    if selected is not None and os.environ.get('JOBRADAR_VERIFY_SOURCE_UPDATES') != 'true':
        raise ValueError('Explicit repairs require live collection verification')
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
    # A saved mapping is not a verified repair. Pending sources remain retryable
    # and fail this workflow until a real collection replaces the pending warning.
    remaining = changed_sources(companies, live)
    if selected is not None:
        live_rows = {row['name']: row for row in live['companies']}
        remaining = [row for row in pending if row['name'] not in live_rows
                     or live_rows[row['name']].get('last_checked_at') != row.get('last_checked_at')
                     or live_rows[row['name']].get('error_count')
                     or (live_rows[row['name']].get('warning') or '').startswith(('Limited coverage', 'Source updated'))
                     or live_rows[row['name']].get('ats_provider') != row['ats_provider']
                     or normalized_source_url(live_rows[row['name']].get('careers_url')) != normalized_source_url(row['careers_url'])]
    if (selected is None and missing_sources(companies, live)) or remaining:
        raise RuntimeError("Company sources not yet verified in live catalog")
    print(f"Verified {len(pending)} company source updates in the live portal; scheduled scans remain unchanged")


if __name__ == "__main__":
    main()
