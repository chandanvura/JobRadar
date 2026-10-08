# Research handoff verification on 8 October 2026

The user-supplied source-discovery report contains all 196 distinct limited companies with no missing or extra names. Its reported counts are 116 official boards, 36 partial, 41 blocked and 3 unresolved, with zero complete HTTP feeds. These are research claims, not production coverage. The structured [proposal queue](evidence/research-handoff-proposals-2026-10-08.json) retains every company and the input SHA-256; original cross-conversation citation IDs are not independently accessible here.

Initial production baseline is 700 companies, 196 limited sources and 1 error. The first engineering batch contains eight employers. Current public HTML and its published scripts were collected only on GitHub Actions, without ingestion credentials or production writes.

| Employer | Actions finding | Engineering decision |
|---|---|---|
| Clear | Official career page links to the branded Darwinbox board; HTTP 200 returns metadata only | Unresolved; no guessed API |
| Moneyview | Official career page links to Moneyview Darwinbox; HTTP 200 returns metadata only | Unresolved; no empty-feed claim |
| Perfios | Official career page links to Perfios Darwinbox; HTTP 200 returns metadata only | Unresolved |
| Orange Health Labs | Official jobs page publishes the exact Darwinbox allJobs link; HTTP 200 returns metadata only | Unresolved |
| Jupiter | Employer publishes Keka; wrapper publishes career document, tenant and widget. Five unique listings and all five full detail descriptions reconcile | New bounded Keka adapter; requires final Actions and focused production verification |
| Open Financial Technologies | Published Keka widget returns one complete listing/detail; employer site returns HTTP 403 on Actions | Retain unresolved mapping; employer link chain not independently reproduced on Actions |
| CGI | Career redirect reaches a public challenge page | Retain unresolved source; no safeguard bypass |
| Delta Air Lines | Avature career endpoint returns HTTP 202 without captured inventory | Retain unresolved source; HTTP 202 is not an empty feed |

[Initial capture](https://github.com/chandanvura/JobRadar/actions/runs/37766761903), [published portal-document capture](https://github.com/chandanvura/JobRadar/actions/runs/37767014406) and [listing/detail capture](https://github.com/chandanvura/JobRadar/actions/runs/37767283438) preserve request provenance and hashes in Actions artifacts.

The Keka widget performs one unfiltered active-list request and applies filters to that array in the client. There is no separate advertised numeric total in the captured response. Completeness is established by the published whole-array consumer, unique IDs, every detail's ID/title/full-description match, and an unchanged final listing request. A separate API total is not invented. The adapter rejects changed tenants, removed employer links, malformed records, duplicate IDs, missing descriptions and wrong details. Unknown structured locations and dates remain unknown. A stable empty array is valid only after the same ownership/widget checks. The 500-record safety limit fails visibly rather than truncating.

Exact proposed registry change:

```csv
before: Jupiter,https://jupiter.money/careers/,custom,jupiter-money,5,true
after:  Jupiter,https://jupiter.money/careers/,keka,https://jupiter.keka.com/careers|b5279857-cf81-4dde-a215-fc48957ee2b5,5,true
```

No other company registry row changes. The focused production verification manifest selects only Jupiter. The full historical scan is not overwritten by a focused refresh.

Executable read-only probes on Actions:

```bash
python -m scripts.ats_deep --manifest companies/research-handoff-2026-10-08-01.json --output artifacts/research-handoff
python -m scripts.research_keka_probe
```

The second command also gates release through the actual configured Jupiter adapter. The eight-company discovery run passing only means captures finished; it does not mean all eight feeds are complete. Parent-company remaps elsewhere in the proposal queue remain unverified until brand/subsidiary scope is reconciled.
