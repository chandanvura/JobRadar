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

## Maintenance acceptance criteria

1. **Feed recovery:** #80 is closed with the completed production evidence below.
   Current AXA/Lenovo/Citigroup exceptions remain visible in #87. Do not delete
   failing sources, weaken completeness checks, relabel them empty, or dispatch
   scans just to manufacture closure.
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

### Scan validation dependency mismatch

Run `39585587526` failed its validation job on 21 October before discovery:
Python reported `No module named pytest`. The job installed the runtime-only
manifest even though pytest had moved to development requirements. Validation
now installs `requirements-dev.txt`; discovery/finalization retain runtime-only
dependencies. A regression check inspects every workflow job that invokes pytest
and resolves its installed manifests recursively. The check failed before the
repair. This is separate from the employer snapshot failures in issue #80.

## Feature-development closure — 21 October 2026

Application-code baseline: `7b7bb0b7fd12e47147976e349266ce19bfc1d985`.
Required python/web validation and CodeQL passed on this main revision. The
released backup/setup safeguards were verified by deployment run
https://github.com/chandanvura/JobRadar/actions/runs/39588958645 . The later timing
change affects collectors only and takes effect in normal subsequent scans.

Production scan https://github.com/chandanvura/JobRadar/actions/runs/39589334236
completed finalization. Job 119186299856 reported Eaton: 173 listings; job
119186299565 reported Maersk: 1,249 listings. Neither source emitted a warning.
The existing unique-ID/count/detail/final-snapshot guards remained active;
Maersk used complete category/global reconciliation. Issue #80 was closed based
on this evidence. Public health reports 740/743 successful sources, fresh data,
configured ingestion and database access. It correctly returns degraded health
for AXA, Lenovo and Citigroup; issue #87 carries the exact failure evidence.

AXA returned HTTP 403 to a follow-up read, so its current search client could not
be verified. Lenovo's first follow-up read returned 403; a later genuine listing
returned 61 jobs and the unchanged parser correctly accepted its 10-record first
page, count/range and next offset. That does not prove full-source recovery or a
reproducible parser defect. Citigroup's overlapping pages were rejected by the
existing bounded snapshot guards. No unsupported parser rewrite, access bypass,
source deletion or extra retry was used to hide these exceptions.

Run 39605710108 completed only the freshness gate; discovery/finalization were
skipped and provide no newer collection evidence. An Actions success is not
equivalent to a fresh complete scan.

The repository now enters maintenance-only mode: no new companies, features,
framework/language migrations, cosmetic refactors or speculative tuning. Keep
existing scans, fallback catalogs, backup verification, dependency/security
alerts and read-only operational checks. Only reproduced security, data-loss or
existing-functionality failures justify narrowly scoped maintenance fixes.
Automated maintenance may prepare isolated draft repairs; it must not merge,
deploy, change protections or perform destructive/production data operations.
The remaining provider exceptions and the nine-month observation period are
operational limits, not unfinished feature development or grounds to claim all
feeds are healthy. There is no guarantee of zero outages or zero owner intervention.

### Issue #87: reproduced Lenovo last-page failure

A bounded read-only inspection on 21 October reproduced Lenovo's failure at
offset 60: its final page publishes `61-61 of 61 job` (singular), while the
Avature parser accepted only plural labels. Accept singular/plural job/result
labels without changing advertised range, count, unique-ID or snapshot checks.
The regression failed before the repair. All 974 Python tests and Bandit pass;
the repaired read-only adapter collected 61 listings and 23 relevant full details
with no coverage warning. This is local adapter evidence, not a production scan
or deployed recovery. AXA still returns HTTP 403; keep #87 open until remaining
exceptions have source-specific completed production evidence.

## Experience regression review — 21 October 2026

Read-only inspection of the public dashboard's 100-job sample reproduced actual
experience mismatches, including recent listings:

- Salesforce job 371456 (Senior Technical Consultant) and job 366850 (MTS Backend):
  the application-frequency notice, “within 12 months”, became one year of required
  experience. Application windows cannot establish candidate experience. The former
  has only a preferred 5–7-year requirement in the inspected description; the latter
  has no extracted required years. Both remain reviewable rather than verified.
- LSEG job 371174 (Senior Linux DevOps Engineer): “for the first 6 months” described
  initial training hours. Its actual “5 to 7+ years” Linux requirement was hidden
  by a later “preferably RHEL” qualifier. Separate that qualifier, exclude forward
  duration windows and preserve the published five-year lower bound. It fails the
  existing 0–3 years policy.
- IQVIA job 365668: stored `5–3` conflicts with the JD's `1.5–3`. Display the JD range
  with an explicit invalid-scan warning and zero eligibility pending verification.

Python and browser parsers share the same duration/fragment/range rules and
fixtures. Reversed open-ended ranges remain conflicts. Genuine JPMorgan 1+ and
Rubrik 0.5–1-year requirements remained unchanged in the local sample check.
No posting-date, location, role, freshness, private-history or feedback-policy
exceptions were introduced. No production rows were rewritten or scans triggered.
The repair requires the protected release path before browser behavior changes;
future ordinary collection re-evaluates stored eligibility. These are tested local
results, not evidence that the live site already serves this repair.

## Adidas published-search recovery — 23 October 2026

The registered careers XML publication is unavailable. Adidas's public
`https://jobs.adidas-group.com/` links its live `/search/` page; that page publishes
the `locationsearch` form field. The India search returned 14 listings. A bounded
read-only adapter check collected all 14 full descriptions and 14 distinct
employer requisition numbers, then rechecked the first-page records/count after
detail collection. Public dates remain day precision; no posting hour is inferred.
The employer requisition number (for example 550170), rather than the separate
SAP URL ID, preserves the prior external-ID contract.

The source repair retains advertised ranges/counts, duplicate detection, exact
employer URLs, India filtering, complete full descriptions and final snapshot
verification. Missing, foreign, duplicate or changed records fail the source.
The new-source regression fails against the previous adapter. All 998 Python
tests and Bandit pass locally. The live check used this environment's standard
outbound HTTP proxy; production transport code is unchanged. This is local
read-only evidence, not a finalized production collection or deployed recovery.
Boehringer Ingelheim's public search/feed still lacks accessible collection
evidence; keep issue #87 open. No production scan or write was triggered.

## Completed Adidas recovery — 23 October 2026

Natural scan https://github.com/chandanvura/JobRadar/actions/runs/39854451509
completed eight shards and finalization. Job 120089235574 reports Adidas: 14
listings; finalizer 120092730783 lists only Boehringer Ingelheim as failed.
Public health reports 742/743, fresh database/ingestion. This supersedes the
earlier pending Adidas verification. Boehringer's registered feed returned HTTP
403 in the same shard; its exception remains unresolved.
