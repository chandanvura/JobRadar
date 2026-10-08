# Scan timing and dashboard refresh — 8 October 2026

## Observed production evidence

| Workflow | Configured UTC slot | Run created / started UTC | Result |
| --- | --- | --- | --- |
| Full scan [37734386012](https://github.com/chandanvura/JobRadar/actions/runs/37734386012) | 04:07 | 05:50:14 | All discovery shards and finalization passed; workflow ended 05:59:46 |
| GitHub watchdog [37756698273](https://github.com/chandanvura/JobRadar/actions/runs/37756698273) | Hourly at :44 | 09:26:46 | Check completed; latest finished scan was 208.1 minutes old, so recovery was suppressed |
| Recovery scan [37767251667](https://github.com/chandanvura/JobRadar/actions/runs/37767251667) | Dispatched rather than scheduled | 11:00:47 | All shards and finalization passed; workflow ended 11:10:26 |
| Deployment [37783155005](https://github.com/chandanvura/JobRadar/actions/runs/37783155005) | Push triggered | 13:17:12 | Production and independent Cron deployed; dispatch secret configured |

The scan's 04:07 slot is inferred from its `7 */4 * * *` configuration and the nearest preceding scheduled slot. GitHub does not provide the originally intended event timestamp in this run payload. Creation and start timestamps are identical: this evidence points to delayed scheduled-event delivery, rather than a long wait after creation. Discovery plus finalization took under ten minutes in this run. A workflow succeeding does not imply every employer source succeeded.

GitHub documents that scheduled events may be delayed or dropped under high load: https://docs.github.com/en/actions/how-tos/troubleshoot-workflows. GitHub's hourly watchdog shares that scheduling dependency. The separately deployed Cloudflare Cron checks every 15 minutes and was confirmed configured in the successful deployment logs.

## Change

Both recovery checks now request a scan at **four hours since the last completed scan**, instead of five. The independent check can detect eligibility on its next 15-minute tick. This removes the deliberate extra hour; it does not guarantee runner start or scan completion at an exact minute. Active scans and known D1 quota exhaustion still suppress dispatch. Scheduled full scans remain six per day; no employer polling frequency or manual notification mechanism was added.

The dashboard now uses a compact workspace introduction, a navy opportunity summary with decorative radar rings, clearer typography, quieter cards, and mobile header controls. Search, filters, all navigation views, application tracking, profile and resume tools remain available. The Scraper Health view explains the schedule, recovery behavior, and links to actual run history. Light and dark palettes, focus outlines and reduced-motion preferences are retained.

Validation uses the repository verification harness and GitHub CI. Production deployment and visual review are checked after merge; these are not implied by local build success.
