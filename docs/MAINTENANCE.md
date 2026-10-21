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
