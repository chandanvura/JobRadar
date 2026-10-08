# JobRadar

JobRadar is a production-oriented job discovery system for explicit 0–3 YOE roles posted within the last 24 hours in Bengaluru and Hyderabad. It checks a broad, continuously reviewed registry of official company career sources, preserves employer date precision, separates discovery candidates from eligible alerts, avoids duplicate Telegram delivery, and reports empty or failed sources honestly.

The production address is emitted and verified by the deployment workflow. A
neutral custom domain can be attached without changing the application.

## Included

- React/TypeScript dashboard, Cloudflare Worker API, and D1 schema
- Python adapters for Greenhouse (including employer JSON-LD posting dates), Lever, Jobvite XML, Ashby, paginated Workday/SmartRecruiters, and conservative JSON-LD career pages that follow only official ATS links
- User-initiated Google searches across official Workday, Greenhouse, Lever, iCIMS, Jobvite, Ashby, and SmartRecruiters portals with a broader baked-in title set
- Last-24-hour fallback discovery for limited sources through user-initiated LinkedIn, Indeed, Glassdoor, and Naukri searches without scraping those services or consuming D1 writes
- Title, location, strictest-experience, skill, and freshness analysis
- Immutable first-seen tracking and employer-relative date labels without invented timestamps
- Employer/ATS/external-ID deduplication, database uniqueness constraints, idempotent scan history, and notification history
- Telegram alerts with official application links
- Redundant GitHub Actions scheduling, bounded retries, overlap protection, and manual dispatch
- Automatic official-page ATS discovery, domain-aware concurrency, and cached immutable job details
- Live run history, stale-run detection, per-source raw/candidate/eligible counts, notification history, and policy views
- Browser-private Saved and application-stage tracking with JSON export
- 700-company registry covering major enterprises, MNCs, startups and scaleups; [coverage notes](docs/COMPANY-COVERAGE.md)

Architecture: `freshness-gated GitHub scheduler → 8 stateless discovery workers → immutable shard artifacts → ingestion coordinator → Worker API → D1 → dashboard`. Discovery workers, coordinator/notifications, edge application, and database are independent execution or persistence boundaries. Six best-effort scans per day are backed by hourly GitHub and 15-minute Cloudflare recovery checks. A watchdog dispatches only when the latest completed scan is at least four hours old and none is running. Every scan uses one source revision; failed discovery shards get one bounded retry. The API and frontend intentionally share one edge deployment because separating them would add free-tier requests and deployment complexity without removing the scan bottleneck. Eligible jobs scoring 65+ are Telegram candidates. Failed deliveries remain retry candidates. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the HLD, LLD, contracts, load controls, and failure model.

## Local dashboard

Requires Node.js 22.13+ and GNU `timeout` (Linux/WSL).

```bash
cd web
npm ci
npm run build
# Initialize an empty local database; these commands never contact production.
for migration in drizzle/*.sql; do
  npx wrangler d1 execute jobradar-db --local --config dist/server/wrangler.json --file "$migration"
done
npm run dev
```

The dashboard reads `GET /api/dashboard` and automatically refreshes every five minutes while visible. A fresh local database starts empty. `npm run test:api` creates an isolated in-memory test database, applies all migrations and verifies the compiled Worker without production credentials.

## Local scraper

