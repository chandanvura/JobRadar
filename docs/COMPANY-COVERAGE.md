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

The registry workflow verifies changed sources only (maximum 50), publishes
real company metrics and target-city candidate jobs, and shares the ordinary
scan lock. It does not create a misleading partial full-scan record or change
other companies' job activity. Failures keep previous metrics and show a pending
repair warning. Normal scans still reconcile job activity and notifications.

This improves collection without paid services. Remaining blocked, timed-out or
non-structured sources keep their official career links and Limited coverage
warnings. Workday's existing 1000-listing cap remains; a successful source check
does not mean every global vacancy has been collected.


## Alternative public feeds — 2026-10-05

Internet research and live employer endpoint checks identified 28 additional
repairs. Eleven use official RSS/XML job feeds: Wipro, EY, HCLTech, Alstom, ANZ,
BT Group, ExxonMobil, John Deere, American Airlines, Seagate Technology and ZF
Group. Seven use the public Oracle candidate-site interface: JPMorgan Chase,
Icertis, Texas Instruments, KPMG, Nokia, Cummins and Westpac. Ten use verified
Greenhouse, Workday or SmartRecruiters boards found on secondary employer pages:
Druva, Veeam, Western Digital, Fiserv, Blackbaud, GE HealthCare, Reltio, Roche,
SingleStore and o9 Solutions.

The XML collector reads descriptions and locations from the live employer feed,
then fetches cached detail pages only for relevant Bengaluru/Hyderabad roles.
Posting dates come from employer JSON-LD, schema.org microdata or explicitly
labelled posting-start dates. US and UK numeric date formats are interpreted
only with the page's locale. Expiration dates, posting-end dates and RSS refresh
dates cannot make an older role appear newly posted. Missing dates stay unknown.
Feed records that publish only a country cannot be assumed to be in either city.

Oracle lists are paginated in newest-posted order, capped at 1000 collected
listings per source, and include primary and secondary locations. Relevant jobs
receive full public descriptions, qualifications and employer posting timestamps
from the detail endpoint. Provider identifiers include the tenant hostname to
keep sites called CX_1 distinct. Malformed or repeated pages fail visibly. These
interfaces power public candidate sites but Oracle labels them internal-use;
this is a shape-checked public-site collector, not a supported integration API.

Source-update ingestion now batches candidate jobs in groups of 200. It retains
the shared scan lock and does not write a partial full-scan record. The bounded
focused refresh supports at most 50 changed sources. Job filters, employer-date
requirements and ordinary scheduled reconciliation remain in effect.

Evidence and exact employer endpoints:
[`alternative-feed-review-2026-10-05.json`](../companies/alternative-feed-review-2026-10-05.json).

Primary technical references:
- https://userapps.support.sap.com/sap/support/knowledge/E/2428902
- https://docs.oracle.com/en/cloud/saas/human-resources/farws/op-recruitingcejobrequisitions-get.html
- https://docs.oracle.com/en/cloud/saas/human-resources/farws/op-recruitingcejobrequisitiondetails-get.html

## Further source research — 2026-10-05

Fifteen more limited sources now use verified public employer links. SAP, Swiss
Re, Boston Scientific, Halliburton, Volvo Cars and Volvo Group expose XML feeds.
PhonePe uses SmartRecruiters; Tekion, Confluent and Atlan use Ashby; Meesho,
FamPay and Mindtickle use Lever. Whatfix's public Trakstar board publishes
JobPosting data; the JSON parser now tolerates literal line breaks in employer
strings while retaining data-only decoding.

Amazon has a dedicated public-search collector. It queries India separately for
Bengaluru and Hyderabad, paginates at 100 records, deduplicates jobs across city
queries and includes the employer's encoded secondary locations. Descriptions
include basic and preferred qualifications. Only `posted_date` determines the
posting day; `updated_time` is ignored. Malformed or repeated pages and searches
exceeding 2000 listings per city fail visibly. The endpoint is the public career
site's search interface, not a promised integration API.

Each new source still passes the existing city, role, experience and freshness
policies. HTTP success or a large listing count does not guarantee an eligible
internship or fresher role. Empty or inaccessible alternative boards are not
substituted merely to remove a warning. The existing 700-employer registry is
preserved. No paid APIs or browser infrastructure were added.

Exact links, live-probe evidence and excluded alternatives:
[`deep-source-review-2026-10-05.json`](../companies/deep-source-review-2026-10-05.json).

