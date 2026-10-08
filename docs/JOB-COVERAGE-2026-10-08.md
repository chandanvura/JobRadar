# Role and search coverage verification — 8 October 2026

The old classifier rejected HPE `Cloud Developer` titles. The shared role taxonomy now drives Python collection/classification and browser role suggestions. It adds cloud development, programmer analysts, data/BI, network and systems, firmware, testing, and technical consulting vocabulary. Ambiguous generic titles require multiple technical signals from the description. Nontechnical titles, seniority, city, experience, and notification eligibility remain separate checks.

The dashboard now keeps active experience-matched leads visible regardless of posting age, including unknown requirements for review. Recommended and Ultra Fresh retain verified eligibility and freshness gates. Search uses weighted BM25 retrieval across title, employer, skills, location, category and description; terms can occur in different fields and any order. Aliases, bounded prefixes and one-edit corrections help common search variants. Quoted phrases retain order. Search relevance takes precedence while a query is present.

Workday uses employer-published Bengaluru/Bangalore and Hyderabad location facets where available and reads secondary detail locations. Capped or repeated pagination emits a Limited coverage warning and duplicate requisitions are removed. This does not establish complete coverage of every employer.

## Live read-only evidence

Run: https://github.com/chandanvura/JobRadar/actions/runs/37804469723

| Employer | Newly recognized technical titles | Recovered candidates with minimum experience ≤3 or unstated |
| --- | ---: | ---: |
| HPE | 84 | 26 |
| Microsoft | 40 | 5 |
| Cisco | 27 | 4 |
| Accenture | 185 | 35 |
| SAP | 14 | 3 |

The second column includes senior roles. The last column includes unknown experience and is a discovery measure, not confirmed application or alert eligibility. HPE's live assertion requires an actually recovered Cloud Developer title. IBM returned no listings in this audit; that is not proof that no jobs exist. Accenture remains incomplete: 1,000 of 2,000 advertised listings were collected, with the coverage warning preserved.

The four-hour recovery change is already in production. Recovery scan 37801306091 completed successfully. GitHub cron remains best effort; the watchdog and independent Cloudflare scheduler recover missed opportunities without promising an exact start time.

## Validation and cleanup

455 Python tests and 89 browser-product regression tests passed locally. The production build, compiled Worker/local D1 integration, lint, UI typecheck, production dependency audit and Python security scan passed. Remote validation and deployment are recorded by the release PR and Actions run.

22 dated research workflows move to `docs/archive/workflows/` with their original contents retained. Active production scanning, deployment, recovery, backups, maintenance and notifications remain in `.github/workflows/`.
