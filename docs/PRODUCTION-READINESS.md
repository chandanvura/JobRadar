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
| P1 | Refresh fails when the Worker fails | Browser relied entirely on API failover. Read packaged static catalog directly after API/network failure. | VERIFIED: mocked HTTP 500, network failure and pagination interruption replace the whole catalog. |
| P2 | Older refresh can overwrite newer state | Concurrent loads had no cancellation/generation guard. Cancel prior loads and discard stale responses. | VERIFIED: aborted load regression test; component generation guard inspected. Full browser network-race injection remains UNVERIFIED. |
| P1 | Incomplete ingestion may finalize/deactivate jobs | Rejected batches were accumulated but finalization proceeded. Stop before finalization on rejection. | VERIFIED: regression ensures no final run request after rejection. |
| P1 | Large seen manifests silently truncate | Only first 5,000 keys were retained, risking deactivation of valid rows. Accept up to 50,000 explicitly and reject excess. | FIXED + VERIFIED: compiled Worker preserves a seen job after position 5,001 and rejects oversize input. |
| P2 | Replayed notification writes inflate counts | Successful retries always incremented scan statistics. Conditional upsert and increment only on an actual transition. | FIXED + VERIFIED: two sent-record requests produce one notification count. |
| P2 | Invalid record shapes cause exceptions | Null/object/array payloads were not consistently rejected. Validate before touching D1 and reject oversize arrays. | FIXED + VERIFIED: compiled API returns 400/413 for malformed and excess input. |
| P1 | Quota outages trigger expensive recovery loops | Missing healthy scan looked like a missed schedule. Recognize quota exhaustion and defer scans until reset. | FIXED + VERIFIED: production gate previously failed open on unreadable urllib health responses; shared bounded curl transport now recognizes the real quota response and skips discovery/finalization. Future resumption after reset remains UNVERIFIED. |
| P1 | Backup becomes stale over unattended months | It refreshed only on code deployments. Add daily deployment/capture schedule, preserve prior valid snapshot and reject changed scan metadata during capture. | VERIFIED: capture and preservation tests; future scheduled execution remains UNVERIFIED. |
| P2 | Inactivity may disable operational workflows | Recovery only restored scans. Restore allowlisted inactive operational schedules; honor deliberate disables. | VERIFIED: inactivity/manual-disable/allowlist tests; long-term provider behavior remains UNVERIFIED. |
| P2 | Backup scan status can look healthy | Old scan metadata was displayed as current. Show BACKUP MODE and avoid healthy status in backup mode. | VERIFIED: deployed UI displays BACKUP MODE and Automation needs attention during the real quota outage. |

## Verification inventory

- Python: 64 tests passed using a new virtual environment and locked top-level
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
installation and production deployment checks succeeded. The workspace later disconnected; the final collector correction was published through GitHub and verified on fresh GitHub runners.

## Final browser regression checks

An isolated workspace reproduced a P2 navigation bug: returning to `/` through a client-router Link retained the prior workspace state until reload. Changed that Link to force document navigation so all workspace-scoped state initializes together. FIXED + VERIFIED: production retest returned to the default workspace with zero test records without a manual refresh. Browser cases: create isolated workspace, save a job, set Applied, reload, verify persisted record; return to original workspace, verify default workspace and zero test records. Resume cases: reject empty master, accept synthetic name/project, reject missing JD, tailor synthetic JD without adding missing skills. Role views were navigated in dark mode. Actual PDF printing, mobile viewport and every employer destination remain UNVERIFIED.

## Final runner and deployment evidence

- VERIFIED: final collector code commit `ffa6888942226cc4361265eab3883ce10bfb2dc5`; validation run `36735921182` completed successfully. Python: **64 passed**; web: **49 passed**; compiled API integration, build, lint, UI type check, Bandit and application dependency checks passed.
- VERIFIED: production Worker deployment run `36732645242` completed successfully from commit `5da5db5440c2a515442ed856a08fcf6576a5298d`. Later changes affect the Python collectors/documentation; Worker source is unchanged.
- VERIFIED: that deployment fetched the homepage, dashboard and packaged static backup successfully. Its live health request returned HTTP **503**, `ok:false`, `quota_exhausted:true`, and reset **2026-10-01T00:00:00Z** (05:30 IST).
- FIXED + VERIFIED: earlier production gate `36732295384` failed open after a JSONDecodeError and started eight discovery shards. Corrected gate run `36735201415` printed "D1 daily quota exhausted; defer expensive scan until reset", returned `should_run:false`, and skipped validation, discovery and finalization. A successful gate-only run is not a successful collection run.
- VERIFIED: latest watchdog run `36735921087` honored an already queued/running scan. Its known-quota no-dispatch path is covered by a main-function regression test; a live quota-specific no-dispatch execution of that particular path was not independently observed.
- FIXED + VERIFIED: a full npm dependency audit initially reported eight moderate findings in the esbuild/fflate development dependency chains. Targeted overrides use nested esbuild 0.25.12 and fflate 0.8.3. Full `npm audit --audit-level=moderate` reports zero findings. A fresh install, build, 49 tests, compiled API tests and Drizzle migration generation passed after the overrides.
- The curl transport has a fixed public HTTPS destination, fixed arguments, certificate validation, no shell, no credentials, and bounded deadlines. Its generic Bandit import warning is narrowly annotated after review; command/timeout failures become sanitized RuntimeErrors. Regression tests cover valid/degraded responses, unexpected status/shape, unavailable curl, quota gating and transport errors.
- VERIFIED: browser company table contained 670 rows and 670 unique normalized names. City/no-result searches, empty/valid master resume and JD validation, synthetic tailoring, isolated job saving/stage changes and reload persistence were exercised. Application-origin console errors were absent in the inspected log sample.
- BLOCKED: direct local production HTTP requests were denied by the execution environment. GitHub deployment checks supplied the live HTTP evidence instead. Later workspace/browser disconnection prevented further local UI checks; all final collector tests ran from clean GitHub checkouts.