## Public career platforms — 2026-10-05

Another 49 employer sources passed real listing and relevant-detail checks:
20 Greenhouse boards, 20 Phenom career sites, three Workable boards, three
Workday boards and three employer XML feeds. The review includes ABB, OpenText,
Blue Yonder, RTX, GSK, Philips, BlackRock, Novartis, Innovaccer, Lokal, Tide
and Payoneer.

Phenom collection uses the same public search widget as each employer's career
site. It checks the employer identifier and keeps both search and detail URLs
on that official host. India country variants are queried with complete
pagination bounded at 2000 India records. Reported listing totals therefore
cover India, not the global board. Relevant details must match the listing and
include the full description. Private/internal records are excluded. Only an
employer posting date can establish freshness; creation, refresh and expiry
timestamps cannot.

Workable uses its public published-job interface, follows opaque pagination
tokens and reads full descriptions, requirements and benefits. Internal jobs
and hidden secondary locations are excluded. Original `published` timestamps
establish posting age. A repeated page, malformed response or exceeded bound
fails visibly. These public website interfaces are not promised integration APIs.

Pending source changes retain their existing Limited coverage warning until a
real successful collection verifies the repair. Failed checks cannot reduce the
warning count. DHL's intermittent errors, US-only alternatives, unverified
division attribution and incomplete Eightfold pagination remain unresolved.
No jobs, dates or coverage claims are generated to reach a numerical target.
Existing city, role, experience and freshness filters remain in effect.

Exact source links, collection results and excluded alternatives:
[`platform-source-review-2026-10-05.json`](../companies/platform-source-review-2026-10-05.json).

## Complete custom-source audit — 2026-10-05

All 370 remaining custom sources received an official-page probe, a public
Greenhouse board-identity probe and a public SmartRecruiters probe. Secondary
employer pages, public career scripts and alternative feeds were examined for
unresolved companies. A board name alone is insufficient: Slice's pizza company,
Thornbury Community Services, Porter Works, CLEAR and Superior Alarm Systems
are unrelated to the corresponding registry employers and were excluded.
Abandoned alternative boards are not substituted merely to lower warnings.

The current Eightfold PCSX career UI uses `/api/pcsx/search` and
`/api/pcsx/position_details`; its older public jobs interface rejects PCSX sites.
The collector verifies the public page's employer domain, paginates India search
results in timestamp order, validates position IDs and reads full descriptions
and all employer-published locations. Posting timestamps were corroborated
against public JobPosting dates. Creation timestamps never establish freshness.
Country-only Microsoft internships are not assumed to be in either target city.

TalentBrew collection follows official HTML pagination on the employer's host,
validates the organization ID and handles title links, duplicate View Role links
and sibling location elements. Relevant jobs receive full public JobPosting data
or an explicitly marked full employer description. Only employer posting dates
are used; missing dates remain unknown. India searches avoid the global Workday
cap where a complete country-filtered employer search is available. Both new
collectors fail visibly above 2000 collected search results or on repeated pages.

Sources can now report partial public detail coverage while retaining valid
collected jobs. Missing Phenom descriptions are skipped and keep a Limited
coverage warning. This allows NTT DATA's valid descriptions to be collected
without inventing the missing qualifications or hiding incomplete coverage.
Workday discovery also recognizes lowercase locale paths correctly.

Exact attempted sources, identity checks and verified collection results:
[`custom-source-audit-2026-10-05.json`](../companies/custom-source-audit-2026-10-05.json).

Two focused batches now replace 91 custom mappings with employer-attributed
feeds. The first 50 were verified in production, reducing Limited coverage from
291 to 266 with no failed updated sources. The second 41 include UKG, Ericsson,
American Express, Arista Networks, Airwallex, Verizon and Swiggy. Their exact
listings, relevant candidates and eligibility results are recorded in the audit.

MyNextHire reads the public requisition list used by Swiggy's career website and
its separate public posting-date history. Full descriptions are required. The
earliest publication is used when a requisition was republished; approval times
are never substituted. Public detail links match the site's navigation encoder.
Personal hiring-manager and applicant fields are neither collected nor published.

Workday sources can opt into employer-published country location facets through
`tenant|board|India`. This prevents Verizon's global 1000-record bound from
hiding its India listings. Only exact country suffixes match; Indiana is excluded.
All details in the bounded country set are read, including listings marked
only “2 Locations”. Their actual employer locations determine city eligibility.

