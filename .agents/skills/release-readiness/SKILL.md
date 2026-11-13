---
name: release-readiness
description: Assesses whether a change or application is ready to merge, deploy or release by checking tests, build artifacts, migrations, configuration, security, observability, rollback and operational risks. Use before release or deployment.
---
# Release Readiness Skill

## Scope and safety
This skill performs review and preparation only. Do not deploy, publish, run production migrations, modify live infrastructure or trigger external changes unless the user explicitly authorizes that exact action.

## Checklist
- Requirements and acceptance criteria reviewed.
- Git diff scoped; no accidental files, secrets, debug output or local-only configuration.
- Unit/integration/contract/E2E tests and static checks run as appropriate.
- Build artifact generated and versioned reproducibly.
- Configuration and secret references documented without values.
- API, event and database compatibility checked.
- Migration order, lock/data-volume implications and recovery strategy documented.
- Authentication, authorization, dependency and security checks considered.
- Logs, metrics, traces, dashboards and alerts adequate for the changed behavior.
- Health checks, failure modes, retry/idempotency and capacity considered.
- Rollback or forward-fix plan documented; destructive changes called out.
- Deployment verification and owner/manual steps identified.

## Report
Use pass / fail / blocked / not-run for each gate. Give evidence, residual risk and explicit go/no-go recommendation. Do not assert production readiness from a green unit test suite alone.
