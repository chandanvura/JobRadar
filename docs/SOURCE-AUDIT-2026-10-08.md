# Unresolved feed audit — 8 October 2026

Fresh baseline: **700 employers, 197 limited sources, 2 errors**. The 199 distinct unresolved sources were rechecked on Actions in disjoint batches of 50, 50, 50 and 49. No employer collection ran locally and the audit made zero production writes.

[Actions audit](https://github.com/chandanvura/JobRadar/actions/runs/37750193660) and [full evidence](evidence/unresolved-audit-2026-10-08.json). A source attempt passing does not prove employer identity or complete feed scope.

Three unused imports were removed after checking repository references. Duplicate custom-adapter delegation is now one helper, and automatically detected ATS boards retain a limited warning until identity and scope are verified. This prevents a detected link from silently clearing a coverage warning.

Cross-page overlaps in valid Avature pages now restart the entire snapshot at most once. Within-page duplicate IDs still fail immediately. A second inconsistent snapshot remains unresolved; no record is dropped to make counts match.

Detailed Actions probes independently reconciled Macquarie's 587 advertised listings and 22 target job details. HubSpot's exact currently published GraphQL Jobs query returns an upstream 404 error rather than a jobs array. Planful's official homepage-to-careers chain, published Greenhouse API tenant and board metadata identifying Planful were verified in Actions; all 12 IDs and full descriptions reconciled. The proposed mapping uses that evidence, not a guessed slug.

Exact registry change:

```csv
before: Planful,https://planful.com/jobs/careers-list/,custom,planful,4,true
after:  Planful,https://planful.com/jobs/careers-list/,greenhouse,hostanalytics,4,true
```

Macquarie's registry row is unchanged. The focused production verification selects only Macquarie Group and Planful. Full historical scan metrics are not replaced by this focused refresh. Limited counts may increase on subsequent full scans when the new identity/scope guard exposes previously unverified automatic board detections; those warnings must not be hidden.

To repeat on GitHub Actions, run `unresolved-audit.yml` on this revision. Each job executes:

```bash
python -m scripts.unresolved_audit --manifest companies/unresolved-audit-2026-10-08-01.json --output artifacts/unresolved-audit-01.json
```

| Company | Provider | Recheck outcome | Blocker or next check |
|---|---|---|---|
| Apple | custom | LIMITED | Limited coverage: no structured public job feed |
| Chargebee | custom | LIMITED | Limited coverage: no structured public job feed |
| Cognizant | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Atlassian | custom | LIMITED | Limited coverage: no structured public job feed |
| Flipkart | custom | LIMITED | Limited coverage: no structured public job feed |
| Google | custom | LIMITED | Limited coverage: no structured public job feed |
| Darwinbox | custom | LIMITED | Limited coverage: no structured public job feed |
| HashiCorp | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Hasura | custom | LIMITED | Limited coverage: no structured public job feed |
| IBM | custom | LIMITED | Limited coverage: no structured public job feed |
| Informatica | custom | LIMITED | Limited coverage: no structured public job feed |
| Jupiter | custom | LIMITED | Limited coverage: no structured public job feed |
| Mercedes-Benz Research and Development India | custom | LIMITED | Limited coverage: no structured public job feed |
| Meta | custom | LIMITED | Limited coverage: no structured public job feed |
| Myntra | custom | LIMITED | Limited coverage: no structured public job feed |
| Navi | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Open Financial Technologies | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Persistent Systems | custom | LIMITED | Limited coverage: no structured public job feed |
| Rippling | custom | LIMITED | Limited coverage: no structured public job feed |
| HSBC | custom | LIMITED | Limited coverage: no structured public job feed |
| Splunk | custom | LIMITED | Limited coverage: no structured public job feed |
| Upstox | custom | LIMITED | Limited coverage: no structured public job feed |
| TCS | custom | LIMITED | Limited coverage: no structured public job feed |
| Zerodha | custom | LIMITED | Limited coverage: no structured public job feed |
| ADP | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| ASML | custom | LIMITED | Limited coverage: no structured public job feed |
| Ajio | custom | LIMITED | Limited coverage: no structured public job feed |
| Angel One | custom | LIMITED | Limited coverage: no structured public job feed |
| Ansys | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Ather Energy | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Avaamo | custom | LIMITED | Limited coverage: no structured public job feed |
| BD | custom | LIMITED | Limited coverage: no structured public job feed |
| BNP Paribas | custom | LIMITED | Limited coverage: no structured public job feed |
| BP | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Bain & Company | custom | LIMITED | Limited coverage: no structured public job feed |
| Best Buy | custom | LIMITED | Limited coverage: no structured public job feed |
| BigBasket | custom | LIMITED | Limited coverage: no structured public job feed |
| Blackhawk Network | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| CBRE | custom | LIMITED | Limited coverage: no structured public job feed |
| CGI | custom | LIMITED | Limited coverage: no structured public job feed |
| CVS Health | custom | LIMITED | Limited coverage: no structured public job feed |
| CarDekho | custom | LIMITED | Limited coverage: no structured public job feed |
| Cargill | custom | LIMITED | Limited coverage: no structured public job feed |
| Cars24 | custom | LIMITED | Limited coverage: no structured public job feed |
| Caterpillar | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Citrix | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Cleartrip | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Coforge | custom | LIMITED | Limited coverage: no structured public job feed |
| CoinDCX | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Walmart Global Tech | custom | LIMITED | Limited coverage: no structured public job feed |
| ColorTokens | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Collins Aerospace | custom | LIMITED | Limited coverage: no structured public job feed |
| Costco | custom | LIMITED | Limited coverage: no structured public job feed |
| CyberArk | custom | LIMITED | Limited coverage: no structured public job feed |
| Cornerstone OnDemand | custom | LIMITED | Limited coverage: no structured public job feed |
| DataStax | custom | LIMITED | Limited coverage: no structured public job feed |
| Delta Air Lines | custom | LIMITED | Limited coverage: no structured public job feed |
| Deutsche Bank | custom | LIMITED | Limited coverage: no structured public job feed |
| Deutsche Boerse Group | custom | LIMITED | Limited coverage: no structured public job feed |
| Deutsche Telekom | custom | LIMITED | Limited coverage: no structured public job feed |
| Dhruva Space | custom | LIMITED | Limited coverage: no structured public job feed |
| Dassault Systemes | custom | LIMITED | Limited coverage: no structured public job feed |
| Dream Sports | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Discover | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| E2open | custom | LIMITED | Limited coverage: no structured public job feed |
| EPAM | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Exotel | custom | LIMITED | Limited coverage: no structured public job feed |
| Dynatrace | custom | LIMITED | Limited coverage: no structured public job feed |
| Fujitsu | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Games24x7 | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Globant | custom | LIMITED | Limited coverage: no structured public job feed |
| Guidewire | custom | LIMITED | Limited coverage: no structured public job feed |
| HARMAN | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Happiest Minds | custom | LIMITED | Limited coverage: no structured public job feed |
| HubSpot | greenhouse | SOURCE_ERROR | Client error '404 Not Found' for url 'https://boards-api.greenhouse.io/v1/boards/hubspotjobs/jobs?content=true' For more information check: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/404 |
| Highspot | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Ivanti | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Keka | custom | LIMITED | Limited coverage: no structured public job feed |
| Khatabook | custom | LIMITED | Limited coverage: no structured public job feed |
| Kissflow | custom | LIMITED | Limited coverage: no structured public job feed |
| Klarna | custom | LIMITED | Limited coverage: no structured public job feed |
| KreditBee | custom | LIMITED | Limited coverage: no structured public job feed |
| L&T Technology Services | custom | LIMITED | Limited coverage: no structured public job feed |
| LTIMindtree | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| LambdaTest | custom | LIMITED | Limited coverage: no structured public job feed |
| LatentView Analytics | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| LeadSquared | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Lingaro | lever | LIMITED | Limited coverage: 4 relevant Lever jobs lack full requirements |
| Licious | custom | LIMITED | Limited coverage: no structured public job feed |
| FedEx | custom | CANDIDATE_COMPLETE_IDENTITY_REVIEW_REQUIRED | No roles with a published target-city location returned |
| M2P Fintech | custom | LIMITED | Limited coverage: no structured public job feed |
| MakeMyTrip | custom | LIMITED | Limited coverage: no structured public job feed |
| Manhattan Associates | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Lululemon | custom | LIMITED | Limited coverage: no structured public job feed |
| McDonald's | custom | LIMITED | Limited coverage: no structured public job feed |
| McKinsey & Company | custom | LIMITED | Limited coverage: no structured public job feed |
| MathWorks | custom | LIMITED | Limited coverage: no structured public job feed |
| MediaTek | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| MediBuddy | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Macquarie Group | unknown | SOURCE_ERROR | Bounded source audit timed out |
| Mobile Premier League | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Moneyview | custom | LIMITED | Limited coverage: no structured public job feed |
| Mphasis | custom | LIMITED | Limited coverage: no structured public job feed |
| NEC | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Namma Yatri | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| NatWest Group | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| NoBroker | custom | LIMITED | Limited coverage: no structured public job feed |
| OfBusiness | custom | LIMITED | Limited coverage: no structured public job feed |
| Ola | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Ola Electric | custom | LIMITED | Limited coverage: no structured public job feed |
| Pegasystems | custom | LIMITED | Limited coverage: no structured public job feed |
| Perfios | custom | LIMITED | Limited coverage: no structured public job feed |
| PharmEasy | custom | LIMITED | Limited coverage: no structured public job feed |
| Mondelez International | custom | LIMITED | Limited coverage: no structured public job feed |
| Planful | custom | LIMITED | Limited coverage: no structured public job feed |
| Pine Labs | custom | LIMITED | Limited coverage: no structured public job feed |
| Porter | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Practo | custom | LIMITED | Limited coverage: no structured public job feed |
| Providence India | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Rapido | custom | LIMITED | Limited coverage: no structured public job feed |
| Rebel Foods | custom | LIMITED | Limited coverage: no structured public job feed |
| Regeneron | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Ralph Lauren | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Reliance Jio | custom | LIMITED | Limited coverage: no structured public job feed |
| Revolut | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Rupeek | custom | LIMITED | Limited coverage: no structured public job feed |
| SLB | custom | LIMITED | Limited coverage: no structured public job feed |
| Safe Security | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Scaler | custom | LIMITED | Limited coverage: no structured public job feed |
| Schneider Electric | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Seclore | custom | LIMITED | Limited coverage: no structured public job feed |
| Shiprocket | custom | LIMITED | Limited coverage: no structured public job feed |
| Siemens | custom | LIMITED | Limited coverage: no structured public job feed |
| Skyroot Aerospace | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Societe Generale | custom | LIMITED | Limited coverage: no structured public job feed |
| Sonata Software | custom | LIMITED | Limited coverage: no structured public job feed |
| Sony | custom | LIMITED | Limited coverage: no structured public job feed |
| Syneos Health | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Tata 1mg | custom | LIMITED | Limited coverage: no structured public job feed |
| Tata Digital | custom | LIMITED | Limited coverage: no structured public job feed |
| Tata Elxsi | custom | LIMITED | Limited coverage: no structured public job feed |
| Tata Technologies | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| SAS | custom | LIMITED | Limited coverage: no structured public job feed |
| Tech Mahindra | custom | LIMITED | Limited coverage: no structured public job feed |
| Teradata | custom | LIMITED | Limited coverage: no structured public job feed |
| Tredence | custom | LIMITED | Limited coverage: no structured public job feed |
| Tesco Bengaluru | custom | LIMITED | Limited coverage: no structured public job feed |
| UST | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| UBS | custom | LIMITED | Limited coverage: no structured public job feed |
| NTT DATA | phenom | LIMITED | Limited coverage: 2 relevant public job details lack an employer description |
| Unacademy | custom | LIMITED | Limited coverage: no structured public job feed |
| Urban Company | custom | LIMITED | Limited coverage: no structured public job feed |
| Victoria's Secret | custom | LIMITED | Limited coverage: no structured public job feed |
| Vimeo | custom | LIMITED | Limited coverage: no structured public job feed |
| Vodafone | custom | LIMITED | Limited coverage: no structured public job feed |
| WTW | custom | LIMITED | Limited coverage: no structured public job feed |
| Wayfair | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| WebEngage | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Yellow.ai | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Yubi | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Yulu | custom | LIMITED | Limited coverage: no structured public job feed |
| Zepto | custom | LIMITED | Limited coverage: no structured public job feed |
| Zetwerk | custom | LIMITED | Limited coverage: no structured public job feed |
| Zoho | custom | LIMITED | Limited coverage: no structured public job feed |
| Zomato | custom | LIMITED | Limited coverage: no structured public job feed |
| Zoom | custom | LIMITED | Limited coverage: no structured public job feed |
| ASUS | custom | LIMITED | Limited coverage: no structured public job feed |
| Acer | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Antropi Robotics | custom | LIMITED | Limited coverage: no structured public job feed |
| Apollo | custom | LIMITED | Limited coverage: no structured public job feed |
| Apollo Hospitals | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Bounce | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Clear | custom | LIMITED | Limited coverage: no structured public job feed |
| Credit Agricole | custom | LIMITED | Limited coverage: no structured public job feed |
| Decentro | custom | LIMITED | Limited coverage: no structured public job feed |
| Emirates Group | custom | LIMITED | Limited coverage: no structured public job feed |
| Flux Auto | custom | LIMITED | Limited coverage: no structured public job feed |
| Grant Thornton | custom | LIMITED | Limited coverage: no structured public job feed |
| Ivy Homes | custom | LIMITED | Limited coverage: no structured public job feed |
| Jumbotail | custom | LIMITED | Limited coverage: no structured public job feed |
| Larsen & Toubro | custom | LIMITED | Limited coverage: no structured public job feed |
| Mitsubishi Electric | custom | LIMITED | Limited coverage: no structured public job feed |
| Mu Sigma | custom | LIMITED | Limited coverage: no structured public job feed |
| OCBC | custom | LIMITED | Limited coverage: no structured public job feed |
| Orange Health Labs | custom | LIMITED | Limited coverage: no structured public job feed |
| Panasonic | custom | LIMITED | Limited coverage: no structured public job feed |
| Peoplebox.ai | custom | LIMITED | Limited coverage: no structured public job feed |
| Portea | custom | LIMITED | Limited coverage: no structured public job feed |
| SALT | custom | LIMITED | Limited coverage: no structured public job feed |
| SMBC | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
| Sarla Aviation | custom | LIMITED | Limited coverage: no structured public job feed |
| Simplilearn | custom | LIMITED | Limited coverage: no structured public job feed |
| Tilt | custom | LIMITED | Limited coverage: no structured public job feed |
| Toshiba | custom | LIMITED | Limited coverage: no structured public job feed |
| Traveloka | custom | LIMITED | Limited coverage: no structured public job feed |
| Vedantu | custom | LIMITED | Limited coverage: no structured public job feed |
| upGrad | custom | LIMITED | Limited coverage: no structured public job feed |
| xPay | custom | LIMITED | Limited coverage: no structured public job feed |
| Udaan | custom | LIMITED | Limited coverage: official career page blocks or does not expose machine-readable access |
