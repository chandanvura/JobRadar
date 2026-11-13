---
name: code-review
description: Performs an independent, evidence-based review of a working tree or proposed change for correctness, regressions, security, maintainability, performance and missing tests. Use before merging or after implementation.
---
# Independent Code Review Skill

## Review posture
Assume the implementation may be wrong. Do not edit files during review unless explicitly asked to switch from review to remediation. Review requirements and actual diff, not just the author's summary.

## Steps
1. Read requirements, acceptance criteria, project rules and current Git diff (including untracked relevant files where possible).
2. Trace changed code into callers, downstream consumers, database contracts and external integrations.
3. Check correctness, edge cases, nullability, validation, authorization, exception handling, concurrency, idempotency, retry behavior and resource cleanup as relevant.
4. Check compatibility, data migration safety, performance, observability and dependency/security implications.
5. Verify tests are meaningful and map to acceptance criteria. Identify important missing negative/regression cases.
6. Run safe, relevant checks if requested or available; report what was and was not executed.

## Finding format
For each finding include severity (critical/high/medium/low), file and line/symbol, concrete scenario, impact, why the current code causes it, and a practical remediation. Prioritize confirmed defects; label speculative risks clearly.

## Output
Start with findings, highest severity first. If no findings, say no defects were identified in the reviewed scope—not that the code is bug-free. Then list residual risks, missing tests and validation performed.
