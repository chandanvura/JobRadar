# Six-step reliability release — 20 October 2026

## Justification, evidence and verification

1. **Source recovery.** Full live adapter probes passed for Airbus (192 unique jobs), Eaton (177 raw / 84 relevant unique jobs), and Adidas (1,174 unique jobs). Existing strict completeness checks remain enabled. The registry publication must independently recheck these sources before changing live health. HubSpot's registered Greenhouse endpoint returns 404. Its official careers page supplies no usable published replacement feed. Keep HubSpot failed; do not infer success from an empty page.
2. **Database reads.** Record D1 metadata for dashboard, jobs, health and ingest requests. Report reads per scan upload, and distinguish missing counters from zero. Cache hits report zero D1 reads. Replace repeated company lookups with one bulk lookup while preserving aliases and no-op writes. The compiled Worker regression measured 62,750 reads before and 1,753 after for 250 unchanged source updates (97.2% reduction). This is a local D1 measurement, not a production quota guarantee.
3. **Experience evidence.** Preserve full extracted JD sentences and section names. Explain the decision and show all experience statements. Flag incompatible explicit overall/total experience requirements without confusing a specialized skill minimum with overall experience. Unknown, contradictory and truncated evidence cannot become an automatic shortlist.
4. **Relevant expansion.** Add Schrödinger only after reconciling its official careers entry and ATS job ID. Its board returned 33 complete unique jobs. The Hyderabad infrastructure opening states 1–3 years and remains open; its 16 March posting date is old and must not qualify for the 24-hour shortlist. Evidence is in `docs/evidence/verified-target-source-2026-10-20.json`. Unverified or irrelevant candidate sources were not added.
5. **Release gates.** Automated tests cover delayed catalogue requests, a usable initial preview, bounded concurrency, large catalogues, failed/hung requests, preference edits, application-history persistence, and mobile drawer focus/scroll behavior. The mobile checks emulate layout logic; they do not replace physical-device testing. Existing CI runs these gates before deployment.
6. **Feedback.** Train role and skill signals separately, respect the latest correction per job, and cap the combined ranking change at ±5. Require balanced minimum evidence before learning. Feedback never changes the hard location, JD experience or verified posting-date rules. Skill-only mismatches must not penalize an entire role family.

## Validation

- Python: 705 passing tests.
- Web product: 216 passing tests.
- UI type checking and lint pass.
- Production build and compiled Worker integration include a database-read regression budget.
- Application history remains in its existing local store; no destructive data migration is introduced.

Production publication and live verification are separate release steps. Feed probe success alone does not clear live source failures.
