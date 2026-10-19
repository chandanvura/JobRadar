# Preserve employer remote-location evidence

## Justification and evidence

The official HighLevel careers page publishes its Lever board. On 19 October
2026, the public API returned 98 roles. It uses `categories.location: India`
and `workplaceType: remote` as separate fields. The adapter discarded the
remote field, so no role could reach the India remote JD checks.

Preserve this employer-provided flag. Add the India remote label only when a
published location explicitly equals India. Do not infer a country from a
generic remote flag, a job title, or a company address. Preserve the original
location text and secondary locations. Keep the existing date and JD rules.

## Verification and rollback

Test India remote, US remote, India hybrid, a missing flag and a missing
country. Old postings must remain ineligible. Run the Python harness and
probe the real board again before adding a new registry source.

No migration is required. Revert this change for rollback. Do not remove
stored jobs or application history.
