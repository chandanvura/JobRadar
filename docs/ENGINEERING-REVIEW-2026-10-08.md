# Engineering review: safe ingestion and honest health

JobRadar collects employer feeds using standard Python HTTP on GitHub Actions,
uploads bounded candidate batches to a protected Cloudflare Worker, and stores
them in D1. The public portal prefers live reads and can switch to a labeled
static catalog captured at deployment. The existing recovery scheduler dispatches
Actions; it does not collect employer feeds.

## Repairs

| Failure mode | Previous behavior | Repair |
|---|---|---|
| Finalization omits `seen_job_keys` | Missing manifest becomes an empty list and can retire all jobs for successful companies | Require explicit arrays before database reads or writes |
| Invalid job accompanies finalization | Valid records and finalization can proceed despite rejected records | Reject the complete finalization request before writes |
| Company manifest exceeds 1,000 records | Names silently truncate | Reject oversized manifests with HTTP 413 |
| Incomplete scan records zero source failures | Aggregate health can return HTTP 200 | Require successful scan status; expose `pipeline_ok` and `scan_ok` separately |
| Invalid or future scan completion date | Invalid freshness output or apparent healthy future scan | Mark freshness invalid and return HTTP 503 |
| Fresh partial scan needs recovery | Manual scan gate refuses recovery | Allow known partial scans when DB and ingestion are available; retain quota and scheduled freshness guards |

The collector still uploads all job batches before sending its finalization
manifest. Missing or malformed manifests are rejected with HTTP 400. Explicit
empty arrays are valid: an authoritative successful empty result may retire old
jobs. Ordinary job batches retain their rejection reporting so the collector can
withhold finalization after any rejected upload.

`pipeline_ok` describes configured, fresh ingestion with a readable database.
`scan_ok` requires a successful latest scan with no recorded employer errors.
Neither flag proves every employer feed is complete: limited-coverage warnings
remain independent and visible. Aggregate `ok` requires both flags. Health
responses never use the static public backup.

## Verification

Run from the repository root:

```bash
python -m pytest -q
python -m bandit -q -r scraper scripts
bash scripts/verify-harness.sh web
```

The compiled Worker/local D1 regression exercises malformed and oversized
manifests, mixed valid/invalid finalization, unchanged stored jobs and scan
records after rejection, explicit empty results, partial/degraded/failed scan
statuses, invalid/future/stale dates, and recovery from live read failures.
Python regression tests cover manual and scheduled recovery from both degraded
and partial scan statuses, including quota and disconnected-ingestion guards.

Read production diagnostics without collecting employer feeds:

```bash
curl --silent --show-error --write-out '\nHTTP %{http_code}\n' \
  https://jobradar.chandanvura.workers.dev/api/health
curl --fail --silent --show-error \
  'https://jobradar.chandanvura.workers.dev/api/dashboard?source=backup' \
  | jq '{data_mode, snapshot_at, companies: (.companies|length), jobs: (.jobs|length)}'
python -m scripts.coverage_snapshot --output /tmp/jobradar-coverage.json
```

No schema migration, extra database query per normal request, new paid service,
collector server, proxy network, browser scraper, eligibility change or company
registry remapping is introduced. Employer errors are still unresolved until
their complete feeds are independently verified.
