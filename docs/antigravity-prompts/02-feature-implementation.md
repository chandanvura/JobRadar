# Feature Delivery

Use the `feature-delivery` skill.

**Feature:** [name]
**Business outcome:** [why it matters]
**Existing behavior:** [what happens now]
**Expected behavior:** [what should happen]
**Requirements:**
- [requirement 1]
- [requirement 2]

**Constraints / must not change:**
- [compatibility, modules, performance, API contract, etc.]

**Acceptance criteria:**
- [observable criterion 1]
- [observable criterion 2]

First inspect relevant code, tests and Git status. Create a requirement → file/symbol → test/evidence matrix and an implementation plan. For substantial work, present the plan before edits. Implement in small slices, preserve unrelated changes, add regression/edge tests, run the real project checks and review the final diff. Report exact evidence and anything not tested. Do not claim all requirements are met without proving them.
