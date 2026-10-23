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
