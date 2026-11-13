# Safe Refactor

**Target:** [module/files]
**Reason:** [maintainability/performance/etc.]
**Required behavior to preserve:** [contracts]
**Explicitly out of scope:** [areas]

Before changing code, map callers, consumers, persisted data and public interfaces. Identify behavior that tests must lock down. Propose an incremental plan and explain why it is safer than a broad rewrite. Add characterization tests where behavior is poorly documented. Refactor in small steps without behavior changes; run tests after each logical step. Compare API/schema/output behavior before and after. Review diff for unrelated edits. Do not combine a behavior change with a refactor unless explicitly requested and separately tested.
