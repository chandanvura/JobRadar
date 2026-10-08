# Career Ops review for JobRadar — 7 October 2026

Reference: https://github.com/career-ops-hq/career-ops at commit `3be1cdf033d54e977c9770441122c9e7cf3c823f`.

Career Ops runs a local job-search workflow. `scan.mjs` reads configured portals and calls public provider APIs without an LLM. AI CLI modes then evaluate each job against a personal CV, prepare application material and record outcomes. The human submits applications. Its website is documentation and onboarding, not a complete employer-feed API.

The useful component for JobRadar is the provider layer: 104 public-source modules in the inspected snapshot, including IBM, Dassault, Avature, iCIMS, Taleo and SAP SuccessFactors. Some modules index multi-employer boards; 104 modules does not mean 104 independently verified employer feeds. No installation or Node runtime integration is needed to learn from these HTTP implementations.

| Component | Practical use | Verification required for JobRadar |
|---|---|---|
| IBM provider | Lead to IBM's careers search API and field names | Recover current linked JS, actual payload, full pagination and every job detail |
| Dassault provider | Exalead career-card facet and language-filter lead | Confirm current first-party calls; validate totals and details; do not turn update timestamps into posting dates |
| iCIMS provider | Recognizes newer `iCIMS_JobCardItem` markup | Keep tenant ownership checks; traverse actual next links; verify advertised totals and all requirements |
| SuccessFactors provider | Separate RMK HTML tiles from newer CSB JSON search; discover locales | Do not assume locale defaults or call an empty shell a complete empty board |
| Avature provider | Search-results HTML and structured description patterns | Current Siemens board is Avature; collect current employer URLs and exact pagination |
| HTTP pacing / failure taxonomy | Separate transport/throttle failures from missing boards | Keep blocked and unverified sources visible; do not import dead-board suppression as successful coverage |
| Reverse ATS directories | Additional discovery leads | Never use third-party slug matching as employer identity proof |
| Résumé scoring and application tracker | Optional personal job-search capability | Separate future feature; does not repair employer coverage |

The default provider contract permits missing descriptions. Eight modules contain opt-in detail enrichment. Many scans have page/job caps, and the reverse scanner excludes undated postings. Those choices suit candidate discovery but cannot establish JobRadar's complete employer coverage. Its trust heuristic permits ATS domains; that does not prove a board belongs to a named employer. JobRadar retains stronger ownership and completeness checks.

## Actual work

Refreshed production baseline: 700 companies, 201 Limited coverage sources, 1 error at `2026-10-07T06:54:47.946Z`.

An eight-employer Actions batch captured first-party evidence: IBM, Dassault Systemes, Infineon Technologies, Siemens, Schneider Electric, ASML, SAS and Deutsche Bank. Initial evidence run: https://github.com/chandanvura/JobRadar/actions/runs/37584310900.

Confirmed current leads:

- IBM: `https://www.ibm.com/careers/search` publishes scope `careers2`, app ID `careers`, language `zz`; remaining actual linked client libraries require inspection before endpoint validation.
- Dassault: corporate site links to `/careers`, then `/careers/jobs`; current application publishes module-preloaded JavaScript and `exaleadApi` configuration. Repository API references remain leads until current bundles confirm them.
- Siemens: `https://jobs.siemens.com/careers` redirects to `https://jobs.siemens.com/en_US/externaljobs`; public markup and bundles identify Avature. Old Eightfold assumptions are not valid current evidence.
- Infineon: corporate careers links to `https://jobs.infineon.com/careers`, which exposes Eightfold frontend bundles.
- Schneider: registered `/ww/en/about-us/careers/` returns 404. No guessed replacement is accepted.
- ASML: published careers page links to `/en/careers/find-your-job`; current linked JS is captured.
- SAS: official India careers iframe links to `globalcareers-sas.icims.com/jobs/intro`; mixed regional/subsidiary ownership still requires review.
- Deutsche Bank: official corporate link to careers site; careers navigation publishes `/professionals/search-roles`.

A justified discovery repair is implemented in `scripts/ats_deep.py`: parse module-preload and script-preload links, honor the HTML base URL, recognize published search-roles navigation, prioritize actual search/application scripts, and validate a configurable bounded 1–64 asset limit. No asset names or ATS slugs are fabricated. Normal batches retain the 24-asset default; this eight-employer review explicitly permits 64. Four regression cases cover module dependencies, deduplication, base URLs and absent scripts. Local result: 295 tests passed; Bandit passed.

`companies.csv` has no changes in this review. Coverage stays unresolved until complete feed and focused production verification pass. The static provider comparison is `ats-detective/career-ops-provider-comparison.json`; flags are triage hints, not claims of supported employers.

Reproduce in GitHub Actions with `docs/archive/workflows/career-ops-review.yml`, using `companies/career-ops-review-2026-10-07.json`. All employer collection uses standard Python HTTP; no AI API, browser, proxy or continuous server is required.

The repaired capture passed in https://github.com/chandanvura/JobRadar/actions/runs/37584678951. IBM: 47/48 requests returned 200; Dassault: 67/67; Infineon: 57/57; Siemens: 22/22; Schneider: 17/18; ASML: 16/16; SAS: 34/34; Deutsche Bank: 16/16. Counts include public assets and navigation, not job listings. Public response hashes and linked-source provenance are preserved in `ats-detective/career-ops-evidence-2026-10-07.json`. Raw HTML/JS remains in the seven-day Actions artifact.

CI validation passed: https://github.com/chandanvura/JobRadar/actions/runs/37584685794 (Python, security, dependency audit, web and compiled API checks). The repeat capture proves the discovery repair works in Actions; no new feed is represented as recovered.
