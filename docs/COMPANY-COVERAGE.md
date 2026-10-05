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

`Publish company registry updates` inserts missing companies and updates repaired
source configurations. Changed sources receive a bounded focused refresh; failed
checks preserve the previous metrics with an explicit pending warning. Its scan concurrency lock protects metrics from concurrent updates.
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


## Limited coverage repairs — 2026-10-05

Reviewed all 389 sources currently marked Limited coverage. Thirteen official
employer pages exposed verifiable public ATS feeds: Mastercard, Netskope,
Bentley Systems, Celigo, CloudSEK, DXC Technology, Expedia Group, Johnson &
Johnson, Pfizer, Rackspace Technology, State Street, Uniphore and Yugabyte.
Those companies now use direct Greenhouse or Workday sources, avoiding fragile
career-page discovery. Probe evidence and totals are recorded in
[`coverage-repairs-2026-10-05.json`](../companies/coverage-repairs-2026-10-05.json).

Discovery also supports Greenhouse embed `for` tokens, escaped script URLs,
Phenom link attributes and ATS boards linked from secondary official pages.
JSON-LD extraction handles nested ItemLists, type arrays, every job location and
URL identity when an employer omits an identifier. Greenhouse job dates come
from the public detail API's `first_published`, with employer JSON-LD fallback.
Unrelated hosts cannot be mistaken for an official ATS by putting its hostname
in a URL path.

The registry workflow verifies changed sources only (maximum 25), publishes
real company metrics and target-city candidate jobs, and shares the ordinary
scan lock. It does not create a misleading partial full-scan record or change
other companies' job activity. Failures keep previous metrics and show a pending
repair warning. Normal scans still reconcile job activity and notifications.

This improves collection without paid services. Remaining blocked, timed-out or
non-structured sources keep their official career links and Limited coverage
warnings. Workday's existing 1000-listing cap remains; a successful source check
does not mean every global vacancy has been collected.
