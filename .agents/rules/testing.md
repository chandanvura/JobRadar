---
trigger: model_decision
description: Apply when creating or modifying tests, changing behavior, fixing defects, adjusting CI, or deciding whether a task is adequately verified.
---
# Testing and Verification Rules

- Derive tests from acceptance criteria and observable behavior.
- For bug fixes, add a regression test that reproduces the defect before the fix when practical.
- Cover normal, boundary, invalid-input, failure and relevant concurrency/retry cases.
- Prefer deterministic tests and isolated fixtures; clean up resources.
- Do not weaken, delete or skip a failing test merely to get a green run. Explain and fix the underlying issue or obtain explicit approval for a justified test change.
- Run the actual repository commands discovered from manifests and CI configuration; do not invent test commands.
- Report exact commands, exit status, relevant output and checks not run.
- Separate unit, integration, contract, end-to-end and manual verification.
