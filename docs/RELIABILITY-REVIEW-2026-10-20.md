# Reliability and evidence review

## Decisions

1. Confirmed Cloudflare daily quota errors now put public catalogue reads into an isolate-local, asset-binding-specific cooldown for at most 60 seconds. The next UTC reset ends it sooner. A short cooldown avoids repeated doomed reads while still retrying automatically after recovery or a provider plan change. Health and writes always use the live path. Ordinary errors do not activate the quota cooldown. Backup data stays labelled.
2. Complete language names use token boundaries rather than prefix expansion. A Java query cannot match JavaScript alone. Incomplete words still support autocomplete. Single-letter C and R queries remain meaningful rather than returning every job.
3. A saved description marked as truncated cannot prove full JD experience requirements. Such records stay browseable with a verify-full-JD label and do not enter automatic shortlists. Original records and application history remain intact.

## Verification

208 web regression tests passed, plus UI types, lint, production build and compiled Worker/SQLite API integration. New cases cover quota cooldown isolation, recovery at UTC reset and after 60 seconds, uncached health status, Java/JavaScript separation, partial-word autocomplete, C/R terms and conservative handling of JD extracts. Existing checks cover 7,000-job navigation and preference edits, 10,000-job pagination, search-worker errors/cancellation, cross-tab history, storage failures, API authentication and database query bounds. CI repeats the Python collector and security checks before merge.

## Current operational limit

Cloudflare reported exhausted D1 daily read quota on 20 October. Code changes cannot replenish that allowance. The portal provides labelled saved data during the outage; live database verification remains limited until quota recovery. No claim of fresh data or guaranteed zero latency is made.
