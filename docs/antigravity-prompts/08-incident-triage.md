# Incident Triage — Evidence First

**Incident summary:** [what users/operators observe]
**Impact and start time:** [known facts]
**Affected service/environment:** [service]
**Recent changes:** [deploys/config/dependency changes]
**Evidence:** [logs, metrics, traces, alerts; redact secrets/PII]

Prioritize safe diagnosis and service restoration. Establish timeline, scope, customer impact and known-good baseline. Correlate changes with logs, metrics and traces. Propose hypotheses with evidence and confidence. Do not run destructive commands, change production config, restart services, roll back, scale, or modify data without explicit approval for the specific action. Separate mitigation from root-cause correction. End with timeline, current status, evidence, actions taken, unverified hypotheses and follow-up prevention work.
