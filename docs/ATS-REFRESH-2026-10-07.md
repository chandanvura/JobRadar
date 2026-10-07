# Refreshed unresolved employer investigation — 7 October 2026

Production verification completed at 18:49 UTC after [PR #16](https://github.com/chandanvura/JobRadar/pull/16) merged. The fresh baseline at 18:46 UTC was **700 companies, 200 Limited sources and 2 errors**. Actual after-counts are **700 companies, 197 Limited sources and 1 error**. Bayer, Aon and DocuSign are now verified India feeds; Adidas’s existing feed is reverified and its error cleared. HubSpot remains the active error. These are measured portal coverage counts, not a claim that every other source has globally complete details. Raw verification metadata is in [production verification metadata](evidence/production-verification-2026-10-07.json).

Four batches of 50 were captured by standard Python HTTP in [Actions](https://github.com/chandanvura/JobRadar/actions/runs/37611530978). The evidence JSON records response status, final URLs and hashes. Discovery alone does not establish employer identity or feed completeness.

Earlier candidate probe [37612603447](https://github.com/chandanvura/JobRadar/actions/runs/37612603447) collected Planful 12/12 unique IDs/details and Bayer 32/32 India IDs/details, with no missing descriptions. At that stage Bayer was only a candidate, and Aon/DocuSign failed country validation. Later probes repaired the country check and all three passed production verification. Planful remains a candidate; Darwinbox and Orange Health returned 403; HubSpot returned GraphQL errors rather than a valid empty job list.

The merged registry changes replace custom sources for Bayer, Aon and DocuSign with currently published India feeds. Exact old/new rows are in [exact before/after CSV rows](evidence/verified-registry-changes-2026-10-07.json). Focused collection and production verification are release requirements; no mapping is promoted merely because a probe workflow exited successfully.

| Case | Verified Actions inventory | Scope | Current outcome |
|---|---:|---|---|
| Bayer | 33 IDs / 33 full details | India | Verified in production; score 15/15 |
| Aon | 23 IDs / 23 full details | India | Verified in production; score 15/15 |
| DocuSign | 30 IDs / 30 full details | India | Verified in production; score 15/15 |
| Adidas | 1,182 IDs / 1,182 full descriptions | Entire published XML, reconciled with every live JSON page | Verified again in production |
| Vodafone | Previously 360 IDs/details; latest repeat failed on a disappeared detail | India | Remains unresolved; registry unchanged |
| Planful | 12 listed IDs/full descriptions | Entire Greenhouse listing | Candidate; no registry change |
| HubSpot | Official GraphQL returns upstream 404 | Current published official API | Remains unresolved |

Actions [37667272654](https://github.com/chandanvura/JobRadar/actions/runs/37667272654) intentionally failed its release gate when Vodafone became incomplete. This prevented an unverified mapping from being published. The final [release gate](https://github.com/chandanvura/JobRadar/actions/runs/37669052891) passed for Bayer, Aon, DocuSign and Adidas, including freshly followed official homepage-to-board chains. The corrected link parser recognizes embedded CMS navigation JSON and prioritizes published board links. Unverified Workday behavior changes are excluded from the release; Maersk global detail completeness remains an investigation item.

At 18:28 UTC the application root and dashboard returned HTTP 200. The health endpoint returned HTTP 503 with database and ingestion configured, a fresh latest run, and status `degraded`: 698 successful companies and 2 failed. A green scheduled workflow does not mean all feeds succeeded. The public jobs API also returned two valid HTTP 200 pages of 100 jobs each with a working cursor and no overlapping IDs.

To repeat the approved HTTP probes, open [Refreshed source error probes](https://github.com/chandanvura/JobRadar/actions/workflows/refreshed-repairs.yml) and run the workflow on `main`. It executes [the Python probe](../scripts/refreshed_candidates.py) on GitHub Actions and uploads the raw HTML/API evidence. Do not run employer collection locally.

Validation: 309 mocked Python tests and Bandit pass locally. Python/web CI, the complete HTTP release gate, registry synchronization and focused Adidas production verification all passed. Employer probes execute on GitHub Actions only. Missing posting fields remain unknown, and source-native multiple locations are preserved.

[Registry production sync](https://github.com/chandanvura/JobRadar/actions/runs/37669428907) independently collected and verified all three changed mappings in the live dashboard. [Focused Adidas verification](https://github.com/chandanvura/JobRadar/actions/runs/37669428801) independently reconciled 1,182 records and verified the live source update. [Main CI](https://github.com/chandanvura/JobRadar/actions/runs/37669428905) passed. Each newly recovered source scores 1 + 2 + 3 + 4 + 5 = **15** for official chain, employer identity, repeatable HTTP, complete scoped pagination/details, and CI plus production verification.

At 18:49 UTC the health endpoint still returned HTTP 503, `stale=false`, database/ingestion configured. It reads the latest full scan (14:10 UTC, 698 successes / 2 failures); focused repairs correctly preserve that historical scan record. Current company statuses contain one active error: HubSpot. The application remains reachable, but full feed health is still degraded. All three recovered feeds currently have zero eligible roles; that is a valid complete collection, not a fabricated empty source.

| Company | Batch | Captured pages | Discovery result |
|---|---:|---:|---|
| Hasura | 1 | 16 (16 HTTP 200) | Unverified |
| Chargebee | 1 | 18 (18 HTTP 200) | Unverified |
| Rippling | 1 | 16 (16 HTTP 200) | Unverified |
| CyberArk | 1 | 18 (17 HTTP 200) | Unverified |
| DataStax | 1 | 17 (17 HTTP 200) | Unverified |
| Dynatrace | 1 | 6 (6 HTTP 200) | Unverified |
| Exotel | 1 | 15 (15 HTTP 200) | Unverified |
| Klarna | 1 | 1 (0 HTTP 200) | Unverified |
| Planful | 1 | 15 (15 HTTP 200) | Unverified |
| Vimeo | 1 | 17 (17 HTTP 200) | Unverified |
| Zoom | 1 | 2 (1 HTTP 200) | Unverified |
| Guidewire | 1 | 12 (12 HTTP 200) | Unverified |
| Bayer | 1 | 18 (18 HTTP 200) | Verified production (India) |
| FedEx | 1 | 13 (13 HTTP 200) | Unverified |
| Aon | 1 | 12 (12 HTTP 200) | Verified production (India) |
| DocuSign | 1 | 21 (21 HTTP 200) | Verified production (India) |
| Cornerstone OnDemand | 1 | 17 (17 HTTP 200) | Unverified |
| Jupiter | 1 | 5 (5 HTTP 200) | Unverified |
| Darwinbox | 1 | 18 (18 HTTP 200) | Unverified |
| Keka | 1 | 1 (0 HTTP 200) | Unverified |
| Kissflow | 1 | 16 (16 HTTP 200) | Unverified |
| Orange Health Labs | 1 | 18 (18 HTTP 200) | Unverified |
| Perfios | 1 | 19 (19 HTTP 200) | Unverified |
| Tredence | 1 | 9 (6 HTTP 200) | Unverified |
| Unacademy | 1 | 18 (18 HTTP 200) | Unverified |
| Tata 1mg | 1 | 8 (8 HTTP 200) | Unverified |
| BigBasket | 1 | 4 (4 HTTP 200) | Unverified |
| Clear | 1 | 3 (3 HTTP 200) | Unverified |
| CarDekho | 1 | 4 (4 HTTP 200) | Unverified |
| Seclore | 1 | 1 (1 HTTP 200) | Unverified |
| WebEngage | 1 | 1 (0 HTTP 200) | Unverified |
| Yellow.ai | 1 | 1 (0 HTTP 200) | Unverified |
| Yulu | 1 | 7 (7 HTTP 200) | Unverified |
| Zetwerk | 1 | 8 (8 HTTP 200) | Unverified |
| Navi | 1 | 1 (0 HTTP 200) | Unverified |
| OfBusiness | 1 | 11 (10 HTTP 200) | Unverified |
| Moneyview | 1 | 18 (18 HTTP 200) | Unverified |
| LambdaTest | 1 | 17 (17 HTTP 200) | Unverified |
| M2P Fintech | 1 | 18 (18 HTTP 200) | Unverified |
| Khatabook | 1 | 7 (7 HTTP 200) | Unverified |
| Decentro | 1 | 18 (17 HTTP 200) | Unverified |
| Peoplebox.ai | 1 | 13 (13 HTTP 200) | Unverified |
| Sarla Aviation | 1 | 16 (16 HTTP 200) | Unverified |
| Ivy Homes | 1 | 17 (17 HTTP 200) | Unverified |
| Avaamo | 1 | 17 (17 HTTP 200) | Unverified |
| Dhruva Space | 1 | 9 (9 HTTP 200) | Unverified |
| Rebel Foods | 1 | 6 (6 HTTP 200) | Unverified |
| SALT | 1 | 14 (14 HTTP 200) | Unverified |
| xPay | 1 | 17 (17 HTTP 200) | Unverified |
| Antropi Robotics | 1 | 11 (11 HTTP 200) | Unverified |
| ADP | 2 | 1 (0 HTTP 200) | Unverified |
| ASML | 2 | 15 (15 HTTP 200) | Unverified |
| ASUS | 2 | 12 (12 HTTP 200) | Unverified |
| Acer | 2 | 1 (0 HTTP 200) | Unverified |
| Ajio | 2 | 1 (1 HTTP 200) | Unverified |
| Angel One | 2 | 17 (17 HTTP 200) | Unverified |
| Ansys | 2 | 1 (0 HTTP 200) | Unverified |
| Apollo | 2 | 3 (3 HTTP 200) | Unverified |
| Apollo Hospitals | 2 | 1 (0 HTTP 200) | Unverified |
| Apple | 2 | 9 (9 HTTP 200) | Unverified |
| Ather Energy | 2 | 1 (0 HTTP 200) | Unverified |
| Atlassian | 2 | 6 (6 HTTP 200) | Unverified |
| BD | 2 | 1 (0 HTTP 200) | Unverified |
| BNP Paribas | 2 | 19 (19 HTTP 200) | Unverified |
| BP | 2 | 1 (0 HTTP 200) | Unverified |
| Bain & Company | 2 | 4 (4 HTTP 200) | Unverified |
| Best Buy | 2 | 12 (12 HTTP 200) | Unverified |
| Blackhawk Network | 2 | 1 (0 HTTP 200) | Unverified |
| Bounce | 2 | 1 (0 HTTP 200) | Unverified |
| CBRE | 2 | 1 (0 HTTP 200) | Unverified |
| CGI | 2 | 2 (2 HTTP 200) | Unverified |
| CVS Health | 2 | 6 (6 HTTP 200) | Unverified |
| Cargill | 2 | 16 (15 HTTP 200) | Unverified |
| Cars24 | 2 | 14 (14 HTTP 200) | Unverified |
| Caterpillar | 2 | 1 (0 HTTP 200) | Unverified |
| Citrix | 2 | 1 (0 HTTP 200) | Unverified |
| Cleartrip | 2 | 1 (0 HTTP 200) | Unverified |
| Coforge | 2 | 7 (7 HTTP 200) | Unverified |
| Cognizant | 2 | 1 (0 HTTP 200) | Unverified |
| CoinDCX | 2 | 1 (0 HTTP 200) | Unverified |
| Collins Aerospace | 2 | 18 (16 HTTP 200) | Unverified |
| ColorTokens | 2 | 1 (0 HTTP 200) | Unverified |
| Costco | 2 | 15 (15 HTTP 200) | Unverified |
| Credit Agricole | 2 | 6 (6 HTTP 200) | Unverified |
| Dassault Systemes | 2 | 18 (18 HTTP 200) | Unverified |
| Delta Air Lines | 2 | 1 (0 HTTP 200) | Unverified |
| Deutsche Bank | 2 | 11 (11 HTTP 200) | Unverified |
| Deutsche Boerse Group | 2 | 12 (12 HTTP 200) | Unverified |
| Deutsche Telekom | 2 | 9 (9 HTTP 200) | Unverified |
| Discover | 2 | 1 (0 HTTP 200) | Unverified |
| Dream Sports | 2 | 13 (13 HTTP 200) | Unverified |
| E2open | 2 | 7 (7 HTTP 200) | Unverified |
| EPAM | 2 | 1 (0 HTTP 200) | Unverified |
| Emirates Group | 2 | 14 (14 HTTP 200) | Unverified |
| Flipkart | 2 | 3 (3 HTTP 200) | Unverified |
| Flux Auto | 2 | 3 (3 HTTP 200) | Unverified |
| Fujitsu | 2 | 1 (0 HTTP 200) | Unverified |
| Games24x7 | 2 | 1 (0 HTTP 200) | Unverified |
| Globant | 2 | 17 (17 HTTP 200) | Unverified |
| Google | 2 | 4 (4 HTTP 200) | Unverified |
| Grant Thornton | 3 | 15 (15 HTTP 200) | Unverified |
| HARMAN | 3 | 1 (0 HTTP 200) | Unverified |
| HSBC | 3 | 5 (5 HTTP 200) | Unverified |
| Happiest Minds | 3 | 18 (18 HTTP 200) | Unverified |
| HashiCorp | 3 | 1 (0 HTTP 200) | Unverified |
| Highspot | 3 | 1 (0 HTTP 200) | Unverified |
| IBM | 3 | 17 (17 HTTP 200) | Unverified |
| Informatica | 3 | 17 (17 HTTP 200) | Unverified |
| Ivanti | 3 | 1 (0 HTTP 200) | Unverified |
| Jumbotail | 3 | 5 (5 HTTP 200) | Unverified |
| KreditBee | 3 | 17 (17 HTTP 200) | Unverified |
| L&T Technology Services | 3 | 9 (9 HTTP 200) | Unverified |
| LTIMindtree | 3 | 1 (0 HTTP 200) | Unverified |
| Larsen & Toubro | 3 | 12 (12 HTTP 200) | Unverified |
| LatentView Analytics | 3 | 1 (0 HTTP 200) | Unverified |
| LeadSquared | 3 | 1 (0 HTTP 200) | Unverified |
| Licious | 3 | 11 (11 HTTP 200) | Unverified |
| Lingaro | 3 | 4 (4 HTTP 200) | Unverified |
| Lululemon | 3 | 16 (16 HTTP 200) | Unverified |
| MakeMyTrip | 3 | 3 (3 HTTP 200) | Unverified |
| Manhattan Associates | 3 | 1 (0 HTTP 200) | Unverified |
| MathWorks | 3 | 18 (18 HTTP 200) | Unverified |
| McDonald's | 3 | 15 (15 HTTP 200) | Unverified |
| McKinsey & Company | 3 | 16 (16 HTTP 200) | Unverified |
| MediBuddy | 3 | 1 (0 HTTP 200) | Unverified |
| MediaTek | 3 | 1 (0 HTTP 200) | Unverified |
| Mercedes-Benz Research and Development India | 3 | 2 (2 HTTP 200) | Unverified |
| Meta | 3 | 10 (10 HTTP 200) | Unverified |
| Mitsubishi Electric | 3 | 11 (11 HTTP 200) | Unverified |
| Mobile Premier League | 3 | 1 (0 HTTP 200) | Unverified |
| Mondelez International | 3 | 8 (8 HTTP 200) | Unverified |
| Mphasis | 3 | 10 (10 HTTP 200) | Unverified |
| Mu Sigma | 3 | 13 (13 HTTP 200) | Unverified |
| Myntra | 3 | 1 (1 HTTP 200) | Unverified |
| NEC | 3 | 1 (0 HTTP 200) | Unverified |
| NTT DATA | 3 | 17 (17 HTTP 200) | Unverified |
| Namma Yatri | 3 | 1 (0 HTTP 200) | Unverified |
| NatWest Group | 3 | 1 (0 HTTP 200) | Unverified |
| NoBroker | 3 | 8 (8 HTTP 200) | Unverified |
| OCBC | 3 | 6 (5 HTTP 200) | Unverified |
| Ola | 3 | 1 (0 HTTP 200) | Unverified |
| Ola Electric | 3 | 17 (17 HTTP 200) | Unverified |
| Open Financial Technologies | 3 | 1 (0 HTTP 200) | Unverified |
| Panasonic | 3 | 14 (14 HTTP 200) | Unverified |
| Pegasystems | 3 | 5 (5 HTTP 200) | Unverified |
| Persistent Systems | 3 | 8 (8 HTTP 200) | Unverified |
| PharmEasy | 3 | 5 (5 HTTP 200) | Unverified |
| Pine Labs | 3 | 17 (17 HTTP 200) | Unverified |
| Portea | 3 | 4 (4 HTTP 200) | Unverified |
| Porter | 3 | 1 (0 HTTP 200) | Unverified |
| Practo | 4 | 2 (2 HTTP 200) | Unverified |
| Providence India | 4 | 1 (0 HTTP 200) | Unverified |
| Ralph Lauren | 4 | 1 (0 HTTP 200) | Unverified |
| Rapido | 4 | 9 (9 HTTP 200) | Unverified |
| Regeneron | 4 | 1 (0 HTTP 200) | Unverified |
| Reliance Jio | 4 | 15 (14 HTTP 200) | Unverified |
| Revolut | 4 | 1 (0 HTTP 200) | Unverified |
| Rupeek | 4 | 19 (17 HTTP 200) | Unverified |
| SAS | 4 | 19 (19 HTTP 200) | Unverified |
| SLB | 4 | 14 (14 HTTP 200) | Unverified |
| SMBC | 4 | 1 (0 HTTP 200) | Unverified |
| Safe Security | 4 | 1 (0 HTTP 200) | Unverified |
| Scaler | 4 | 17 (17 HTTP 200) | Unverified |
| Schneider Electric | 4 | 1 (0 HTTP 200) | Unverified |
| Shiprocket | 4 | 1 (0 HTTP 200) | Unverified |
| Siemens | 4 | 13 (13 HTTP 200) | Unverified |
| Simplilearn | 4 | 17 (17 HTTP 200) | Unverified |
| Skyroot Aerospace | 4 | 1 (0 HTTP 200) | Unverified |
| Societe Generale | 4 | 19 (19 HTTP 200) | Unverified |
| Sonata Software | 4 | 17 (17 HTTP 200) | Unverified |
| Sony | 4 | 4 (4 HTTP 200) | Unverified |
| Splunk | 4 | 5 (5 HTTP 200) | Unverified |
| Syneos Health | 4 | 1 (0 HTTP 200) | Unverified |
| TCS | 4 | 18 (18 HTTP 200) | Unverified |
| Tata Digital | 4 | 8 (8 HTTP 200) | Unverified |
| Tata Elxsi | 4 | 7 (7 HTTP 200) | Unverified |
| Tata Technologies | 4 | 1 (0 HTTP 200) | Unverified |
| Tech Mahindra | 4 | 17 (15 HTTP 200) | Unverified |
| Teradata | 4 | 18 (18 HTTP 200) | Unverified |
| Tesco Bengaluru | 4 | 18 (18 HTTP 200) | Unverified |
| Tilt | 4 | 3 (3 HTTP 200) | Unverified |
| Toshiba | 4 | 14 (14 HTTP 200) | Unverified |
| Traveloka | 4 | 18 (18 HTTP 200) | Unverified |
| UBS | 4 | 16 (16 HTTP 200) | Unverified |
| UST | 4 | 1 (0 HTTP 200) | Unverified |
| Udaan | 4 | 1 (0 HTTP 200) | Unverified |
| Upstox | 4 | 17 (17 HTTP 200) | Unverified |
| Urban Company | 4 | 5 (4 HTTP 200) | Unverified |
| Vedantu | 4 | 6 (6 HTTP 200) | Unverified |
| Victoria's Secret | 4 | 19 (18 HTTP 200) | Unverified |
| Vodafone | 4 | 19 (19 HTTP 200) | Unverified |
| WTW | 4 | 19 (19 HTTP 200) | Unverified |
| Walmart Global Tech | 4 | 12 (12 HTTP 200) | Unverified |
| Wayfair | 4 | 1 (0 HTTP 200) | Unverified |
| Yubi | 4 | 1 (0 HTTP 200) | Unverified |
| Zepto | 4 | 1 (0 HTTP 200) | Unverified |
| Zerodha | 4 | 4 (4 HTTP 200) | Unverified |
| Zoho | 4 | 18 (18 HTTP 200) | Unverified |
| Zomato | 4 | 3 (3 HTTP 200) | Unverified |
| upGrad | 4 | 17 (16 HTTP 200) | Unverified |
