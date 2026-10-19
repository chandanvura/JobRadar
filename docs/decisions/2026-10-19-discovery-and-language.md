# Company discovery and clear portal messages

## Decision method

The user identified JEV as a decision method, but did not supply its specific rules.
This change uses an explicit working interpretation: record a decision, its evidence,
and its verification. This is not a claim that an external JEV specification was used.

| Decision | Evidence | Verification |
| --- | --- | --- |
| Use a separate, read-only discovery job | Freehire is a best-effort external API. Its India results included US locations. | Request/run limits, no production credentials, offline fault tests, separate workflow. |
| Require an explicit target city | Country tags in the live sample were not sufficient. | Reject country-only records, including an Indianapolis/IN fixture. |
| Deduplicate board identity | HPE was returned under a different employer name. Oracle CX sites repeated an employer. | Alias and shared-board tests. |
| Keep candidates disabled | Aggregator names, dates, and URLs do not establish official employer ownership. | Output has disabled status and unverified employer dates. No registry writes. |
| Honor rate-limit delays | Salesforce returned HTTP 429. Existing whole-feed retries waited only one or two seconds. | Retry-After tests cover numeric/date values and a maximum cooldown budget. |
| Restart a shifted Workday snapshot once | Maersk repeated a record across otherwise valid pages. | Restart from offset zero. Keep within-page duplicates and malformed data as errors. |
| Simplify portal messages | ASD-STE100 Issue 9 recommends short, clear sentences and direct instructions. | Project checks enforce short sentences and no contractions in the edited message set. |
| Show employer HTML as plain text | The detail panel showed HTML tags. | Keep the original JD unchanged. Render readable text, without script execution. |

## Pilot limits

Four queries, 50 results each, once per day. A request has a 12-second limit.
The complete discovery run has a 55-second limit. A report contains at most
50 candidate boards and retains the other candidates in a deferred review list. Requests do not retry on
rate limits. The workflow has no production secrets or write permission.
Failed collection cannot replace an existing report. Successful artifacts remain
available for 14 days. A candidate must pass official employer identity, ATS,
location and feed checks before a separate registry change enables it.

The first offline review reused the two already-downloaded Java and DevOps samples.
It produced eight candidate boards. It did not add eight verified employers.
Unisys then passed an official-page-to-board check and a live collection check.
Its source was added through the existing registry. Seven remaining candidates are retained in `companies/discovery-pilot-2026-10-19.json`. They remain
unverified. The scheduled discovery run provides fresh review artifacts. It does not publish jobs.

## Scope and remaining limits

HubSpot's old Greenhouse feed returned 404. Its official page publishes a GraphQL
endpoint in its language asset. Do not enable a replacement until the public
listing and full descriptions reconcile. A read-only Jobs query to that published endpoint also returned an upstream 404 error. Salesforce can continue to rate-limit
requests. Retry changes do not guarantee provider availability. Existing source
warnings remain visible. Do not replace a failure with a false success status.

The edited portal messages apply STE writing principles. They do not implement
the entire controlled dictionary, and are not certified as ASD-STE100 compliant.
Employer descriptions and evidence quotations are not rewritten to STE.

## References

- ASD-STE100 Issue 9, 15 January 2025: https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf
- Official overview: https://www.asd-ste100.org/about_STE.html
- Reviewed upstream revision: https://github.com/MadsLorentzen/ai-job-search/tree/0f6480d32e59d7651d920a5ec6d78ede2f4113bf
- API contract: https://github.com/MadsLorentzen/ai-job-search/blob/0f6480d32e59d7651d920a5ec6d78ede2f4113bf/.agents/skills/freehire-search/url-reference.md

This implementation uses the documented API contract. It does not vendor the
upstream agent framework, CLI code, personal profile files, or model dependencies.