Requires Python 3.12+.

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m scraper.main
```

Without `JOBRADAR_API_URL`, this performs a safe discovery run without storage or notifications.

## Telegram setup

1. Create a bot with `@BotFather` and save its token as the GitHub Actions repository secret `TELEGRAM_BOT_TOKEN`.
2. Send `/start` to your bot from the Telegram account that should receive alerts.
3. In GitHub Actions, run **Telegram destination setup**. The bot will privately message you your numeric chat ID; it does not appear in Actions logs.
4. Save that number as the GitHub Actions repository secret `TELEGRAM_CHAT_ID` (never the bot's ID or username).
5. Run **JobRadar free-tier scan** once and verify the finalizer says `Telegram health check: bot authentication and chat validation passed.`

The configured chat ID must be saved permanently. Telegram retains incoming `/start` updates for at most 24 hours, so automatic recovery from an incorrect ID cannot keep alerts working indefinitely.

Never commit these values.

## Required GitHub secrets

| Secret | Purpose |
|---|---|
| `JOBRADAR_INGEST_SECRET` | Long random value shared with the Worker |
| `TELEGRAM_BOT_TOKEN` | Telegram bot credential |
| `TELEGRAM_CHAT_ID` | Destination chat |
| `CLOUDFLARE_API_TOKEN` | Scoped Workers Scripts and D1 deployment credential |
| `CLOUDFLARE_ACCOUNT_ID` | Optional; the deployment resolves it when the token can access exactly one account |

The deployment workflow installs the ingest secret on the Worker. Generate one with `openssl rand -hex 32`.

## Adding companies

Edit `companies/companies.csv`:

```csv
company_name,careers_url,ats_provider,ats_identifier,priority,enabled
Example,https://example.com/careers,greenhouse,example,5,true
```

The identifier is the company/board segment from the official ATS URL. Company names and ATS provider/identifier pairs must both be unique. Verify each source and test small batches before expanding.

## Tests

```bash
python -m pytest -q
cd web && npm test
npm audit --omit=dev
```

## Independent Cloudflare deployment

The standalone application lives under `web/` and does not require ChatGPT Sites at runtime. The **Deploy independent JobRadar** workflow creates an Asia-Pacific D1 database when needed, applies versioned migrations, builds the vinext application, deploys the Worker, configures protected ingestion, and verifies the deployment.

Changes under `web/` deploy automatically from `main`; the workflow can also be run manually. The scheduler runs every four hours, reducing repeated D1 writes while still refreshing each 24-hour job window six times per day. Verify the **Deploy independent JobRadar** and **JobRadar free-tier scan** workflows in GitHub Actions after changing infrastructure or matching logic.

## Matching guarantees

- Bengaluru or Hyderabad and a supported role are required.
- Only verifiable 0–3 YOE requirements are accepted; skills are optional. Unknown experience remains visible in All Jobs but is not alerted.
- Senior engineer titles may qualify when the requirement is explicitly within policy. Leadership titles such as manager, director, architect, principal, and staff are rejected. Unknown experience and ranges exceeding 3 YOE are rejected; 1+ and 2+ are accepted.
- An employer-supplied timestamp within 24 hours or an explicit employer “posted today” label is mandatory for alerts.
- Skills improve ranking but are not mandatory.
- `posted_at` is employer-supplied only; relative labels remain labels; `first_seen_at` is never overwritten.
- Applicant counts and hiring signals are never guessed.

## Expansion

Add ATS adapters only after source-level job counts and fixtures prove they work. Workday uses full pagination and tenant-specific configuration. Browser-rendered and custom pages remain last-resort adapters. LinkedIn, Naukri, and Instahyre may be used only through permitted APIs or user-authorized exports; never bypass authentication, CAPTCHAs, access controls, or anti-bot protections.

Each distributed worker refreshes its deterministic share of listing feeds, then fetches details only for target-city engineering roles. Official pages that link Greenhouse, Lever, Ashby, SmartRecruiters, or Workday are automatically indexed into the structured adapter. Per-worker provider limits and separate Workday listing/detail buckets bound each process, while immutable daily detail caches reduce repeated work. Slow custom pages receive one bounded retry per scan; structured feeds retain transient retries. The coordinator refuses incomplete or duplicate shard ownership and finalizes a run only after every ingestion batch succeeds.

## Troubleshooting

- `401 Unauthorized`: Worker and GitHub ingest secrets differ.
- No Telegram alert: message the bot first and verify the chat ID.
- One company fails: verify the ATS identifier; other companies continue.
- No matching jobs: inspect location, title, seniority, and experience rules.
- A schedule starts late: the independent watchdog dispatches a recovery scan when GitHub runs it and production is at least four hours old. GitHub may delay both schedules; no GitHub Actions schedule is guaranteed to run at an exact minute.
- An untouched public repository may have scheduled workflows disabled after 60 days of inactivity. Monthly maintenance records a real scan status and commits it to `ops/last-monthly-check.json` as a best-effort activity signal. Check Actions if GitHub disables scheduling or changes its inactivity policy.

### Independent Cloudflare recovery schedule

The deployment also creates a small Cloudflare Cron Worker (`jobradar-ops-scheduler`) on the existing free account. It checks every 15 minutes, avoids duplicate running scans, and dispatches a GitHub scan only if the last completed scan is at least four hours old. If GitHub disables the scan workflow for inactivity, it re-enables it; an intentionally disabled workflow remains disabled. If the production health endpoint blocks the check, it uses completed GitHub finalizer jobs. Its scheduler is independent of GitHub's scheduled-event delivery.

To activate it, create a fine-grained GitHub personal access token restricted to **this repository** with **Actions: Read and write** permission. Save it as the repository Actions secret `JOBRADAR_DISPATCH_TOKEN`, then rerun **Deploy independent JobRadar** once. The deployment copies it into the Cloudflare Worker's secret store. Set the token expiration beyond the intended unattended period and rotate it before expiry. Do not put the token in a URL, commit, issue, or chat. Without this credential, the Cloudflare Worker is deployed but dormant; the existing GitHub scheduler and watchdog continue working.

The reliability path uses deterministic checks and retries. Free hosted AI services have rate limits and can produce incorrect fixes, so they are not allowed to edit code, change job eligibility, or deploy automatically. This keeps confirmed matching and alerts predictable without a ChatGPT dependency.

## Cost protection

The system avoids paid APIs, proxies, browsers, and continuously running servers. D1 ingestion uses conditional upserts: unchanged job records cause zero row writes; company check timestamps refresh on each scan, while a compact final manifest deactivates only jobs actually missing from a successful scan. Code pushes deploy safely but never start a full discovery scan automatically. Monitor Actions duration and Cloudflare requests/database usage while expanding the company registry.

### Free D1 outage fallback

Production deployments capture the complete public job catalog into a static Worker asset before deploying. If a public dashboard or catalog query fails (including a D1 daily quota error), the portal automatically serves that snapshot without another database. Personal saved jobs, notes, resume and application tracking remain in the browser. The portal clearly labels backup mode and its capture time; listings, source health and notifications may be stale. A subsequent refresh retries D1 and returns to live data when it recovers.

The snapshot refreshes on deployment, not on every scan. It is a browsing continuity backup, not a SQL restore point or a queue for new ingestion. Ingestion and Telegram recording are never reported successful when their database writes fail. The separate scheduled D1 SQL backup remains the recovery mechanism. This fallback does not bypass Workers request/CPU limits or a Cloudflare-wide outage.

Deployments preserve the prior public snapshot if live capture fails, and fail rather than publish an empty backup if neither source is valid. `/api/dashboard?source=backup` explicitly serves the packaged snapshot for read-only verification. `/backup/catalog.json` contains only the already-public catalog API data; never add private profile or credential data to it.


## Unattended operation and availability target

The deployment workflow now refreshes the public fallback every day at 01:17 UTC
(06:47 IST), after the first scheduled scan. GitHub schedules are best effort; a
failed capture preserves the previous valid snapshot. The first emergency
snapshot is explicitly marked partial. A full snapshot requires D1 to be
available. No payment plan or paid dependency was added.

The Cloudflare recovery Worker samples the portal HTML and independent backup
API every 15 minutes and emits structured `availability` logs. With a valid
`JOBRADAR_DISPATCH_TOKEN`, it restores known operational workflows disabled
for inactivity, while leaving manually disabled workflows alone. Quota-aware
health returns HTTP 503 with a reset time and `Retry-After`; schedulers stop
dispatching expensive scans while the daily quota is exhausted.

The **99.9% target is not a measured or guaranteed SLA**. Over 30 days its error
budget is 43 minutes 12 seconds. Portal availability and fresh-job coverage
are separate: the saved catalog can remain usable while ingestion is blocked.
Free Workers/D1 quotas, employer-feed changes, provider outages and credential
expiry still apply. Fifteen-minute probes can miss short outages; their logs
are evidence of samples, not a full-month uptime percentage. Recovery token
expiry must extend beyond the intended unattended period.

See [the production-readiness audit](docs/PRODUCTION-READINESS.md) and
[recovery instructions](ops/RECOVERY.md) for evidence and remaining limitations.

Collector health checks require `curl` on PATH. GitHub's Ubuntu runners include it; local collector/watchdog runs must install it too. Health uses the same bounded curl transport as deployment verification and accepts explicit HTTP 503 quota responses.


### Repeatable reliability harness

On Linux/WSL with Python 3.12, Node 22 and GNU timeout, install dependencies
from the lock files and run the same entry point used by GitHub validation:

```bash
python -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
npm --prefix web ci --no-audit --no-fund
JOBRADAR_HARNESS_PYTHON="$PWD/.venv/bin/python" bash scripts/verify-harness.sh all
```

Use `python` or `web` instead of `all` to select one suite. Each check has a
10-minute deadline, fails immediately on errors, and prints named START/PASS/FAIL
results. CI runs the two suites in parallel on fresh runners. The harness does
not deploy, dispatch collectors or write production D1. Worker integration uses
fresh local Miniflare databases; collector faults use fixtures.

Coverage includes malformed/duplicate inputs, concurrent imports, notification
replay, migrations, pagination, quota and static fallback, network failures,
retry bounds, freshness boundaries and deferred finalization. Passing these
checks is release evidence, not a promise of future uptime or employer coverage.
The production-only npm audit is a required gate. The October 4 `braces` development-tool advisory is locally mitigated by a
hash-checked postinstall depth patch and exploit regression tests. Upstream has
no patched release, so full npm audit still reports the affected version; no
advisory is suppressed. Do not use `npm ci --ignore-scripts`: the security tests
will reject an unpatched installation. The patch rejects nesting at 128 levels,
retains ordinary glob behavior, and fails installation on unexpected upstream
source/version changes. Original MIT licensing is retained under web/security.
Remove the patch only after verifying a safe upstream release.

## Lean personal feed

The feed now separates **match** (title, exact skill aliases, target experience
and location) from **opportunity priority** (match, smooth age decay and source
quality). Ranking is calculated once per catalog/profile/tracking change;
feedback is bounded and close scores interleave companies and role families.
Duplicate cards group conservatively without merging database or private
application records. Career tools collapse and resume/settings load on demand.
See [the lean-engine audit and algorithm notes](docs/LEAN-ENGINE.md) for weights,
changed modules, security decisions, fixtures and verification limits.

## Internships, fresher roles and custom domains

**Internships** is a primary section for technical internships/apprenticeships;
full-time experience preferences do not suppress it. **Fresher Roles** separately
shows full-time jobs accepting zero experience or explicit graduate/trainee roles
without a stated minimum. Jobs requiring 1–3 years stay in the broader job feed.
Internships show the completed scan time and current-date listing count; refreshing
the page reloads stored data and does not initiate a four-hour employer scan.

A custom hostname can be enabled later using the optional GitHub Actions variable
`JOBRADAR_CUSTOM_DOMAIN`. No hostname is attached until you supply one and configure
its zone. See [custom-domain setup and private-data migration](docs/CUSTOM-DOMAIN.md).
