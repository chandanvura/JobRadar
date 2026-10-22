# Website handoff review

The external `jobradar-fixes.patch` was not available in this checkout. Its four
reported fixes were recreated from current source; no external commit was applied.

## Reproduced fixes in the website quality branch

- Publish the complete catalog or validated fallback atomically. Initial preview
  rows do not become displayed results or counts. Keep the previous complete
  catalog during refresh; do not reset browsing to a partial preview.
- Exclude explicit senior/Sr. and Engineer/Scientist III–V titles from early-career
  views even when stored years are low. All Jobs, Saved and Applications retain
  their browsing/history purposes. A 2+ minimum is not automatically incompatible
  with a 0–3-year search; do not discard valid leads merely for an open upper bound.
- Use per-view document titles, shared city aliases, singular source wording and
  correct Job Boards section headings. Remove implementation-specific D1 prose.
- Hide the zero ultra-fresh metric, remove repeated preference copy, clarify
  conflicting work arrangements and show remote-country warnings only for jobs
  classified Remote. Onsite work is not given a remote-eligibility warning.
- Display source status in plain language, retaining detailed operations views.

## Needs evidence or a separate UX pass

Role-family mismatches need exact job IDs, JD evidence and the applied preferences:
recommended views already test title preferences, while All Jobs deliberately
supports broad browsing. Near-duplicate grouping already exists; distinct employer
requisitions must not be silently merged because titles match. Skill casing,
repeated experience copy, unified card Details, bounded page navigation, the mobile
More menu and overlapping external-search sections remain UX follow-up items.
Old employer-relative dates already lose verified status through `currentPosting`;
reviewable historical leads must not be relabelled fresh. A clearer stale-card
label still needs its own review. User profile skills must reflect explicit user
input; a preferred role title is not proof that the user knows every required skill.
Do not manufacture skill matches or stretch score distributions cosmetically.

## Existing versus proposed features

Newest/best-match sorting, role/skill search preferences, recommendation feedback,
private tracking/export and Telegram delivery already exist. A dedicated hide/undo
control, private CSV export and follow-up reminders would be separate changes.
Email is not currently equivalent to the existing Telegram pipeline. No new alert
service, message, timer or production scan was introduced for this review.

The DOM harness covers actual React interactions including Saved, Applications,
Companies, preference editing, pagination, refresh and drawer keyboard behavior.
Private export/restore and failure handling have separate interaction tests. This
is automated DOM evidence, not a completed real-device review of Outreach, Resume
Studio, privacy settings or dark-mode appearance. Those surfaces remain pending
manual visual review; no claim that all 26 handoff items are complete is made.
