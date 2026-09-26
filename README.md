# JobRadar

JobRadar is a production-oriented job discovery system for explicit 0–3 YOE roles posted within the last 24 hours in Bengaluru, Hyderabad, Chennai and Pune. It checks a broad, continuously reviewed registry of official company career sources, preserves employer date precision, separates discovery candidates from eligible alerts, avoids duplicate Telegram delivery, and reports empty or failed sources honestly.

The production address is emitted and verified by the deployment workflow. A
neutral custom domain can be attached without changing the application.

## Included

- React/TypeScript dashboard, Cloudflare Worker API, and D1 schema
- Python adapters for Greenhouse (including employer JSON-LD posting dates), Lever, Ashby, paginated Workday/SmartRecruiters, and conservative JSON-LD career pages that follow only official ATS links
- Title, location, strictest-experience, skill, and freshness analysis
- Immutable first-seen tracking and employer-relative date labels without invented timestamps
- ATS/external-ID deduplication and notification history schema
- Telegram alerts with official application links
- Redundant GitHub Actions scheduling, bounded retries, overlap protection, and manual dispatch
- Automatic official-page ATS discovery, domain-aware concurrency, and cached immutable job details
- Live run history, stale-run detection, per-source raw/candidate/eligible counts, notification history, and policy views
- Browser-private Saved and application-stage tracking with JSON export
- Initial company registry and tests for critical matching rules

Architecture: `freshness-gated GitHub scheduler → 8 stateless discovery workers → immutable shard artifacts → ingestion coordinator → Worker API → D1 → dashboard`. Discovery workers, coordinator/notifications, edge application, and database are independent execution or persistence boundaries. Four best-effort scanner triggers and two independent watchdog checks each hour recover from delayed or skipped schedules. The watchdog dispatches a scan only when the latest completed scan is at least 75 minutes old and none is running. Every scan uses one source revision; failed discovery shards get one bounded retry. The API and frontend intentionally share one edge deployment because separating them would add free-tier requests and deployment complexity without removing the scan bottleneck. Eligible jobs scoring 65+ are Telegram candidates. Failed deliveries remain retry candidates. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the HLD, LLD, contracts, load controls, and failure model.

## Local dashboard

Requires Node.js 22+.

```bash
cd web
npm ci
npm run dev
```

The dashboard reads live D1 data from `GET /api/dashboard` and automatically refreshes every five minutes while visible.

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
5. Run **JobRadar hourly scan** once and verify the finalizer says `Telegram health check: bot authentication and chat validation passed.`

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

The identifier is the company/board segment from the official Greenhouse, Lever, or Ashby URL. Verify each source and test small batches before expanding.

## Tests

```bash
python -m pytest -q
cd web && npm test
```

## Independent Cloudflare deployment

The standalone application lives under `web/` and does not require ChatGPT Sites at runtime. The **Deploy independent JobRadar** workflow creates an Asia-Pacific D1 database when needed, applies versioned migrations, builds the vinext application, deploys the Worker, configures protected ingestion, and verifies the deployment.

Changes under `web/` deploy automatically from `main`; the workflow can also be run manually. The scheduler receives opportunities at minutes 17 and 47 UTC; a freshness gate normally allows one full scan per hour and uses the second opportunity to recover from delayed GitHub scheduling. Verify the **Deploy independent JobRadar** and **JobRadar hourly scan** workflows in GitHub Actions after changing infrastructure or matching logic.

## Matching guarantees

- Bengaluru, Hyderabad, Chennai or Pune and a supported role are required.
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
- A schedule starts late: the independent watchdog dispatches a recovery scan when GitHub runs it and production is at least 75 minutes stale. GitHub may delay both schedules; no schedule on GitHub Actions can guarantee hourly execution.
- An untouched public repository may have scheduled workflows disabled after 60 days of inactivity. Monthly maintenance records a real scan status and commits it to `ops/last-monthly-check.json` as a best-effort activity signal. Check Actions if GitHub disables scheduling or changes its inactivity policy.

## Cost protection

The system avoids paid APIs, proxies, browsers, and continuously running servers. Monitor Actions duration and Cloudflare requests/database usage while expanding through 50, 100, 250, then 500 companies.
