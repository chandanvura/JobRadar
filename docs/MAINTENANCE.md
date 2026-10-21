# Operating horizon: October 2026–October 2027

## Architecture decision

JobRadar is a client-rendered React application and a small Cloudflare API. It
has no server-rendered pages, server actions or runtime image transforms. Vite
builds static assets and the Worker separately. Removing the unused Next/vinext
and RSC infrastructure removes their advisory chains and the custom braces
patch. Plain HTML, external scripts and a same-origin CSP serve the interface.

Node 24 LTS is the development/CI baseline, with planned support beyond this
one-year horizon. Python 3.12 remains the collector baseline. Use locked package
versions and `npm ci`; do not install floating latest versions in deployments.
The Miniflare test dependency uses a stable release and the Worker uses the same
supported compatibility date. Wrangler's own vendor-selected transitive versions
are tested by the same build/integration gates.

References checked October 21, 2026:
- Node release support schedule: https://github.com/nodejs/Release#release-schedule
- Cloudflare runtime compatibility dates: https://developers.cloudflare.com/workers/configuration/compatibility-dates/
- Cloudflare D1 limits: https://developers.cloudflare.com/d1/platform/limits/

## Scenario planning, not a prediction guarantee

| Scenario | Automatic response | Limit / next action |
|---|---|---|
| Employer listings change during pagination | Discard inconsistent source snapshot, bounded whole-source retry, preserve prior data for failed sources | Repeated failure stays visible; adapter may require a reviewed repair |
| Provider throttles or times out | Deadlines, backoff, concurrency bounds and source isolation | No paid proxy or bypass; respect published cooldowns |
| D1 quota is exhausted | Fail writes honestly, pause recovery dispatch, serve explicitly dated public backup | Fresh jobs and persisted notifications wait for quota recovery |
| GitHub schedule is delayed or disabled for inactivity | Separate Cloudflare scheduler can restore allowlisted inactive workflows and dispatch one scan | Requires a valid scoped Actions token and both providers |
| Recovery keeps failing | 30-minute cooldown after completed workflows prevents dispatch storms | Investigate repeated failure instead of increasing retries |
| Dependency advisory appears | Dependabot proposes a PR; full/production audits, tests, CodeQL and required checks review it | No autonomous production merge; security fixes still need review |
| Data is damaged | Daily SQL export requires disposable SQLite restore verification; artifacts retained 90 days | Verify a staging D1 restore before production recovery |
| Browser data is lost | Tracking recovery copy protects some corruption; Settings exports support recovery | No backup can recover a cleared browser without a prior private export |
| A provider-wide outage occurs | Static assets can survive D1 failure within Cloudflare | This is not a separate-host failover; no guaranteed uptime SLA |
| Telegram times out or returns malformed data | Sanitized delivery failure; individual alert failures are audited while later alerts continue; workflow reports failure | A timed-out request may already have delivered. No immediate send replay; a later retry can duplicate an alert |
| Token expires or account access changes | Operational checks fail visibly where observable | Owner must replace credentials; source code cannot rotate unknown account credentials |

Do not use an LLM's forecast to select future dependency versions or promise
availability. React/Vite, the collector and Cloudflare components can be
independently tested and updated. A large speculative framework migration is
less useful than known support windows, verified backup restoration and tested
failure behavior.

## Pipeline responsibilities

- `ci.yml`: required `python` and `web` checks, full audits, production build,
  offline fault tests, real local Worker/D1 integration, lint and UI types.
- GitHub-managed CodeQL: Actions, Python and JavaScript/TypeScript scanning on
  pushes/PRs and weekly; no duplicated repository CodeQL workflow.
- `scrape.yml`: freshness gate, eight isolated discovery shards, validated
  finalization and deduplicated Telegram delivery.
- `watchdog.yml` plus the Cloudflare scheduler: independent bounded recovery.
- `operational-health.yml`: read-only availability/freshness/source/backup checks
  with step summaries and seven-day JSON artifacts.
- `backup-d1.yml`: daily export, isolated restore check and 90-day artifacts.
- `deploy-cloudflare.yml`: tests, safe snapshot capture, migration validation,
  deploy, public API/assets verification and recovery Worker update.
- `cleanup-storage.yml`: disposable-cache/artifact retention; never SQL/private
  backups. `telegram-digest.yml` remains the existing alert delivery schedule.
- `sync-company-registry.yml` and `telegram-setup.yml`: explicit operational
  tools. They do not add companies autonomously.

New-company discovery, historical coverage-audit and monthly keepalive workflows
were retired. The registry is frozen for expansion; existing sources can be
repaired through PRs. Historical evidence and tests remain in Git history.

## Release evidence

Record exact source SHA and required checks before merging. Verify the deployed
revision and public browser behavior afterward. Never equate green CI with all
employer feeds passing, and never close a feed issue solely because a mock test
or initial HTTP sample passes. See `ops/RECOVERY.md` for rollback and data recovery.

Dependency PRs group minor/patch changes by ecosystem each month, with one open
version-update PR per ecosystem. Major versions require a planned compatibility
review; security alerts remain enabled. Node typings follow the Node 24 runtime.

## Browser tracking under storage pressure

A recovery-copy write can exhaust browser storage even when replacing the primary
tracking record would still fit. Attempt the primary save independently. On
success, warn if the recovery copy could not refresh and offer the existing
Settings private export. If the primary write also fails, retain the stored
records and show the unsaved-change warning. Never evict application history or
other private records automatically to make room. This is local browser storage,
not a server backup; clearing browser data still requires a prior private export.

The hourly operational report also checks the latest completed Telegram daily workflow and a successful result within 36 hours. A failed latest attempt remains visible even if a recent earlier attempt passed. This checks workflow/API evidence, not whether someone read the message. See `READINESS-REVIEW.md` for the scoped security review and current production evidence.

## Language and performance decision

Keep Python collectors and the TypeScript Worker. The 21 October run
`39589334236` completed in about 783 seconds; discovery shards ranged from
172 to 706 seconds. Booking.com occupied about 634 seconds of the slowest shard.
These are elapsed observations, not evidence of Python CPU saturation. A Go
rewrite has no demonstrated benefit for this workload and would need to preserve
all employer-specific completeness and job-policy contracts.

Normal scans now emit compact `source_timing` records with fetch, enrichment and
total elapsed seconds, including failed/limited sources. Timing starts after the
source concurrency slot is acquired. Fetch time includes network waits, provider
limiter waits, retries, parsing and snapshot verification; it is not a pure HTTP
latency measurement. Enrichment measures the synchronous matching/normalization
phase. No request URLs, descriptions, headers or credentials are added to metrics.

Each shard also emits `worker_timing` and retains it as optional artifact metadata:
discovery wall seconds and process CPU seconds, measured from worker entry through
artifact preparation. Setup/download/upload/finalization are outside that window.
CPU covers all worker threads; do not attribute it to one employer, add overlapping
source times to estimate a critical path, or treat it as a production profiler.

Use several normal scans to identify persistent slow sources. If CPU consumption
is substantial, profile the parsing/matching hotspots before selecting a targeted
optimization. If elapsed time is mostly waiting, investigate provider latency,
request volume and verified request patterns, then evaluate shard balance. Keep
existing rate limits, source ownership, snapshot checks and retry bounds until
measurements justify a reviewed change. No benchmark or new scan is dispatched
just to populate these metrics; they do not add D1 reads or writes.
