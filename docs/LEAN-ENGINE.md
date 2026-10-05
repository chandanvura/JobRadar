# Lean discovery and ranking

## Repository audit and decisions

| Feature | Decision | Reason |
| --- | --- | --- |
| React UI + Worker API + D1 | Keep | Already a single edge application; a Python server/PostgreSQL rewrite would add operations and cost. |
| Python source adapters | Keep | Existing bounded requests, source isolation, detail caches and fixture coverage. |
| Eight parallel scan shards | Keep for now | Stateless jobs, not persistent microservices. Removing them without timing the registry could break scan deadlines. |
| Quota guard, conditional upserts, public snapshot | Keep | Protect the free account and preserve browsing during database outages. |
| Existing title/experience/eligibility rules | Improve aliases | Preserve strict employer-date alert policy and current target cities. |
| Personal matching | Improve | Separate relevance from freshness and legacy global priority; exact normalized skill matching. |
| Feed sorting | Improve | Calculate each score once per data/preferences/tracking change; aggregate feedback once by category. |
| Feed duplicates | Improve | Presentation grouping preserves original database and tracking identities. |
| Navigation | Simplify | Six primary destinations; roles, career tools and operations expand on demand. |
| Resume and settings | Simplify | Load code on demand; retain private browser data and truthful tailoring. |
| ATS search shortcuts | Improve | Bounded OR queries for related titles; preserve specialized graduate/intern searches. |
| Redis/embeddings/new backend/extra database | Do not add | No measured need; no new runtime dependencies. |
| Adaptive source scheduling/ML/automatic resume generation | Defer | Require measured source yield and production data; avoid arbitrary polling changes and unused output. |

## Architecture and implementation

Retain scheduled Python adapters → ingestion coordinator → Worker/D1 → React feed.
Changes are confined to matching/feed/search helpers, the dashboard, normalization,
regression fixtures, deployment gates and this documentation. No schema migration,
new secrets, production SQL writes or source integrations are required.

### Match score

All components are 0–100:

- title fit: 25%; exact title, explicit family alias or exact token overlap;
- extracted skill coverage: 40%; normalized aliases with exact equality;
- experience range fit: 25%; ranges above preference and higher minimums lose
  points gradually; unknown requirements receive conservative credit;
- preferred location: 10%.

No freshness, source, alert eligibility or legacy `relevance_score` enters this
score. Preferences express a target experience range, not verified candidate
work history. Extracted skills are **not** presented as mandatory requirements.
Missing skills mean absent from the configured profile, not proven candidate gaps.
Unknown skill data receives neutral credit rather than perfect coverage.

### Opportunity priority

60% match + 25% freshness + 8% source quality + 4% record completeness +
3% application-link availability. Freshness decays as `exp(-age_hours / 24)`.
Unknown posting times use first-seen time at half strength; this is discovery
priority, never proof of posting time. Employer relative ages advance from the
last observation. Inactive records have zero base priority.

These are heuristic points, not probabilities of an interview. Provider values
prefer supported direct ATS sources; they do not verify that an arbitrary URL
belongs to an employer. Alert eligibility remains governed by existing server
rules and employer dates, independently of private browser ranking.

Saved/applied/interview/offer and ignored actions adjust category priority by
at most ±5 points. Rejections are excluded. Close priorities can interleave
companies and role families within a five-point window and 25-item chunks.
A low-relevance posting cannot jump over a large score gap for diversity.

### Deduplication

1. Employer + provider + external job ID.
2. Employer + canonical application URL (remove known trackers, preserve job IDs).
3. Cross-provider, identical company/title/location fingerprints with at least
   200 characters of JD and ≥0.95 token Jaccard similarity.

Same-provider distinct IDs stay separate unless their application URLs are
identical. Titles alone never prove duplicates. Fuzzy comparisons are restricted
to the last 25 fingerprint candidates, keeping work bounded; older candidates
may remain separate. Description-less public cards use exact stages only.
Every source record remains in memory; storage and notification identities are
unchanged. Saved and application views deliberately retain individual records.
Repost detection and destructive database merging are deferred until source
history can distinguish reposts from separate requisitions.

## Validation and security

Run `bash scripts/verify-harness.sh all` after installing locked dependencies.
Includes Python regression/fault injection, Bandit, pip audit, production npm
audit, build, Node tests, isolated compiled Worker/D1 migrations and API tests,
lint and UI types. The deployment workflow additionally verifies Python tests
and Bandit before publishing frontend/Worker changes.

New fixtures cover score/age independence, exact skill aliases, unknown age,
feedback bounds, canonical URLs retaining requisition parameters, tenant-local
IDs, distinct vacancies, cautious fuzzy grouping, company/role diversity and
100 synthetic rankings. The synthetic fixture is regression evidence, not
measured top-20 precision on manually labeled employer jobs.

No credentials, public contacts, paid services, LLM calls or production portal
requests were added. Canonicalization rejects executable and credential-bearing
URLs and is used for grouping only; original employer application links remain.
Existing sanitization, rate limits and quota protection are retained.

## Limits and next measurements

Browser visual QA and production deployment must be reported separately from
passing local tests. Existing collectors, credentials, schedules and employer
feed availability cannot be inferred from ranking tests. The old collector
priority/Telegram cutoff remains unchanged; new match/opportunity scores apply
to the personal feed. Supported locations remain Bengaluru and Hyderabad;
remote-India eligibility needs a separately tested source/filter policy change.

Measure real catalog ranking quality, duplicate recall, payload size and scan
duration before adding embedding infrastructure or changing shard counts.
A manually labeled 100-job employer set is still required for real precision
claims. No PostgreSQL, Docker stack or external service migration is warranted
for the current deployment.