## Commands and checks executed

```text
python -m pytest -q
python -m bandit -q -r scraper scripts
python -m pip_audit -r requirements.txt
npm ci
npm test
npm run test:api
npm run lint
npm run typecheck:ui
npm audit --omit=dev --audit-level=high
npm audit --audit-level=moderate
npx drizzle-kit generate --dialect sqlite --schema ./db/schema.ts --out /tmp/jobradar-final-migration-tool-check
git diff --check
```

Also applied all three migrations to fresh local D1 state; inspected actual SQLite query plans; parsed workflow YAML; ran the previous compiled Worker against failure cases; fetched GitHub job results/logs; and exercised the deployed UI. The old compiled Worker reproduced HTTP 500 for malformed inputs/missing tables, acceptance of excess jobs, deactivation of a seen job beyond the truncated manifest, and notification count 2 after replay. The fixed compiled Worker returns 400/413/controlled 503, preserves the job and records one notification transition.

## Files changed and regression coverage

| Area | Files |
|---|---|
| CI and operations | `.github/workflows/ci.yml`, `.github/workflows/deploy-cloudflare.yml`, `.github/workflows/scrape.yml`, `web/ops-scheduler/index.ts` |
| Collection and gating | `scraper/main.py`, `scraper/watchdog.py`, new `scraper/health.py` |
| Worker and browser reliability | `web/worker/index.ts`, new `web/worker/api-failure.ts`, new `web/lib/public-catalog.ts`, `web/components/jobradar-dashboard.tsx`, `web/components/profile-panel.tsx` |
| Backup and dependency configuration | `web/scripts/capture-public-backup.mjs`, `web/package.json`, `web/package-lock.json` |
| Python regressions | `tests/test_database_migrations.py`, `tests/test_matching.py`, `tests/test_watchdog.py`, new `tests/test_health.py` |
| Web regressions | `web/tests/ops-scheduler.test.mjs`, `web/tests/public-backup.test.mjs`, new `web/tests/reliability.test.mjs`, new `web/tests/worker-api.integration.mjs` |
| Documentation | `README.md`, `docs/PRODUCTION-READINESS.md` |

New coverage addresses index use/ordered pagination, rejected ingestion, quota dispatch suppression, public-health failures, static failover, cursor validation, cancellation, complete seen manifests, malformed/oversize records, case-insensitive/concurrent ingestion, replayed notifications and injected database failures.

## Final limits and security/performance assessment

No unresolved P0/P1 code failure was observed in the exercised workflows after these corrections. This is not proof of every source or production condition. Database writes/fresh production imports remain **BLOCKED** by the current provider cap. Portal availability is preserved through the explicitly partial saved catalog (100 jobs, 670 companies), rather than through a second writable database.

Authentication rejection, payload bounds, controlled failures, duplicate prevention and notification replay were tested in compiled workerd/D1. URL/parameterization and secret-handling source review supports the security assessment, but is **LIKELY** evidence for paths not exercised with exploit payloads. There was no full penetration test or independent account-permission/credential-expiry audit.

Index seeking and bounded pagination were **VERIFIED** on migrated SQLite and compiled integration paths. Post-reset Cloudflare rows-read/written usage, CPU/memory headroom, storage growth and future traffic are **UNVERIFIED**; no invented reduction percentage or capacity guarantee is claimed.

Future scheduled capture/resumption, continuous 99.9% uptime, all 670 employer feeds, actual Telegram delivery, production SQL restore, PDF printing and mobile viewport behavior remain **UNVERIFIED**. The interactive local dev-server check was **BLOCKED** by the host OS interface error. These limitations are retained after the final re-audit.
