# Official feed continuation, 8 October 2026

Fresh Actions baseline: 700 employers, 208 limited sources and one source error. This batch checks Upstox, Dynatrace, Jumbotail, Kissflow and Atlassian using standard public HTTP on GitHub Actions. No local employer collection or production writes were made during research.

| Employer | Current evidence | Decision |
|---|---|---|
| Kissflow | Official homepage publishes careers.kissflow.com; static Open Positions contains two unique roles; the published listing module only hides the list on detail pages and styles full descriptions. Both canonical detail identities, titles, locations, experience labels and complete requirements reconcile. Final list is unchanged. | Complete Actions release gate passed; production verification pending. |
| Upstox | Current employer careers script publishes service.upstox.com/content/open/v1/jobs/ and the exact Darwinbox detail URL. The response supplies 61 records, of which 23 have post_on_careers_page=1, matching the page's 23 openings. | Full requirements are absent from this response; do not substitute generated summaries or creation/update timestamps for requirements/publication dates. Registry unchanged. |
| Jumbotail | Official static careers list publishes 15 role cards. Five distinct engineering titles reuse the same Software Development Engineer detail URL. | Role identity and detail scope remain unresolved; do not collapse different titles to claim completeness. Registry unchanged. |
| Dynatrace | Official career host redirects to the current employer-domain careers area and links its jobs page. HTTP HTML contains dynamic zero placeholders. | A rendered zero is not an authoritative empty inventory. Current complete list endpoint remains unverified; registry unchanged. |
| Atlassian | Official homepage and careers area publish the current All Jobs page. Published script/assets captured. | Complete current list and details have not been reconciled in this batch; registry unchanged. |

Read-only release run: https://github.com/chandanvura/JobRadar/actions/runs/37797177914. Request URLs, HTTP statuses, response hashes and captured page provenance are in [the evidence file](evidence/ats-continue-2026-10-08.json). Raw HTTP responses are retained in its Actions artifact for seven days.

Kissflow's adapter preserves all actual locations and full requirements. Original publication dates are unknown and stay unknown. Neither role currently qualifies under the existing portal rules; complete source coverage and eligible-job counts are separate. There is no separate advertised numeric API total: the two static role cards are reconciled with two unique IDs and two full descriptions, without inventing pagination metadata. An absent/empty list, missing detail, unexpected pagination, removed employer link or changed dynamic consumer fails visibly.

Exact reviewed registry change:

```csv
before: Kissflow,https://careers.kissflow.com/,custom,kissflow,4,true
after:  Kissflow,https://careers.kissflow.com/,kissflow,kissflow,4,true
```

Validation: 380 Python regression/fault tests passed; Bandit and Python dependency audit passed. The release gate reads the actual complete feed through the production adapter. Run `python -m scripts.kissflow_probe` on GitHub Actions to repeat it. Existing registry synchronization will verify the one changed source after merge; focused historical scan health is preserved. No eligibility policy change or warning suppression is introduced.
