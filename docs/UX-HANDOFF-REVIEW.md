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
