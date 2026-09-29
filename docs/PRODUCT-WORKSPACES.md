# JobRadar personal workspaces

## Use the website

1. Open JobRadar and choose **Set up my search** or **Edit search**.
2. Choose titles, optional skills, experience and Bengaluru/Hyderabad.
3. Verify an opening on the official employer page, save it, then track applications.
4. Open **Settings → Create my workspace** for a separate local workspace URL.
5. **Create search invite** shares only sanitized search settings. Every recipient gets a newly generated workspace; no profile ID, application record, note or resume content is shared.
6. Download a private backup before clearing browser data. Restore it on another device using Settings. Restoring replaces that profile's preferences and tracking.

Profiles are browser storage namespaces, not authenticated accounts. Another person on a different device cannot read your browser storage through a profile URL. People sharing the same browser account can access its local profiles. Use separate browser accounts for privacy. The original workspace retains existing browser data for backward compatibility.

All people use the same public collected engineering job catalog in Bengaluru and Hyderabad. Search choices do not launch new scraper runs, change another workspace's filters, or configure another Telegram recipient. Arbitrary roles/cities beyond the collected catalog are not supported. There is no cloud synchronization or per-user Telegram subscription in this release.

### Matching levels

- **Recommended** ranks every active target-role job by preferred-title similarity, optional skill overlap, experience compatibility, verified freshness and official-source priority. Missing experience or posting dates remain visible with a clear review label.
- **Exact** requires a preferred title and skill match when those fields are filled. Use it only when you intentionally want a narrow list.
- **Latest Jobs** and **Ultra Fresh** require employer-provided freshness evidence. Telegram alerts also require explicit 0–3 YOE evidence, so reviewable jobs never create misleading alerts.
- **Job Boards** creates last-24-hours LinkedIn and Naukri search links from the user's titles. Results stay on those services and must be verified against the employer page.
- **Internships** is an isolated opportunity area. Internship records are classified during ingestion and excluded from Dashboard, Recommended, Latest, All Jobs, and role-specific full-time views. It includes official-source results plus user-initiated LinkedIn/Naukri searches with internship, entry-level, city, newest-first, and last-24-hour filters.
- Internship cards can open a public web search for company recruiters, talent-acquisition staff, or campus-hiring staff. JobRadar does not scrape profiles, guess email addresses, or store personal contact data; users must verify identity and employment before contacting anyone.

LinkedIn and Naukri results can be much larger because they aggregate employers, agencies, reposts and listings whose dates or experience are not independently verified. JobRadar does not scrape them. LinkedIn's User Agreement prohibits scripts, robots, crawlers and browser extensions used to scrape its services, while Naukri blocks automated crawler access. Authorized APIs or user-provided exports can be added later without changing the verified-alert rules.

## Resume Studio

Save your master resume once in **Resume Studio**. Clicking **Tailor resume** on a job then automatically loads its employer description and prepares a separate editable draft. The master is preserved. **Edit master resume** changes the source for future jobs; **Regenerate from master** discards draft edits and prepares a fresh version. The latest draft is retained locally and reused only for the same job, JD and master.

If the description is unavailable, paste the employer JD and choose **Regenerate from master**. Ingestion currently retains up to 4,000 characters; check the original posting and paste the full JD when needed.

Keyword review compares recognized technical terms and your supplied skills. It is not an ATS score and cannot predict acceptance. Automatic tailoring prioritizes existing skills and consecutive achievement bullets within their original sections. Indented continuation lines stay with their bullet; employer headings and dates stay in place. No achievements, skills or employment history are invented. Review facts and grouping before applying.

- Print / Save PDF: browser-generated, single-column Jake-inspired layout. Disable print headers and footers and review pagination.
- Download Jake LaTeX: uses Jake Gutierrez's MIT-licensed template preamble. Compile locally or in a compatible LaTeX editor. The license is included in the export and in `web/public/templates/jake-LICENSE.txt`.
- Download text: readable text copy.

Resume inputs remain in browser storage, including the JD. No paid AI API is used. LetMeApply remains an independent browser extension; no documented public integration was established during this review.

## Truthful results and performance

- Employer relative ages advance from their observation time, never from first detection.
- Employer “today” labels expire at the next India calendar day.
- Unknown experience remains reviewable in All Jobs and does not qualify for automated alerts.
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
