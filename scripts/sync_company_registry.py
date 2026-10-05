"""Publish only newly registered companies; scheduled scans supply job counts."""
import json
import os
from urllib.request import Request, urlopen
from scraper.main import load_companies


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


def main():
    # Fixed production origin prevents sending ingestion credentials elsewhere.
    origin = "https://jobradar.chandanvura.workers.dev"
    headers = {"User-Agent": "JobRadar/1.2 (company registry sync)", "Accept": "application/json"}
    dashboard_request = Request(origin + "/api/dashboard", headers=headers)
    with urlopen(dashboard_request, timeout=30) as response:  # nosec B310
        catalog = json.load(response)
    pending = missing_sources(load_companies(), catalog)
    if not pending:
        print("All enabled company sources already appear in the live catalog")
        return
    request = Request(origin + "/api/ingest", data=json.dumps({"companies": pending}).encode(),
                      headers={**headers, "Content-Type": "application/json",
                               "Authorization": "Bearer " + os.environ["JOBRADAR_INGEST_SECRET"]},
                      method="POST")
    with urlopen(request, timeout=60) as response:  # nosec B310
        result = json.load(response)
    if result.get("accepted") != 0 or result.get("rejected") != 0:
        raise RuntimeError("Company registration failed")
    with urlopen(dashboard_request, timeout=30) as response:  # nosec B310
        live = json.load(response)
    if missing_sources(load_companies(), live):
        raise RuntimeError("New sources not yet verified in live catalog")
    print(f"Verified {len(pending)} new company sources in the live portal; scheduled scans remain unchanged")


if __name__ == "__main__":
    main()
