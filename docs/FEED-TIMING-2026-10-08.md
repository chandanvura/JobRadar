# Feed timing and failure audit — 2026-10-08

Refreshed production baseline at 11:49:46 UTC: 700 companies, 211 limited sources, three errors. The most recent full scan finished at 11:09:25 UTC; pipeline freshness was healthy but employer coverage remained degraded. Six full scans are scheduled daily at 00:07, 04:07, 08:07, 12:07, 16:07 and 20:07 UTC; GitHub can delay scheduled execution.

| Company / behavior | Observed cause | Repair / verification |
| --- | --- | --- |
| Lam Research | Full scan reported overlapping Eightfold page IDs. Read-only repeat on Actions returned 111 unique India listings, with the old adapter reading only 54 target-role details. | Separate malformed within-page duplicates from changing cross-page snapshots; restart the whole snapshot at most once. Pin advertised totals, reject early termination and overruns, reconcile every detail and external ID, and recheck the first page. Enable complete mode only for Lam Research. |
| Principal Financial Group | Full scan failed its first-page comparison. Captured repeat responses preserve all public job fields but change only importer meta_data, including last_mod serialization (seconds/+0000 versus milliseconds/+00:00). | Compare every public job field while excluding only unused importer meta_data. Retain count, ID, detail tenant, location, publicness and publication checks and bounded whole-source retry. |
| HubSpot | Registered Greenhouse endpoint still returns HTTP 404. | Remains visibly unresolved. No guessed replacement board. |
| Scheduled scan gate | A manual scan could suppress the next four-hour slot because the skip window was 210 minutes, allowing nearly eight hours between full scans. | Suppress only scans completed within 15 minutes; retain quota/health gates and existing overlap protection. No increase to the six scheduled daily slots. |
| Check timestamps | The company upsert compared only the date, leaving the first same-day check visible after later unchanged scans. | Refresh actual check and success timestamps each scan; preserve last success when a later check fails. Exact payload replays remain no-op updates. |

Diagnostic evidence: https://github.com/chandanvura/JobRadar/actions/runs/37773045940 (public HTTP only, no production writes).

Executable release probe: `python -m scripts.feed_timing_probe`, exclusively on GitHub Actions. It follows published first-party career links, captures actual board responses, verifies Lam and Principal complete totals/details, and records HubSpot's failure without pretending it is repaired. The release workflow stores the raw responses as an artifact.

Exact companies.csv change:

```diff
-Lam Research,https://lamresearch.eightfold.ai/careers,eightfold,lamresearch.eightfold.ai|lamresearch.com,4,true
+Lam Research,https://lamresearch.eightfold.ai/careers,eightfold_complete,lamresearch.eightfold.ai|lamresearch.com,4,true
```

Focused production selection: `Lam Research`, `Principal Financial Group`. The main workflow records actual before/after coverage and verifies ingestion against the live portal. Final production results and workflow links are recorded in the pull request after execution. A focused repair does not rewrite the historical full-scan health record.

Local verification: 349 Python regression/fault tests, Bandit, 80 web tests with production build, compiled Worker/local D1 integration including same-day checks and failed-check last-success preservation. CI additionally runs dependency audits, lint and UI types. Unknown dates and actual locations are preserved. Company timestamp refreshes add at most 4,200 company row updates for six scheduled scans of 700 employers; unchanged job bodies remain conditional updates.
