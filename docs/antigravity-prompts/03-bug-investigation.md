# Bug Investigation and Root-Cause Fix

Use the `bug-investigation` skill.

**Observed problem:** [symptom]
**Expected behavior:** [expected]
**Reproduction steps:** [steps]
**Environment:** [local/test/staging, OS/runtime versions]
**Evidence:** [logs, stack trace, failing test, screenshot — redact secrets]
**Recent changes (if known):** [commits/releases]

Start by inspecting Git status and preserving user changes. Reproduce the issue before editing. Trace the full code/data path and compare hypotheses against evidence. Identify the root cause, not just the visible symptom. Add a regression test that fails before the fix when practical. Make the smallest safe fix. Run the regression test, neighboring tests and appropriate broader checks. Report root cause with file/symbol references, commands and real results. If the issue is not reproducible, state that; do not invent a root cause.
