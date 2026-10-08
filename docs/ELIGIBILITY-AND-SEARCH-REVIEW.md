# Evidence-based discovery and application review

## Experience certainty

Associate, Junior, Trainee and level-I titles no longer manufacture a 0–3-year range. Without candidate experience evidence, numeric bounds remain null, the card says `Entry-level title — experience unverified`, and the job stays in Dashboard/Needs Review rather than Recommended. A data-only, idempotent migration corrects existing `Entry-level title` rows without deleting jobs or application history. Browser normalization protects older backups and saved records too. Explicit fresher wording establishes a zero-experience signal without inventing a one-year maximum. Preferred qualification sections do not override stated mandatory experience.

Recommended verifies the site's city, role, experience and freshness policy; it does not establish the user's personal education or complete employer eligibility. Unknown evidence stays visible for review.

## Employer and duplicate evidence

Juniper's custom discovery can follow the shared HPE Workday board. That publisher is HPE; the discovery entry is not proof that every requisition belongs to a Juniper hiring team. Collector enrichment corrects only the verified `hpe.wd5.myworkdayjobs.com/Jobsathpe/job/` alias. Legacy cards show HPE with a Juniper discovery-source explanation and a corrected board link. The actual hiring team remains a description review item.

Exact requisition URLs group across discovery labels while all source records and private tracking identities remain intact. Different requisition URLs remain separate. Generic application pages are not globally deduplicated. Source records remain separately accessible in Saved/Applications. Shared-board sources are not disabled, so subsidiary-specific discovery is preserved.

Official context: https://www.juniper.net/us/en/company/culture-careers.html and https://hpe.wd5.myworkdayjobs.com/jobsathpe/job/Bangalore-Karnataka-India/Senior-Systems-Software-Engineer-in-Routing-Infrastructure-Solutions_1202515-2 . The correction establishes board ownership, not a legal employer or subsidiary for every vacancy.

## Requirement details

A shared section vocabulary separates candidate qualifications/responsibilities from company biography, benefits and equal-opportunity text, including older descriptions collapsed to one line. Generic title classification requires candidate technical evidence, not just company technologies. Shared skill rules preserve aliases and cover backend/frontend and DevOps terminology.

Application details contain structured required skills, preferred skills, education/experience alternatives, graduation years and work arrangement, each with a source clause. Unclassified mentions are not promoted to mandatory requirements. Conflicting required/preferred wording is flagged. Work arrangement has Remote/Hybrid/Onsite/Unknown/Conflicting states and an explicit filter; default All arrangements retains unknown jobs.

These are bounded, conservative regex extractions, not semantic proof. Graduation years are *mentioned years*, not automatically an exclusive eligible batch. Degree alternatives remain in the evidence clause. Your degree and batch are not known or checked. No paid model or new D1 fields are needed; details are computed and cached in the browser. Required skills weigh more than preferred/mentioned skills in personal ranking, and unknown requirements do not create new hard filters.

Future scans retain up to 12,000 characters of description instead of 4,000; the protected API already accepts 20,000. Existing truncated descriptions may still lack the qualification section until refreshed.

## Reproducible real-listing evaluation

Run `node --experimental-strip-types web/scripts/evaluate-search.mjs` from the repository root. CI also exercises the annotated searches.

The fixture contains 27 purposively selected real records, including senior and high-experience distractors, from scan run https://github.com/chandanvura/JobRadar/actions/runs/37800389959 and the live HPE Cloud Developer verification in PR #29. Source URLs, requisition IDs, actual experience fields and <=24-word description excerpts are retained. The reviewer was Codex, using titles, city and experience to annotate Dashboard discovery relevance; this is not an independent human relevance study. 18 records remain after the Dashboard 0–3-year overlap/review policy.

Nine reviewed queries achieved macro returned-result precision at up to five, recall@5 and nDCG@5 of 1.0 in this small fixture. No annotated role was missed and no unannotated result appeared in those query results. This is a regression baseline, not a production-wide accuracy claim, a complete employer coverage claim, or a measured before/after uplift. Sparse title-oriented queries and short excerpts make this an easier set than the full catalogue; expand the set with real user failures and skills/requirements queries before drawing stronger conclusions.
