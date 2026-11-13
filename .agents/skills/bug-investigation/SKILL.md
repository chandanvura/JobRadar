---
name: bug-investigation
description: Reproduces and diagnoses defects, identifies root causes, adds regression tests, implements minimal fixes and verifies behavior. Use for errors, failing tests, incorrect data, broken workflows and production-like incidents.
---
# Bug Investigation Skill

## 1. Establish facts
- Capture expected vs actual behavior, reproduction steps, environment and impact from available evidence.
- Inspect Git status and preserve user changes.
- Inspect logs, stack traces, recent diffs and relevant source. Redact secrets and personal data.

## 2. Reproduce
- Create the smallest deterministic reproduction possible.
- Identify whether failure is local, test-only, environment-dependent or systemic.
- Record the failing test/command and baseline behavior.

## 3. Trace root cause
- Trace inputs through the complete execution path to the failing state.
- Check boundary conditions, null/empty values, ordering, concurrency, retries, transactions, time zones, serialization and external dependencies as relevant.
- Distinguish root cause from symptoms. List competing hypotheses and evidence that confirms/rejects them.

## 4. Fix
- Add a regression test that fails for the old behavior where practical.
- Implement the smallest safe correction. Avoid unrelated refactors.
- Preserve compatibility and document any intentional behavior change.

## 5. Verify
- Run the regression test, neighboring tests and broader suites appropriate to risk.
- Check edge/failure cases and ensure no existing test was weakened to mask the issue.
- If unable to reproduce, do not pretend root cause is proven; report what was ruled out and what evidence is needed.

## Output
Symptoms, reproduction, root cause with file/symbol evidence, fix, tests/results, residual risk and next diagnostic step if unresolved.
