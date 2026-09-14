# JobRadar personal workspaces

## Use the website

1. Open JobRadar and choose **Set up my search** or **Edit search**.
2. Choose titles, optional skills, experience and Bengaluru/Hyderabad.
3. Verify an opening on the official employer page, save it, then track applications.
4. Open **Settings → Create separate profile** for a separate workspace URL.
5. **Share search choices** shares only the chosen search settings. Each generated link starts a new profile; no application records or resume contents are shared.
6. Download a private backup before clearing browser data. Restore it on another device using Settings. Restoring replaces that profile's preferences and tracking.

Profiles are browser storage namespaces, not authenticated accounts. Another person on a different device cannot read your browser storage through a profile URL. People sharing the same browser account can access its local profiles. Use separate browser accounts for privacy. The default profile retains existing owner storage keys.

All people use the same public collected engineering job catalog in Bengaluru and Hyderabad. Search choices do not launch new scraper runs, change the owner's filters, or configure another Telegram recipient. Arbitrary roles/cities beyond the collected catalog are not supported. There is no cloud synchronization or per-user Telegram subscription in this release.

## Resume Studio

Use **Tailor resume** on a job or open **Resume Studio**. The employer description is loaded when available (ingestion currently retains up to 4,000 characters); check the original posting and paste the full JD when needed. Enter real experience, projects, education and skills.

Keyword review compares a fixed technical vocabulary. It is not an ATS score and cannot predict acceptance. **Prioritize existing bullets** reorders bullet lines inside each blank-line-separated paragraph using exact recognized keywords; it never generates achievements, skills or employment history. Review grouping and facts before applying.

- Print / Save PDF: browser-generated, single-column Jake-inspired layout. Disable print headers and footers and review pagination.
- Download Jake LaTeX: uses Jake Gutierrez's MIT-licensed template preamble. Compile locally or in a compatible LaTeX editor. The license is included in the export and in `web/public/templates/jake-LICENSE.txt`.
- Download text: readable text copy.

Resume inputs remain in browser storage, including the JD. No paid AI API is used. LetMeApply remains an independent browser extension; no documented public integration was established during this review.

## Truthful results and performance

- Employer relative ages advance from their observation time, never from first detection.
- Employer “today” labels expire at the next India calendar day.
- Unknown experience remains reviewable in All Jobs and does not qualify for owner alerts.
- Personal discovery preferences do not hide saved/application records.
- The company endpoint no longer silently truncates the directory at 500.
- Jobs beyond the initial 1,000 are fetched using a stable increasing-ID cursor.
- Job cards render in batches of 30; keyboard focus and reduced-motion preferences are supported.
- Browser storage failures are surfaced rather than silently claiming durable storage.

## Cost and coverage

No new paid service, subscription, cloud account or independent per-user backend is provisioned. Existing hosting and automation remain subject to their service free-tier limits. Unlimited usage and exhaustive coverage of every employer cannot be guaranteed.

Source additions require an official career link and city evidence. `scripts/review-company-candidates.py` creates a review report and never automatically enables a company. Review redirects, company identity, provider identifiers and access policies before enabling. A reachable custom page may still offer only limited structured coverage; it is not a promise of open or eligible jobs.

## Release checks

`python -m pytest -q`

`npm run test:product --prefix web`

`npm run typecheck:ui --prefix web`

`npm run build --prefix web`

Profile/import/freshness/export tests and UI type checking run before production deployment. The deployment also verifies the live homepage and dashboard API.

## Research and attribution

- Greenhouse parsing guidance: https://support.greenhouse.io/hc/en-us/articles/200989175-Unsuccessful-resume-parse
- Jake Gutierrez's template: https://github.com/jakegut/resume
- Cloudflare free-tier limits: https://developers.cloudflare.com/workers/platform/limits/
- LetMeApply product: https://letmeapply.com/
- YC company-directory discovery dataset (secondary, not verification): https://github.com/yc-oss/api
- Primary city evidence and career links are recorded per candidate in the company review report.

## Source review completed 2026-09-13

Reviewed 97 active target-city candidates from the YC directory and two additional official employer sources. Enabled 19 new sources after reviewing career links and company identity, for 521 unique enabled sources. Several reachable career pages offer only limited structured coverage. This is not 1,000 verified companies or exhaustive city coverage. Rehook.ai redirects to existing CleverTap and is not added as a duplicate. The review report preserves unconfirmed candidates for future investigation.
