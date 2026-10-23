# Website handoff review

The external patch was unavailable. Its four reported fixes were recreated from current source rather than applying an unseen commit.

## Implemented in draft PR #97

| Handoff items | Result |
| --- | --- |
| 1, 5, 6, 24 | Atomic final catalog counts, hidden zero freshness metric, view-specific titles and last refresh time. |
| 2, 3 | Explicit senior titles excluded from early-career views; personal shortlists enforce preferred role families. All Jobs and tracking history remain broad. |
| 4 | Existing duplicate-source grouping retains original records, apply links and application history. Distinct requisitions are not deleted or merged by title alone. |
| 7–14 | Removed repeated preference copy, clearer experience/work-mode/stale-date labels, one evidence Details section, canonical skill casing and plain source status. |
| 15, 16 | Prominent skill setup and transparent score components. Scores are not cosmetically stretched and role preferences never invent skill claims. |
| 17–19 | Mobile More navigation, bounded numeric page navigation, and one authoritative grouped ATS search section. |
| 20 | Not interested hides from personal shortlists with undo, preserving Saved and Applications history. |
| 21, 22 | Existing sorting and preference filters retained; role-family matching tightened. |
| 23 | Private follow-up dates, due counts and downloadable calendar reminders. Calendar import is manual; the browser does not send messages. |
| 25 | Saved and Applications CSV downloads, with spreadsheet formula neutralization. |
| 26 | Existing Telegram delivery retained. No email service or additional notification infrastructure added. |

A 2+ year minimum is not automatically incompatible with a 0–3-year search. Strict JD evidence and uncertainty labels remain authoritative. Employer-relative dates observed on an earlier date cannot become fresh merely because they contain “today”.

## Validation and limits

Automated React interaction coverage exercises catalog loading, filtering, paging, hide/undo, tracking retention, navigation and refresh cancellation. Dedicated tests cover CSV escaping, formula neutralization, calendar escaping, invalid follow-up dates and private backup validation. The repository web verification harness covers build, lint, types, dependency audits and Worker/D1 integration.

Read-only browser review of the deployed baseline reached Saved, Applications, Outreach, Companies, Resume Studio and privacy settings. The theme toggle switched dark/light successfully. Empty local tracking and resume forms were used; no messages, production scans, restores or destructive actions were performed. This is not an exhaustive physical-device, populated-account or production notification-delivery test. Draft changes require CI review and merge before deployment.

## Follow-up screen verification — 23 October 2026

Reviewed deployed revision `1b21d131299c2b4e8a6259d373bdbfa0a2717d33` in Chrome at a 1363 × 936 CSS-pixel viewport. A newly created random local workspace isolated all disposable tracking and fictional resume data from the original workspace.

| Screen / flow | Observed evidence |
| --- | --- |
| Saved | Saving a live listing produced one saved card and the Saved CSV control. |
| Applications | Changing that listing to Interview produced one interview record; stage and private notes survived reload. |
| Follow-up | Entering 23 October through native date segments displayed a due reminder and calendar-download control. After reload, the summary still showed one due follow-up and one interview. |
| Outreach | Changing the company through the native selector updated the role context, official application link and message templates. No message or email was sent. |
| Companies | The source catalog displayed bounded pages with numeric navigation and Next companies. The React harness separately exercises page retention and all-page reachability. |
| Resume Studio | Fictional name, experience and Java/Docker/AWS skills generated a tailored preview. Kubernetes remained a review gap rather than an invented skill. Master resume and JD survived reload. |
| Settings / privacy | Workspace isolation and backup/restore controls were reachable. No production restore or original-workspace clearing was performed. Existing backup UI fault tests cover blocked reads/writes and history preservation. |
| Theme | The earlier deployed-browser review switched dark/light and restored light; no physical-device color/contrast claim is made. |
| Mobile More | Automated React interaction opens More, expands Career tools, checks Job Boards/Outreach/Companies/Resume Studio reachability, and closes the keyboard-isolated drawer. |

New regression assertions verify follow-up input saving, calendar control visibility and persisted dates across a fresh dashboard render. Existing focused suites exercise 10,000-row pagination, notes flushing, backup faults, private CSV/calendar escaping and resume tailoring. No application-code change was justified by this pass.

### Remaining environment limits

The browser interface did not provide an effective viewport resize or device emulation control. Therefore this pass does **not** verify narrow-screen visual layout, touch keyboards, Android Chrome, iOS Safari, Firefox, print dialogs or imported-calendar notification delivery. Automated mobile navigation tests are functional DOM evidence, not rendered mobile screenshots. Exhaustive coverage across every device and populated user account cannot be claimed. A physical-device/cross-browser pass is still required for that broader acceptance claim.

## Second-round brief — 23 October 2026

Confirmed before editing: Dashboard accepted reviewable leads while Recommended was strict; experience policy rejection could coexist with an overlap sentence; unset skills were called missing; local timestamps omitted the zone; cards retained separate evidence/tracking disclosures. The Save button used a 40px target.

The first isolated fix makes Dashboard use the same verified/fresh gates and personal role matcher as Recommended, with an All Jobs count/navigation control. All Jobs remains broad and Needs Review retains out-of-range/unknown senior evidence. Experience copy uses the JD verdict rather than a second positive overlap verdict; stored minima above the user's maximum never report overlap. Unset skills say Skills to check. Absolute timestamps use en-IN in Asia/Kolkata with IST; page load and completed job checks have distinct labels. Follow-up day comparisons also use IST.

Desktop read-only review of deployed #98 used a 1363px viewport. Saved, Applications, Outreach, Companies and Job Boards had view-specific titles, no horizontal overflow and no external HTTP link missing new-tab/noreferrer attributes in the rendered DOM. Resume's initial lazy state was observed separately; its earlier populated/reload test remains the evidence for completed rendering. This does not audit every off-page employer URL or prove every employer still accepts applications. No message was sent and original workspace data stayed intact.

Phone-width 360–414px rendering remains blocked by unavailable effective viewport/device controls. Physical devices, Safari/Firefox, all-view keyboard order, dark-mode contrast ratios and every-view back navigation are not newly verified. Previously observed light/dark switching is not equivalent to a contrast audit.

### C: proposals only

Existing newest/best-fit sorting and work-mode filtering should be retained; propose remembering sort and adding a dedicated skill filter only after acceptance of their defaults. Propose a reversible hidden-jobs list, a seven-day no-update marker, and in-app instructions for the existing Telegram setup. The funnel summary, CSV export and restore-validation tests already exist; retain them. Backup restore is validated in disposable browser/SQLite tests, not a production restore drill. Explain score components using actual configured weights; do not promise a fixed +10 without computing the job-specific delta. Email alerts require a separate explicit decision and are not started. None of these C proposals is implemented by this round.


A6 follow-up: card evidence, score components, eligibility explanation, feedback, hidden-job action, application stage, notes, JD and follow-up controls now sit under one primary Details disclosure. The collapsed card keeps identity, location, experience, posting age, six top skills, fit score, Apply and Save. Save is 44 × 44 CSS pixels and Details has a 44px minimum height. This addresses the specifically reproduced Save target; it does not certify all mobile targets. Existing tracking/history is preserved. Automated card tests verify one primary disclosure and that feedback/stage actions are contained within it.

Desktop first-use/search follow-up on the deployed baseline: Use defaults dismissed onboarding in the disposable workspace. A nonsense query returned zero results with the explicit no-matches message; Clear restored results. Java returned 466 results in the observed snapshot. This is baseline browser evidence, not a deployed verification of the draft fixes. External-link DOM attribute checks cover currently rendered pages only; no board scraping or outreach occurred.
