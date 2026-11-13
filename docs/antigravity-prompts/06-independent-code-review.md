# Independent Code Review — DO NOT EDIT

Use the `code-review` skill. Treat the implementation as untrusted until checked.

**Requirements:** [paste or point to file]
**Diff/branch:** [working tree/branch/commit]
**Risk areas:** [optional]

Inspect actual diff and trace changed code into callers, consumers, data stores and external interfaces. Look for correctness defects, missing acceptance criteria, edge cases, compatibility, security, privacy, concurrency, retry/idempotency, performance, observability and test gaps. Run safe checks if requested. Do not modify files. Return findings highest severity first with file/line, reproducible scenario, impact and remediation. Clearly separate confirmed defects from speculative risks. “No findings” is not a guarantee of bug-free code.
