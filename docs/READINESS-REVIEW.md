# Nine-month readiness review — 21 October 2026

Target operating horizon: 21 July 2027. The target is low-touch operation, not
zero intervention or guaranteed availability. Reviewed base revision:
`5a37e7379d94278e6ddc31d9ad67143348c3a705`.

## Security review and scope

This is a systematic review of security boundaries and failure handling, backed
by automated checks. It is not a claim that every line is vulnerability-free or
an independent penetration test. Generated bundles, third-party dependency source,
cloud account internals and unavailable production telemetry are outside the
manual review. Dependency advisories and CodeQL remain separate automated gates.

| Boundary | Review / evidence |
| --- | --- |
| Public API versus ingestion | Worker routes require bearer authorization before parsing writes; bounded streamed JSON; parameter-bound SQL; local compiled Worker/D1 tests exercise authentication, invalid inputs and replay |
| Untrusted descriptions and URLs | React text rendering, restrictive CSP, HTTPS application URL checks, escaped resume export; source fetching is isolated from finalization secrets in CI |
| Private application history | Browser workspace isolation is explicitly not authentication; validated import, cross-tab history merge and corruption recovery; full primary storage and recovery-only quota failures stay visible |
| Job trust | Shared city policy; required-experience evidence/conflicts; unknown dates and truncated JDs cannot establish verified eligibility; retained history is independent of current public catalog |
| Collector failure isolation | Deadlines, provider concurrency, bounded read retries, unique-ID/count/final-snapshot guards; failed snapshots preserve prior source data |
| Notifications | Sanitized runtime transport/JSON failures, no immediate replay after ambiguous send; failure auditing continues remaining alerts; operational checks now assess daily notification workflow freshness/failure |
| Recovery automation | Fixed GitHub repository/health origin, allowlisted workflow reactivation, active-run and quota guards, cooldown after completed runs, no automatic PR merges |
| Backups | Daily export, disposable SQLite restore with integrity/schema/foreign-key checks, compressed checksums and 90-day rolling artifacts; no production restore performed |
| CI and dependencies | Required python/web, CodeQL, Bandit, full/production dependency audits, locked versions, monthly compatible-update PRs, explicit major-version review |

Manual inspection covered the Worker routing/auth/ingestion and cache/fallback
paths, private tracking/import/export, job policy, collector request/retry code,
Telegram handling, watchdog and independent scheduler, backup verification,
operational checker and workflow permissions. Automated Python checks cover the
collector and scripts; web tests cover product and local Worker behavior. Keep
review claims scoped to this evidence rather than treating a clean scan as proof.

## Production evidence

- Scan run: https://github.com/chandanvura/JobRadar/actions/runs/39566105230
  completed finalization on 21 October, but source health was degraded:
  741/743 successful. A successful Actions run is not proof all feeds succeeded.
- Backup run: https://github.com/chandanvura/JobRadar/actions/runs/39567662447
  executed `verify_d1_backup.py` successfully before compression/upload. Artifact
  `jobradar-d1-39567662447` was non-expired and 19,650,867 bytes when checked.
  This verifies a disposable SQLite restore, not a production D1 restore drill.
- Telegram daily run:
  https://github.com/chandanvura/JobRadar/actions/runs/39564879713
  reported delivery to the configured private chat. This is API/workflow evidence,
  not proof a person read the message. No new message was sent for this review.
- Deployed baseline:
  https://github.com/chandanvura/JobRadar/actions/runs/39583569036
  passed production verification. Public health reports fresh ingestion/database
  configuration while returning 503 honestly for the two source failures.

## Open acceptance criteria

1. **Feed recovery:** issue #80 remains open until a naturally scheduled scan of
   the repaired revision verifies Eaton and Maersk, complete counts and unique
   records. Do not delete failing sources, weaken completeness checks, relabel
   them empty, or dispatch scans just to manufacture closure.
2. **Observation period:** hourly operational reports and daily scan/notification/
   restore-verified backup evidence must accumulate through normal operation.
   One day's checks cannot prove nine months of reliability. Missed/stale evidence
   must fail visibly; notification workflow success does not prove every individual
   alert was delivered.
3. **Account/provider limits:** expired tokens, new vulnerabilities, repeated feed
   schema changes and provider outages can require owner action. Backups rotate;
   a browser export is still needed before clearing private local history.

No new companies, destructive production operations, protection weakening or
additional recurring services are required for this review.

## Follow-up repository inspection

At base `10ece6aa3687d8e3c33313ba78d5ed5b5facad99`, inspection and fault tests
identified two concrete areas requiring repair:

- **Private backup integrity:** restore ignored draft/request/onboarding fields
  included in exports; failed resume/preferences writes could be swallowed before
  reload. The export path could silently omit unreadable optional records, and
  its unbounded export did not match the 5 MB import gate. Use one six-field
  contract, validate before writing, merge existing history first, verify each
  save and keep failures visible without reload. Both export and import now use
  a 25 MB bound; corrupted application rows fail explicitly instead of silently
  disappearing. Restoration is not a multi-key browser transaction: earlier
  successful updates remain if a later write fails, and the notice says so.
- **Telegram setup diagnostics:** raw urllib transport/JSON exceptions could
  escape the setup helper, including token-bearing request URLs supplied by the
  exception. Sanitize those failures, suppress chained context, require an
  explicit successful API response and reject credential-bearing base URLs.
  Tests use fake credentials and send no messages.

A UI fault test failed before the restore repair, and three setup transport/
response fault tests failed before sanitization. Added backup tests exercise
six-field round trips, workspace isolation, large valid exports, malformed rows,
blocked reads/writes and preservation of existing application history.

The tracked-tree credential-pattern pass inspected 385 text files and found no
matches for the checked private-key, GitHub-token, AWS-access-key and Telegram-
token signatures. This is a limited pattern check of current tracked content,
not a historical secret audit or a substitute for enabled GitHub secret scanning.
The security-sensitive API, collector, browser storage, export, recovery,
permissions and cleanup paths were reviewed alongside repository-wide automated
checks. Generated output and third-party implementation source are not claimed
as manually audited. Feed acceptance criteria in issue #80 still apply.