NTT DATA remains explicitly partial because relevant descriptions are missing.
Millennium's new redirect requires another interface and is not remapped to a
nonworking Eightfold tenant. Shared-parent brands and stale boards remain
unresolved until a correctly attributed public feed is verified. The reduction
target is not met by hiding warnings, inventing vacancies or relaxing job filters.

## Verification retries and Ashby follow-up — 2026-10-05

The handoff was checked against the live portal: 700 enabled companies, 260
Limited coverage warnings, and a successful full scan with zero failed sources.
The latest registry-publishing and validation workflows both passed.

Registry synchronization now retries mappings whose previous focused collection
failed. Previously, saving the new URL/provider could make the next workflow
attempt skip collection and report success while the verification warning
remained. Pending warnings now keep those sources in the refresh queue, and
post-publication verification fails until real collection replaces the pending
warning. Ordinary limited coverage warnings do not cause repeated refreshes.
Previous metrics remain preserved on a failed refresh.

Redis and PostHog have verified public Ashby boards. Redis's official career page
contains a current Ashby job identifier; PostHog's official career page contains
current board titles and Ashby independently documents its PostHog integration.
Live adapter checks collected 32 and 8 published jobs respectively, with full
descriptions and employer posting dates. Neither check returned a role with a
published target-city location. Country-only and remote listings retain the
existing city policy.

Public references:
- https://redis.io/company/careers/
- https://jobs.ashbyhq.com/redis
- https://posthog.com/careers
- https://jobs.ashbyhq.com/posthog
- https://www.ashbyhq.com/customers/posthog-customer-story

Exact probe attempts, collection checks and excluded name collisions are recorded
in `companies/ashby-follow-up-2026-10-05.json`. Probing a board-name candidate is
only a discovery attempt, not evidence of employer identity or complete coverage.


### Public career widgets and Workday facets (2026-10-05)

The follow-up audit inspected all 258 remaining Limited coverage sources and their linked public career pages. Seventeen nonempty employer sources passed collection checks before registry updates: Juspay, Cashfree Payments, CleverTap, Slice, Growfin, Securonix, smallcase, MoEngage, Boehringer Ingelheim, Fractal Analytics, Microchip Technology, Fidelity Investments, Kenvue, Kimberly-Clark, Amagi, Checkout.com, and Mimecast. See `companies/career-widget-review-2026-10-05.json` for the audit and collection evidence. This is pre-publication evidence; registry sync must verify the production result.

New collectors read public Juspay Astro job data, Kula React Flight job data, BambooHR career listing/detail JSON, and PyjamaHR public career APIs. They validate source identity, reject private/confidential listings, and fail on incomplete listing counts. Parsers decode data without executing employer JavaScript. PyjamaHR record creation dates and RSS refresh dates are not substituted for publication dates.

Workday India filtering now recognizes nested country facets and exact employer country descriptors, retaining the existing location fallback. Fractal uses its bounded global feed because its public location facets do not expose India. MoEngage RSS city/state/country fields are retained and same-host HTTP job links are upgraded to HTTPS. Regional EU Lever hosts are supported, but retired or empty feeds are not mapped to clear warnings. Target city, experience, and publication-date eligibility rules remain unchanged.


### Follow-up verification (2026-10-06)

Zeta, ShareChat, Goldman Sachs, Nomura, Intuit, and Sanofi passed fresh checks against their public employer feeds. See `companies/follow-up-verification-2026-10-06.json` for listing counts and timestamps. Goldman Sachs returned one eligible role at verification time. Intuit and Sanofi use their public India TalentBrew pages, with full pagination and employer detail descriptions. This batch changes registry mappings only and requires successful production source verification. The resumed live dashboard reported 240 Limited coverage sources and separate Amgen/IKEA pagination failures; those failures remain visible pending repair.

TalentBrew now checks that the reported count stays stable across pages and equals the unique records collected. A changed count, repeated record, or temporarily omitted listing triggers one complete restart from page one. If the second scan remains incomplete, it still fails visibly. Wrong employer hosts, invalid source identity, and other validation errors are not retried. Regression tests cover restart, persistent failure, and count mismatch.

