# Explicit India remote jobs

## Justification

The requested scope includes India remote jobs. The collector and public API
previously kept only Bengaluru and Hyderabad. A location of `Remote - India`
was excluded before the adapter fetched its posting details.

## Evidence

The location check and the API SQL had two-city allowlists. The new tests
reproduce this exclusion. Public source checks do not establish that any
specific remote vacancy is current or suitable.

## Change

Accept explicit adjacent `Remote` and `India` location labels. Preserve city
classification when an employer also names Bengaluru or Hyderabad. Exclude
generic remote, US remote, India without remote, and ambiguous regional labels.
Read and page the new location through the existing indexed API. Do not change
experience, role, date, notification, or application-history rules.

New search defaults include the location. Existing saved city choices stay the
same. The scope does not guarantee full remote coverage. Sources that query
only named cities, such as Amazon, still have that coverage limit.

The company comparison also resets input review status. An imported row cannot
self-approve by supplying `VERIFIED` in that column.

The production catalog returned a backup while the health read still worked.
The deploy workflow now checks all four actual dashboard database reads before
release. It prints only result counts and query metadata. A failed read stops
deployment, except for the existing daily-quota recovery path after schema
verification. This check makes a database fault visible without exposing job rows.

## Verification and rollback

Run the Python regression suite and the web harness. The compiled Worker test
must return India remote jobs on both catalog routes and exclude US remote
jobs. It must keep pagination complete across all three location groups.
The existing tests must preserve tracking and notification idempotency.

No database migration is required. Revert this change to restore the prior
scope. Do not delete jobs, tracking, or source records during rollback.
