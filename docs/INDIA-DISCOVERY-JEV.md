# India discovery and two-city shortlisting

## Justification

Discover employers and jobs across India. Include explicitly published India
remote roles. Automatically shortlist only Bengaluru and Hyderabad roles.
Keep experience and posting-date checks. Preserve application history.

## Evidence

On 20 October 2026, 23 additional employer feeds passed live checks. Their
boards and sampled job pages returned HTTP 200. They returned 756 listings
and 102 India technical roles. The registry grows from 719 to 742 companies.
See `docs/evidence/verified-india-sources-2026-10-20.json` for every source URL,
check time, hash, count and activation decision. Illumia and Prophecy had no
current matching India role and were not added. No search snippet established
a live vacancy. Zero checked roles passed every automatic shortlist rule.

The added employers are 2K, Onehouse, Ontic, AlphaGrep Securities, APEXX Global,
Bidgely, Careway Health, Drivetrain, Dscout, Energy Exemplar, H1, HackerOne,
Karat, Level AI, Litmus, Mitsogo, Outmarket AI, TechnologyAdvice, Tempo,
Together AI, Toradex, WPP and XO Health.

Source verification is evidence of the public publisher and current feed.
It does not guarantee an offer, legal employer identity or future availability.

## Decisions

Keep published location text. Group other Indian locations under `Other India`
for browsing. Do not turn a generic remote label into India permission.
Reject foreign locations named Hyderabad when no India location is published.
Use the shared location policy in collection, API ingestion and the UI.
Older eligibility flags and recovery catalogs cannot admit remote-only or
other-city jobs into recommendations. Saved jobs and applications remain visible.

All Jobs can browse the India catalog independently of an old saved city filter.
The API uses four bounded city-index ranges. It does not sort the full catalog
for every page. Normal discovery keeps the existing request and detail budgets.
Sources that cannot prove full coverage remain limited. No complete-source
inventory check or job-retirement safeguard is disabled.

## Failure repairs

- Remitly: stop at the employer's advertised complete count. Do not request a
  page beyond the inventory. This provider repeats a page for an out-of-range
  offset. The repaired probe returned 160 unique full records in 26.03 seconds.
- Maersk: collect disjoint categories from the employer's published facets.
  Require their counts to sum to the global count. Reject duplicates, missing
  rows and changing pages. Recheck category starts and the global start.
  The probe reconciled 1,267 listings and 220 unique technical details in
  41.78 seconds. Every retained detail had a full JD.
- Eaton: use the public search endpoint's accepted relevance ordering. Keep
  duplicate rejection and the final first-page check. The probe reconciled
  176 listings and 82 unique relevant details in 24.01 seconds.
- ThoughtSpot: a listed detail without its current server payload starts one
  bounded snapshot retry. Employer, board, ID, location and JD checks remain
  strict. The repaired probe reconciled 65 unique records in 36.81 seconds.

Use the existing registry workflow to verify repairs and store real jobs.
A dated, bounded recheck request covers adapter-only changes. A successful
check after the request stops repeat work. Failed or partial results cannot
pass that recheck. The sidebar counts current company failures separately
from the immutable last full-scan history.

## Remaining limits

Accenture still returns a rate limit. HubSpot's registered feed is unavailable.
Do not bypass access controls, invent an empty feed or call those sources
repaired. The last completed full scan checked 719 companies and reported
five failures. Targeted checks do not rewrite that historical scan.

Run regression, security, build, type and compiled database checks. After
release, verify the live source rows, stored job rows and shortlist exclusions.
The wording follows short, direct instructions inspired by ASD-STE100. This
is not a claim of formal compliance or certification.


## Accenture official search follow-up

Justification: replace the rate-limited Workday source with the public search used by Accenture's current India careers page.

Evidence: the official careers JavaScript publishes `/api/accenture/elastic/findjobs`. A live check on 20 October 2026 returned 200 unique official India job links with full employer descriptions. The adapter requests the newest 100 records from each employer-published experience band (0–2 and 2–5 years). JD requirements still determine eligibility.

Verification: the adapter validates India, employer URLs, job identity, descriptions and counts. Tests reject wrong-country records, external links, missing requirements and duplicate page identities. Index update timestamps never become posting dates. Exact dates require matching employer JobPosting evidence. The live sample had zero verified posting dates and zero automatic eligible records.

Coverage remains explicitly limited to these two bounded search partitions. This is not a complete Accenture inventory. Existing records and application history are preserved. HubSpot remains unresolved.
