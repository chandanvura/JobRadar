# JobRadar

JobRadar is a production-oriented job discovery system for explicit 0–3 YOE roles posted within the last 24 hours in Bengaluru and Hyderabad. It checks 150 official company career sources, preserves employer date precision, separates discovery candidates from eligible alerts, avoids duplicate Telegram delivery, and reports empty or failed sources honestly.

## Included

- React/TypeScript dashboard, Cloudflare Worker API, and D1 schema
- Python adapters for Greenhouse, Lever, Ashby, Workday, SmartRecruiters, and conservative JSON-LD career pages
- Title, location, strictest-experience, skill, and freshness analysis
- Immutable first-seen tracking and employer-relative date labels without invented timestamps
- ATS/external-ID deduplication and notification history schema
- Telegram alerts with official application links
- Redundant GitHub Actions scheduling, bounded retries, overlap protection, and manual dispatch
- Live run history, stale-run detection, per-source raw/candidate/eligible counts, notification history, and policy views
- Browser-private Saved and application-stage tracking with JSON export
- Initial company registry and tests for critical matching rules

Architecture: `GitHub Actions → Python adapters → normalization/ranking → Worker API → D1 → dashboard`. Eligible jobs scoring 65+ are Telegram candidates. Failed deliveries remain retry candidates. GitHub schedules are best-effort; the dashboard distinguishes a completed request from a productive source and marks stale scans after 90 minutes.

## Local dashboard

Requires Node.js 22+.

```bash
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

1. Message `@BotFather` in Telegram and run `/newbot`.
2. Copy the bot token and send any message to your new bot.
3. Open `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates` and copy the numeric chat ID.
4. Save both as GitHub repository secrets: `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID`.

Never commit these values.

## Required secrets

| Secret | Purpose |
|---|---|
| `JOBRADAR_API_URL` | Deployed JobRadar base URL |
| `JOBRADAR_INGEST_SECRET` | Long random value shared with the Worker |
| `TELEGRAM_BOT_TOKEN` | Telegram bot credential |
| `TELEGRAM_CHAT_ID` | Destination chat |

Set the same ingest secret on the deployed Site. Generate one with `openssl rand -hex 32`.

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
npm test
```

## Deployment

1. Deploy the Site so D1 and migrations are provisioned.
2. Add `JOBRADAR_INGEST_SECRET` to the Site environment.
3. Add the four GitHub secrets above.
4. Manually run **JobRadar hourly scan** once.
5. Confirm `/api/health`, the run log, and Telegram delivery.
6. Leave the hourly schedule enabled.

## Matching guarantees

- Bengaluru/Hyderabad and a supported role are required.
- Only verifiable 0–3 YOE requirements are accepted; skills are optional. Unknown experience remains visible in All Jobs but is not alerted.
- Experience overrides title seniority. Unknown experience and ranges exceeding 3 YOE are rejected; 1+ and 2+ are accepted.
- An employer-supplied timestamp within 24 hours or an explicit employer “posted today” label is mandatory for alerts.
- Skills improve ranking but are not mandatory.
- `posted_at` is employer-supplied only; relative labels remain labels; `first_seen_at` is never overwritten.
- Applicant counts and hiring signals are never guessed.

## Expansion

Add ATS adapters only after source-level job counts and fixtures prove they work. Workday uses full pagination and tenant-specific configuration. Browser-rendered and custom pages remain last-resort adapters. LinkedIn, Naukri, and Instahyre may be used only through permitted APIs or user-authorized exports; never bypass authentication, CAPTCHAs, access controls, or anti-bot protections.

## Troubleshooting

- `401 Unauthorized`: Worker and GitHub ingest secrets differ.
- No Telegram alert: message the bot first and verify the chat ID.
- One company fails: verify the ATS identifier; other companies continue.
- No matching jobs: inspect location, title, seniority, and experience rules.
- A schedule starts late: GitHub schedules are best-effort; use manual dispatch while testing.

## Cost protection

The system avoids paid APIs, proxies, browsers, and continuously running servers. Monitor Actions duration and Cloudflare requests/database usage while expanding through 50, 100, 250, then 500 companies.
