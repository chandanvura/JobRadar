# Bounded source recovery

## Justification and evidence

On 20 October 2026 in India, the repository had successive manual scan
dispatches five minutes apart. Each latest workflow passed its gate and skipped
collection. A workflow success did not mean that a scan ran. Defer independent
recovery for 30 minutes after a successful completed scan workflow. Keep the
five-minute availability probes and the 150-minute collection gate. Failed
workflows and invalid timestamps do not start this cooldown.

The current Wipro XML snapshot contained 6,653 listings and 1,603 target-location
prefilter matches. Only 45 could pass the other shortlist checks. The old
collector requested a detail page for every candidate because the feed lacks
posting dates. Preserve all candidates and their full feed descriptions.
Request a date only when the JD, role and location can otherwise qualify.
Do not use the feed's expiry date as a posting date. Other unknown dates stay
unknown. The resulting captured-feed replay plus live detail check retained
all 1,603 candidates, made 45 date-page requests, found 44 dates, and completed
in 68.38 seconds with domain concurrency one. Zero jobs passed current eligibility.

Accenture's Workday endpoint returned a 2,000-row listing cap and employer-published
city facets. Verifying every recent detail serially can exceed the source's
15-minute limit. For normal discovery, verify at most 200 details within a
240-second detail budget. Keep completed records in listing order and report
`Limited coverage` when capped or timed out. Do not claim full inventory coverage.
Strict complete-inventory adapters retain their existing full-snapshot checks.
Cancel pending requests when a budget or source cancellation occurs.

Limited sources are excluded from the authoritative retirement manifest by
the existing ingestion rule. Unseen jobs and application history are preserved.
No job gets an invented JD, posting date or eligibility result.

## Unresolved external failures

HubSpot's published careers language script identifies its production GraphQL
endpoint. A read-only query to that endpoint returned a provider-side 404
inside GraphQL errors, as did its old public Greenhouse board. Do not replace
this failure with an empty verified feed or use its QA service.
On 20 October, a live job-page request succeeded and the next request returned
`X-JobRadar-Catalog-Cache: hit`. D1 live reads had recovered. The 07:46 UTC
production scan wrote 1,230 rows from 5,672 candidates and checked 701 sources.
It still failed six sources: Accenture (429), HubSpot (404), Wipro (timeout),
Adidas (incomplete or malformed feed), Eaton (moving pagination) and Maersk
(inconsistent complete pagination). Salesforce was no longer among the failures.
Keep these failures visible. Do not bypass access controls or relax complete
inventory validation merely to make source health green.

## Verification and rollback

Run the Python and web harnesses. Test the cooldown boundary, missing or future
timestamps, preserved XML records, unknown dates, Workday caps, timeout results,
and request cancellation. Complete-inventory tests must still pass.
Check the real source probes separately from the production scan.

No database migration is needed. Revert the change for code rollback.
Do not remove jobs, cached recovery data or application history.