Fresh complete checks also passed for Amgen (636 listings) and IKEA (26 listings). Their registered first-page URLs now explicitly select page one, requiring a focused production refresh. IKEA previously served conflicting first/second-page totals of 28 and 26; refreshed pages consistently reported 26. Complete counts and employer identity remain enforced. These repairs address separate collection failures, not the Limited coverage target.


### Public XML follow-up and validation repair (2026-10-06)

Complete collection checks passed for Capgemini (6,363 public listings, 62 candidates) and Deloitte (1,667 listings, 61 candidates). These employer XML feeds include full job descriptions; missing posting dates require employer detail evidence and otherwise stay unknown. Other XML probes returned errors and were not mapped. IKEA's publicly indexed canonical India route also passed a complete 26-listing check, but production confirmation remains required. See `companies/public-xml-follow-up-2026-10-06.json`.

The web validation dependency audit found GHSA-68fv-2mgg-jv7q in source-map-js 1.2.1. The lockfile updates only this package to the patched 1.2.2 release. No forced dependency upgrades or disabled security gates are used.

For a retry on a simple India TalentBrew page, the collector can reproduce the employer UI's public "show all" request. It carries the checked India facet explicitly and validates the response employer, country facet, bounded count, and unique records. This avoids combining independently cached pages. Normal collection runs first; unsupported filters continue through ordinary pagination. Requests are based on the public TalentBrew `search.js` UI; no browser JavaScript is executed.


### Complete public Avature listings (2026-10-06)

The Avature collector passed complete checks for Lenovo (999 listings), MetLife (455), and Electronic Arts India (356). It validates exact result counts, reported page ranges, and unique IDs; follows only employer-hosted detail URLs; and uses bounded concurrency for offsets advertised by the public pagination links. It reads the full Description and Requirements section rather than listing previews, and only explicit location fields establish the city. Explicit employer posting labels or JobPosting dates are used; missing dates remain unknown. Capped 999+ result sets, incomplete pages, wrong hosts, and missing full descriptions fail visibly. See `companies/avature-review-2026-10-06.json` for successful checks and the remaining unsuccessful public probes.

### CloudBees public board verification (2026-10-06)

CloudBees’ current official careers page embeds a public Paylocity feed. Its 36 job identifiers exactly match the public board linked by every feed record. The collector reads the complete embedded list, rejects internal or duplicate identifiers and mismatched board data, and fetches full descriptions plus requirements for target roles. Public PublishedDate supplies posting dates; creation dates are ignored. Current India openings are in Chennai, yielding zero Bangalore/Hyderabad candidates without inventing locations. Evidence is in `companies/paylocity-review-2026-10-06.json`. Remaining metadata-only, capped, and unsupported legacy portals retain their warnings.

### Millennium legacy Eightfold verification (2026-10-06)

The older public Eightfold search endpoint is documented in the career portal’s published JavaScript. A collector now validates employer configuration, India filters, stable counts, page lengths, unique public IDs, full descriptions, and matching public JobPosting dates. Millennium returned all 34 India openings across four pages, with 14 complete target-related details, eight normalized candidates and no eligible fresh entry-level match. HSBC remains unresolved: its offsets advertise inconsistent totals of 152/153. Its separate public XML feed is recorded as a probe, not substituted for unverified technology coverage. Evidence: `companies/eightfold-legacy-review-2026-10-06.json`.

### Macquarie complete public board (2026-10-06)

The Avature collector now supports published `JobDetail?jobId=` links, explicit Office Location/Posted Date fields, and split responsibilities/requirements panels. Macquarie’s complete scan returned 593 openings and 13 normalized candidates, with no eligible fresh entry-level match. Offset pagination remains bounded, count-checked and duplicate-checked. Other XML/portal probes retain their warnings; evidence is in `companies/macquarie-review-2026-10-06.json`.

### Public PHB listings (2026-10-06)

Cognizant's public HTML board returned all 2,023 unique openings, 82 full potentially relevant descriptions with original published dates, and 25 normalized target-city candidates. None passed all current eligibility filters. Public page representation depends on request headers, and the employer can change the effective page size. The collector validates every reported page range, stable total and unique identifier, with one complete restart on inconsistent pagination. Persistent inconsistency still fails visibly. Regeneron remains unresolved because its pagination and detail template did not pass complete verification. Evidence: `companies/phb-review-2026-10-06.json`. Production verification returned HTTP 403 from the scheduled GitHub Actions runner on three bounded checks. The original custom mapping is restored, and the coverage warning remains. Local accessibility does not establish production coverage.
