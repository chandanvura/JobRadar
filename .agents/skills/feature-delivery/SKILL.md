---
name: feature-delivery
description: Plans and implements a new feature or enhancement in an existing codebase with acceptance criteria, scoped changes, regression tests and verified results. Use for feature work and multi-file behavior changes.
---
# Feature Delivery Skill

## Phase A — Clarify the contract
- Restate the user outcome and observable behavior.
- Extract functional and non-functional requirements.
- Identify constraints, compatibility expectations and out-of-scope work.
- Convert every requirement into a testable acceptance criterion.
- State assumptions. Ask only if an unknown blocks safe implementation.

## Phase B — Investigate
- Read project instructions and inspect Git status.
- Trace the current flow and inspect nearby tests, contracts and downstream consumers.
- Identify affected files/modules, data changes, risks and likely edge cases.
- Establish the baseline tests relevant to the change.

## Phase C — Plan
Create a table: requirement → affected code → test/evidence → risk.
Propose small implementation steps and validation commands. For substantial work, present the plan before editing and wait for approval if the requested scope is ambiguous, high impact or externally consequential.

## Phase D — Implement
- Make a focused, minimal, maintainable change.
- Reuse existing patterns and dependencies.
- Preserve backward compatibility unless explicitly changed.
- Handle validation, errors, boundary cases, authorization and observability.
- Keep generated code and migrations consistent with the project's source-of-truth workflow.

## Phase E — Verify
- Add tests for every meaningful new behavior.
- Run targeted tests after each logical slice.
- Run integration/build/type/lint checks appropriate to the change.
- Test failure and boundary paths, not just the happy path.
- Investigate every failure; do not hide, skip or weaken unrelated failing tests.

## Phase F — Review and report
Review final diff, public contracts, error paths, security, performance and scope creep.
Report acceptance criteria one by one with evidence; list exact commands and results; distinguish not-run checks from passed checks. State residual risks and manual follow-ups.
