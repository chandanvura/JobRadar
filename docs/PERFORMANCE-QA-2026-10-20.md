# Catalogue loading and search preference QA

## Changes

The dashboard publishes bounded ID ranges. The browser loads up to four ranges at once, instead of waiting for every 500-job page in sequence. Every page stays limited to 500 jobs. The complete range result replaces the initial preview. Retired preview rows cannot survive the refresh.

Malformed ranges, invalid page identities, timeouts and failed requests recover to the complete static backup. A failed range cancels its siblings. Aborted refreshes cannot publish stale results. Older clients retain cursor pagination. The public cache distinguishes upper bounds and uses a new namespace.

Preference matching compiles preferred titles, role families and skills once per preference change. Search edits close the editor before the transition updates results. JD evidence, posting-date rules, Bengaluru/Hyderabad shortlisting and application history remain unchanged. No new persistent browser cache was added.

## Verification

204 web tests passed, plus UI type checks, lint, production build and compiled Worker/SQLite integration. Added checks cover four-request concurrency, ordered complete results, retired preview rows, invalid bounds and manifests, failed parallel requests, range cache separation and exact matching equivalence.

Measured test fixture: 2,000 preference matches took 98 ms with repeated setup and 15 ms with compiled preferences, with identical results. The 7,000-job loading fixture completed 14 requests with a peak concurrency of four. This is a controlled benchmark, not a promised real-network latency.

The full dashboard harness also exercises 7,000 jobs and 700 companies, navigation, bounded rendering, edit/save/reset without catalogue refetches, paging, feedback, application stages and history after jobs leave the feed.

## Limits

Network speed and first-time full JD analysis still affect cold loading. Initial jobs remain available while the complete catalogue loads. Public source health is separate from interface performance.
