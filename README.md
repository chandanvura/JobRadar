# JobRadar

**Verified early-career jobs in Bengaluru and Hyderabad, with private application tracking.**

[Open JobRadar](https://jobradar.chandanvura.workers.dev) ·
[CI and operational pipelines](https://github.com/chandanvura/JobRadar/actions) ·
[Security policy](SECURITY.md) · [Recovery runbook](ops/RECOVERY.md) ·
[Contributing](CONTRIBUTING.md) · [MIT license](LICENSE)

JobRadar collects jobs from the existing employer registry, checks the original
job description, and separates verified matches from listings that need review.
Public browsing is restricted to **Bengaluru/Bangalore and Hyderabad**. No new
companies are added automatically. A lack of eligible jobs is a valid result;
unknown dates or experience are never invented to fill the page.

## Product rules

- Verified recommendations require employer posting evidence within 24 hours,
  explicit experience compatible with **0–3 years**, and a target city.
- Show the JD evidence behind experience decisions and distinguish mandatory,
  preferred, conditional and conflicting requirements.
- Keep unknown or conflicting requirements reviewable, without treating a junior
  title as proof of experience. Leadership exclusions remain enforced.
- All Jobs includes older/reviewable target-city listings; freshness and eligibility
  labels explain why a job does not enter the verified recommendation view.
- Other-city source records may remain internally for source reconciliation. They
  are excluded from public live browsing and normal job views. Historical private
  Saved/Applications entries remain accessible even if their job disappears.
- Personal preferences, resumes, notes, saved jobs and application history stay in
  this browser. Export a private backup from Settings before clearing storage.

## Architecture

| Component | Responsibility |
|---|---|
| React + TypeScript | Search, ranking, evidence, accessible navigation and browser-private tools |
| Vite | Build static frontend assets and the small API Worker separately |
| Cloudflare Worker + D1 | Public catalogue, indexed pagination, authenticated ingestion and deduplication |
| Python collectors | Employer adapters, date/experience/location validation and bounded source retries |
| GitHub Actions | CI, eight discovery shards, validated finalization, backup, deployment and diagnostics |
| Separate Cloudflare Cron Worker | Independent recovery checks and allowlisted inactivity recovery |

The interface uses static assets rather than server-rendered pages, React Server
Components or runtime image optimization. Next/vinext, the unused framework
plugins and the custom braces installation patch were removed. Source HTML is
extracted into plain text; it is never injected into the page as employer HTML.

The application uses the same existing D1 database and browser-storage keys.
There is no new cloud account, paid service or private-data migration.

## Reliability behavior

| Failure | Behavior |
|---|---|
| One feed fails or changes while paginating | Retry within bounds, isolate the source and keep failure visible; an incomplete snapshot must not retire valid jobs |
| A scan is missed | Freshness gate and independent recovery dispatch one scan when due, without overlapping active runs |
| Repeated scan failure | Both recovery schedulers apply a 30-minute cooldown after completed workflows |
| D1 fails or exhausts its daily quota | Public browsing can use the dated static catalogue; ingestion/notification writes fail honestly and quota-aware recovery pauses |
| Live snapshot capture fails | Preserve the previous valid snapshot; refuse an empty replacement when no valid source exists |
| SQL export is unusable | Reject it before upload unless an isolated SQLite restore passes schema, integrity, foreign-key and query checks |
| A refresh races or a tab becomes stale | Cancel obsolete loads, avoid mixed live/backup catalogues, retain private tracking and its recovery copy |
| A dependency becomes vulnerable | Dependency alerts and tested PRs; no unrestricted force upgrade or automatic production merge |

Telegram transport errors and malformed responses are handled as delivery
failures without exposing request URLs. Individual failures do not skip later
alerts. A timed-out send may already have arrived; a later retry can duplicate
an alert, so exactly-once delivery is not promised.

Maersk category pages with repeated valid IDs are discarded and allow one
whole-source restart. Missing/malformed IDs fail immediately; persistent
duplicates remain visible failures. No incomplete attempt is accepted.

Static fallback protects browsing during a D1 outage, not a Cloudflare-wide
outage. It can be stale. SQL snapshots do not back up private browser history.
No one-year zero-maintenance or continuous-uptime guarantee is claimed.

## Local development

Use **Node 24 LTS**, Python 3.12 and npm. Application packages are pinned and
`package-lock.json` is committed. Start from a clean installation:

```sh
python -m pip install -r requirements-dev.txt
cd web
npm ci --no-audit --no-fund
npm run build
npm run db:migrate:local
npm run dev
```

`npm run dev` uses Wrangler's **local** runtime on `127.0.0.1:8787`; it does not
connect to the production database. For optional UI hot reload, leave it running
and use `npm run dev:ui` in another terminal. Vite proxies API requests to that
local Worker. Rerun the build when verifying the packaged application.

Authenticated local ingestion requires a local-only `JOBRADAR_INGEST_SECRET` in
`web/.dev.vars` (ignored by Git). Never copy a production token into a source
file. An empty local database is expected until local fixtures are loaded.

Build and frontend commands are Node-based and do not require the former WSL
shell-wrapper setup. The all-in-one harness below still requires Bash and GNU
`timeout`; individual npm/Python checks can be run directly on Windows.

## Validation

```sh
bash scripts/verify-harness.sh all
```

The harness fails on Python regression/security/dependency checks, **full npm and
production npm high-severity audits**, the production build, web regressions,
compiled Worker/local D1 integration, lint, or UI types. Full audits include
developer tools; their exposure is not dismissed simply because they are absent
from the deployed Worker.

Local release validation on 2026-10-21 passed **945 Python tests**, **217 web
tests**, compiled Worker/D1 integration, build, lint and UI types. Both full and
production npm audits reported **zero vulnerabilities**; Bandit and pip-audit passed.
CI and deployment are separately verified for the published commit.

Coverage includes hostile/malformed/chunked requests, byte limits without
Content-Length, source snapshot changes, rejected finalization, notification
replay, quota deferral, static fallback, bounded pagination, private-history
recovery and a 7,000-job dashboard interaction harness. Database telemetry reports
measured reads/writes, not assumed percentage savings across SQLite versions.

GitHub-managed CodeQL scans Actions, Python and JavaScript/TypeScript on changes
and weekly. Dependency graph, Dependabot alerts/security-update proposals,
malware alerts, private vulnerability reporting and secret/push protection are
enabled. A passing scan is evidence, not a proof that all vulnerabilities are absent.

## Pipelines and operations

Open the repository's **Actions** tab for named jobs, step summaries and artifacts.

| Pipeline | Purpose / cadence |
|---|---|
| JobRadar validation | Required `python` and `web` checks for each PR and `main` push |
| JobRadar free-tier scan | Check every 30 minutes; a gate permits a full scan after 150 minutes from the prior scan start |
| JobRadar scan watchdog | Secondary hourly recovery; Cloudflare checks independently every five minutes |
| JobRadar operational health | Hourly read-only website, source, freshness and backup evidence; retain JSON for seven days |
| Backup JobRadar database | Daily SQL snapshot, disposable restore verification and 90-day artifact retention |
| Deploy independent JobRadar | Validated code release plus daily public snapshot refresh |
| Clean disposable JobRadar storage | Retire disposable caches/scan artifacts, preserving SQL backups |
| JobRadar Telegram daily update | Existing daily summary; eligible notifications are deduplicated during finalization |

Redundant monthly keepalive, new-company discovery, old coverage-audit and
one-off Node audit workflows were removed. Full dependency auditing is part of
required CI. Registry repair and Telegram setup remain explicit operational tools. Monthly
minor/patch dependency updates are grouped by ecosystem; major upgrades need
a separate compatibility review. Node typings stay on the Node 24 release line.

The **Protect main** ruleset is active: PRs, passing `python`/`web`, up-to-date
branches and resolved conversations are required; force push and deletion are
blocked. Zero approvals supports solo maintenance. No bypass actors are configured.

Production uses GitHub/Cloudflare secret stores for `CLOUDFLARE_API_TOKEN`, account
configuration, `JOBRADAR_INGEST_SECRET`, and Telegram delivery configuration. The
independent dispatcher also needs a valid scoped `JOBRADAR_DISPATCH_TOKEN` with
repository Actions access. Secret values never belong in issues, URLs or commits.

Operational health fails if the completed scan is missing/at least five hours
old, sources fail, database/ingestion is unavailable, quota is exhausted, or the
latest successful backup is at least 36 hours old/missing/expired/empty. Enable
GitHub Actions failure notifications in your account. Code cannot verify that
email/Telegram incident notifications were received merely by enabling a workflow.

## Release, recovery and limits

Use the protected PR path and verify the deployed site after release. Never infer
production success from CI alone. Database schema changes need a fresh backup
and staging verification. Restoring SQL or rolling back code does not recover a
cleared private browser workspace; use Settings exports for that data.

- [Recovery and rollback](ops/RECOVERY.md): exact checks, backup validation and staging-first recovery.
- [Maintenance scenarios](docs/MAINTENANCE.md): support horizon, failure models and pipeline ownership.
- [Architecture](docs/ARCHITECTURE.md): collection, ingestion and data boundaries.
- [Historical readiness evidence](docs/PRODUCTION-READINESS.md): dated audits; historical observations are not current health claims.

Employer feeds can change, credentials can expire, and free-tier limits apply.
The production source check on 2026-10-21 returned **1,183 Adidas records** with
no source error after the adapter's XML/live-pagination reconciliation; no jobs
with a published target-city location were returned. This dated observation is
not an uptime guarantee. Never replace a failed feed with an invented empty
success or close a source issue on an HTTP sample alone. No new company
expansion or recruiter-data import is part of this maintenance scope.

Application tracking keeps primary saves independent of recovery-copy failures: if the primary save fits, it is retained and a recovery warning directs you to the private export in Settings. A failed primary save stays visible; no application history is deleted to free space.

For the nine-month operating target, see [the readiness review](docs/READINESS-REVIEW.md): security boundaries, exact production evidence and open acceptance criteria. Hourly operational reports include daily Telegram workflow failure/freshness checks without adding database reads or sending test messages.

Private backup import/export now share a bounded six-field format, including resume drafts and tailoring requests. Imports validate before writes, merge application history and report partial storage failures without reloading; exports fail visibly when private records cannot be read. See the [inspection findings](docs/READINESS-REVIEW.md#follow-up-repository-inspection) for tested repairs and review limits.
Telegram setup also sanitizes network and malformed-response failures so request URLs and token-bearing exception text do not reach setup logs.

Scan validation installs the development requirements needed by pytest; discovery and finalization keep runtime-only dependencies. CI checks test-running workflow manifests to prevent this dependency split from stopping scheduled scans again.

Performance decision: retain Python collectors and the TypeScript Worker. Normal scans emit source fetch/enrichment timings and shard CPU/wall timings so future optimizations follow measured bottlenecks. See [performance measurement and interpretation](docs/MAINTENANCE.md#language-and-performance-decision); these metrics preserve existing request limits and job policies.

### Maintenance-only release

Feature development is closed as of 21 October 2026. Keep the current Python/TypeScript stack and existing companies; limit changes to verified security, data-integrity and existing-functionality repairs. Eaton/Maersk recovery is verified and [#80](https://github.com/chandanvura/JobRadar/issues/80) is closed. The latest completed scan has 740/743 successful sources; AXA, Lenovo and Citigroup remain visible in [#87](https://github.com/chandanvura/JobRadar/issues/87). Existing scans, read-only checks, backups and alerts continue. See [closure evidence and operating limits](docs/READINESS-REVIEW.md#feature-development-closure--21-october-2026).

The Lenovo last-page singular-label repair is verified locally against 61 listings and 23 relevant details. Production recovery remains pending; [the reproduced failure and validation](docs/READINESS-REVIEW.md#issue-87-reproduced-lenovo-last-page-failure) distinguish adapter evidence from completed production scans.

## Open-source participation

Original JobRadar code is MIT-licensed; bundled third-party notices remain in place.
Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing a maintenance repair.
[The v0.1.0 baseline notes](docs/releases/v0.1.0.md) describe included safeguards,
validation and known exceptions. Release notes are separate from production
health evidence. External adoption has not been verified; no user, download or
downstream-usage metrics are claimed.

Public clones contain committed source and Git history. Deployment secret-store
values and browser-private history are not part of the repository. See the
[public-clone boundary](SECURITY.md#public-clone-boundary) for the dated scan scope,
ignored local files and credential exposure response.
