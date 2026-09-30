# Production-readiness re-audit — 2026-09-30

## Scope and architecture

The repository inventory covers React/TypeScript components and browser-private
workspaces; the vinext/Vite build; Cloudflare Worker public and authenticated
write APIs; D1 migrations and indexes; Python normalization/ATS adapters; eight
stateless discovery shards; ingestion/Telegram finalization; GitHub CI, scans,
watchdog, backup and maintenance workflows; and the independent Cloudflare Cron
Worker. There are no Docker/Kubernetes manifests or always-on servers here.
Public job browsing has no login. Write endpoints require a server-side bearer
secret; resume, preferences, bookmarks and application tracking stay in local
browser storage. Private browser exports are the recovery mechanism for those
records; the public catalog snapshot does not back them up.

## Findings and root causes

| Priority | Finding | Root cause and correction | Evidence |
|---|---|---|---|
| P1 | Ingestion burns the read allowance | Case-sensitive lookup could not seek the existing NOCASE identity index. Add matching collation to all identity reads. | FIXED + VERIFIED: SQLite query plan changes from full index SCAN to keyed SEARCH; compiled Worker handles case variants without duplicate rows. |
| P1 | Repeated pagination reads/sorts too many rows | One cross-city query sorted the remaining catalog. Merge bounded city-index pages instead. | FIXED + VERIFIED: real migrated SQLite query plan and matching ordered results across both cities. |
| P1 | Database errors escape API handling | Returning an un-awaited Promise bypassed the route catch. Await asynchronous handlers, return sanitized failures and quota-aware health. | FIXED + VERIFIED: compiled Worker returns controlled errors with a missing/dropped table; quota helper supplies HTTP 503/reset/deadline without exposing query contents. |
| P1 | Refresh fails when the Worker fails | Browser relied entirely on API failover. Read packaged static catalog directly after API/network failure. | FIXED + VERIFIED: mocked HTTP 500, network failure and pagination interruption replace the whole catalog. |
| P2 | Older refresh can overwrite newer state | Concurrent loads had no cancellation/generation guard. Cancel prior loads and discard stale responses. | VERIFIED: aborted load regression test; component generation guard inspected. Full browser network-race injection remains UNVERIFIED. |
| P1 | Incomplete ingestion may finalize/deactivate jobs | Rejected batches were accumulated but finalization proceeded. Stop before finalization on rejection. | FIXED + VERIFIED: regression ensures no final run request after rejection. |
| P1 | Large seen manifests silently truncate | Only first 5,000 keys were retained, risking deactivation of valid rows. Accept up to 50,000 explicitly and reject excess. | FIXED + VERIFIED: compiled Worker preserves a seen job after position 5,001 and rejects oversize input. |
| P2 | Replayed notification writes inflate counts | Successful retries always incremented scan statistics. Conditional upsert and increment only on an actual transition. | FIXED + VERIFIED: two sent-record requests produce one notification count. |
| P2 | Invalid record shapes cause exceptions | Null/object/array payloads were not consistently rejected. Validate before touching D1 and reject oversize arrays. | FIXED + VERIFIED: compiled API returns 400/413 for malformed and excess input. |
| P1 | Quota outages trigger expensive recovery loops | Missing healthy scan looked like a missed schedule. Recognize quota exhaustion and defer scans until reset. | VERIFIED: scheduler, watchdog and quota health tests; scheduled production resumption after reset remains UNVERIFIED. |
| P1 | Backup becomes stale over unattended months | It refreshed only on code deployments. Add daily deployment/capture schedule, preserve prior valid snapshot and reject changed scan metadata during capture. | VERIFIED: capture and preservation tests; future scheduled execution remains UNVERIFIED. |
| P2 | Inactivity may disable operational workflows | Recovery only restored scans. Restore allowlisted inactive operational schedules; honor deliberate disables. | VERIFIED: inactivity/manual-disable/allowlist tests; long-term provider behavior remains UNVERIFIED. |
| P2 | Backup scan status can look healthy | Old scan metadata was displayed as current. Show BACKUP MODE and avoid healthy status in backup mode. | Source inspected; production UI verification pending deployment. |

## Verification inventory

- Python: 55 tests passed using a new virtual environment and locked top-level
  requirements. Final Bandit and pip-audit passed. The initial audit found old pip in the local test environment; upgrading that test tool removed its findings. CI audits application requirements separately.
- Web: 49 unit/regression tests passed. Production build, UI type check and lint
  passed from a detached clean checkout with freshly installed dependencies.
- Compiled Worker integration: real workerd/D1 runtime, fresh migrations,
  unauthorized writes, malformed/empty inputs, duplicate/case-variant and
  concurrent ingestion, live API reads, pagination, replayed notifications,
  static fallback, healthy recovery and injected missing database tables.
- Production browser: Dashboard, Recommended, Latest Jobs, All Jobs, Needs
  Review, Internships, Companies, Saved, Applications, Job Boards, Outreach,
  Resume Studio, Scraper Health, Notifications and Settings were navigated
  during the real D1 outage. This verifies the displayed data/empty states;
  it does not prove every employer destination or every control.
- Existing browser-private storage, owner isolation, import validation, matching,
  date boundaries, resume tailoring and LaTeX escaping have regression coverage.
- Tracked-file secret-pattern scan found no matching private key/token patterns.
  This cannot prove the absence of every possible secret. No secret values were
  printed or added to source.

## Availability and remaining limits

99.9% over 30 days allows 43 minutes 12 seconds of downtime. This is a target,
not a verified future SLA. The Cron Worker now samples HTML and backup API
availability every 15 minutes; samples and provider logs do not establish a
continuous 30-day measurement.

Public browsing availability is separate from freshness. The current emergency
snapshot has limited job coverage until D1 recovers and a full capture succeeds.
D1 exhaustion blocks fresh imports, scan history and notification persistence.
The static fallback preserves browsing/local personal tools; it is not another
SQL database or a durable write queue. Worker-wide quotas and Cloudflare-wide
outages are outside that failover. Employer feed changes can reduce coverage.

GitHub/Cloudflare schedules are best effort. The external recovery token must
remain valid and retain Actions permission for recovery after inactivity. Its
future expiry is UNVERIFIED. Personal browser storage can be lost if browser
data is cleared; private exports remain necessary. Actual Telegram delivery,
all employer feeds, production SQL restore and the next daily quota reset were
not exercised in this re-audit. Fresh production ingestion is BLOCKED by today's
D1 cap; local integration verifies the code path but is not production evidence.

## Clean environment and final deployment

The standard local setup now documents initial database creation. Direct
Wrangler dev-server startup in this execution environment hit an OS network
interface enumeration error. The direct Miniflare/workerd integration route
ran successfully; production browser verification is separate. Clean npm
installation and final deployment evidence will be appended after completion.

## Final browser regression checks

An isolated workspace reproduced a P2 navigation bug: returning to `/` through a client-router Link retained the prior workspace state until reload. Changed that Link to force document navigation so all workspace-scoped state initializes together. Production retest remains pending deployment. Browser cases: create isolated workspace, save a job, set Applied, reload, verify persisted record; return to original workspace, verify default workspace and zero test records. Resume cases: reject empty master, accept synthetic name/project, reject missing JD, tailor synthetic JD without adding missing skills. Role views were navigated in dark mode. Actual PDF printing, mobile viewport and every employer destination remain UNVERIFIED.
