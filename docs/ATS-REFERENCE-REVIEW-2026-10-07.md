# HTTP reference review — 7 October 2026

JobSpy is a federated search collector: site-specific collectors run concurrently and normalize records into a shared schema. Requested result limits and optional detail fetching are appropriate for search, but do not certify complete employer inventory. JobRadar reuses the architectural ideas through its existing Python adapters, source-family concurrency limits, bounded retries, shared Job model and strict snapshot validation. No JobSpy runtime, fingerprint transport, proxy or browser dependency was added.

## Reviewed GitHub references

| Repository | Useful strategy | Adaptation for JobRadar |
|---|---|---|
| [speedyapply/JobSpy](https://github.com/speedyapply/JobSpy) | Separate collectors, concurrency, common job schema | Retain existing adapters and standard HTTP; reconcile advertised totals instead of requested slices |
| [career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops) | First-party employer providers; IBM and Dassault endpoint leads | Corroborate current public configuration and validate every page/detail; omit reference caps and date guesses |
| [Esteban-PG/Job-alert-bot](https://github.com/Esteban-PG/Job-alert-bot) | IBM Elasticsearch country filter and aggregation | Match exact India count against public country facet; incomplete details remain unresolved |
| [stapply-ai/ats-scrapers](https://github.com/stapply-ai/ats-scrapers) | ATS-specific HTML and JSON parsing | Parse published fields; omit paid/browser/fingerprint fallbacks and blocked-as-empty behavior |
| [colophon-group/jobseek](https://github.com/colophon-group/jobseek) | Inventory monitors separated from detail scrapers; reconciliation | Fail closed on truncation, duplicates and missing details |
| [job-hunter-toolkit/job-hunter-toolkit](https://github.com/job-hunter-toolkit/job-hunter-toolkit) | Direct ATS collection and provider-level pacing | Reuse shared source-family semaphore; bounded snapshot restart |
| [Feashliaa/job-board-aggregator](https://github.com/Feashliaa/job-board-aggregator) | ATS discovery directories | Secondary leads only; no dataset import or employer mappings without official evidence |

Snapshots inspected: JobSpy `655ec04663b798742704f1038262b631cd1988f2`, Career Ops `3be1cdf033d54e977c9770441122c9e7cf3c823f`, Job-alert-bot `6895e99a4853a9e226d0c0af65c494de319c6bd6`, ATS scrapers `6b44a1badc9bfbf5cf176f75265cc5729e520e99`.

## Four-company discovery batch

| Employer | Official chain / identity | Actions HTTP evidence | Remaining completeness check |
|---|---|---|---|
| IBM | ibm.com careers/search publishes `careers2`, app `careers`, language `zz`; returned careers.ibm.com job URLs | Exact India total 1,131; country facet agrees; offsets 0/30 each return 30 | First detail returns HTTP 202 with empty body, no JobPosting. Keep unresolved; search descriptions are snippets |
| Dassault Systemes | 3ds.com → careers → careers/jobs; current Nuxt config publishes exalead API and career facet; detail identifies Dassault Systèmes and job ID | Namespaced XML advertises 673 English career records, exact count, pages of 10; first detail has matching ID and dated JobPosting | One complete Actions snapshot passed all 673 details, but a repeat returned estimated=true. Keep unresolved; JSON-LD descriptions are summaries, full requirements are in the HTML section |
| Infineon Technologies | infineon.com careers → jobs.infineon.com/careers; PCSX config domain infineon.com; detail identifies Infineon | India search advertises 165 records; actual positionUrl links; full detail JSON and matching public JobPosting | Validate every PCSX detail and its returned ID, positionUrl and publicUrl; HTML JobPosting titles can be stale. PCSX postedTs is a Unix posting timestamp, corroborated against the first public JobPosting |
| Siemens | Official jobs.siemens.com board now redirects to current Avature externaljobs; actual SearchJobs and JobDetail links | Public first page reports `999+`, six actual result links | Capped global total is incomplete. Derive a published geographic facet before implementing a complete feed |

Executable evidence probe: `python -m scripts.reference_feed_probe`. Execute employer HTTP exclusively on GitHub Actions through `.github/workflows/reference-feeds.yml`. Raw public responses, hashes and request metadata are retained in its seven-day artifact. Probe success means evidence capture, not a recovered feed.

Complete-feed gate: `python -m scripts.ats_repaired --companies "Infineon Technologies"`. This requires exact advertised totals, unique IDs, every detail, no missing requirements and no coverage warning. No production write occurs in either probe.

Baseline refreshed before this batch: 700 employers, 201 Limited, 1 error, production server time `2026-10-07T07:15:50.596Z`. Draft mappings must not be merged until complete Actions collection succeeds; then focused production sync and a fresh coverage snapshot must establish the actual after counts. HubSpot remains the existing error (retired Greenhouse endpoint and unavailable current upstream detail feed).
