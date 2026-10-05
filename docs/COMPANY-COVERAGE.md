# Employer coverage expansion — 5 October 2026

The registry now contains 700 distinct enabled employers, up from 670. This is
an expanded discovery list, not a claim that every employer has an eligible job.
Fortune 500, Fortune Global 500 and Fortune India 500 are different lists;
private unicorn valuations also change. No unverified ranking or valuation badge
is added to the portal.

New large enterprise and MNC sources: Costco, Marriott International, Southwest
Airlines, DoorDash India, Regeneron, McKesson, Allstate, MassMutual India, HARMAN,
Cargill, CBRE, JLL, Principal Financial Group, The Hartford, GE Vernova and BD.

New startup, scaleup and software sources: Zepto, Zetwerk, OfBusiness, Rebel Foods,
Cars24, Shiprocket, CarDekho, Workato, Automation Anywhere, Figma, Couchbase, Vimeo,
ChargePoint and Avaamo. This group includes public companies and former unicorns;
it does not describe all members as currently private unicorns.

Employer career sites and employer-hosted ATS pages were reviewed. The source
review JSON records an independent HTTP probe, including blocked or timed-out
pages. A successful HTTP response is not evidence of a complete machine-readable
job feed. Existing limited-coverage diagnostics and official-career fallback
links remain in place.

Eight new sources use known Greenhouse or Workday boards; the other 22 use
official-career discovery. The supported adapters still apply the Bengaluru /
Hyderabad, role, experience and employer-date policies. Adding a company does
not bypass the internship/fresher separation or create an invented job listing.

`Publish company registry additions` inserts only companies absent from the live
catalog. Its scan concurrency lock protects metrics from concurrent updates.
New entries show **Awaiting scan** with null check timestamps until an ordinary
scheduled scan checks them. Existing companies, job activity and scan history
are preserved. If live D1 is unavailable, synchronization fails visibly instead
of treating the backup as a current registry. A full scan is not started on code
push, avoiding an unnecessary free-tier write spike.

Primary reference directories:
- https://fortune.com/ranking/fortune500/
- https://www.fortuneindia.com/rankings/mnc-500/2026
- https://www.zetwerk.com/wp-content/uploads/2022/09/unicorn-assignment.pdf

Exact new career endpoints and probe results:
[`source-review-2026-10-05.json`](../companies/source-review-2026-10-05.json).
