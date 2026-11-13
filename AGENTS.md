# Repository Engineering Contract

This file defines generic repository expectations. Replace the project-specific placeholders in `docs/PROJECT_CONTEXT.md` after inspecting the real codebase. Do not invent architecture or commands to fill those placeholders.

## First actions in every task
1. Read this file, relevant `.agents/rules/`, `README`, `docs/`, package/build manifests and nearby source/tests.
2. Check Git status and preserve all pre-existing user changes. Never reset, clean, checkout over or discard user work.
3. Establish current behavior from executable code and tests, not filenames or assumptions alone.
4. For substantial changes, write a short plan and map acceptance criteria to implementation and tests before editing.

## Implementation contract
- Follow the existing architecture, naming, formatting, error-handling and dependency patterns unless there is a documented reason to change them.
- Keep changes scoped. Avoid drive-by refactoring, unrelated formatting and broad renames.
- Preserve public API and data compatibility unless the requirement explicitly authorizes a breaking change.
- Validate inputs at trust boundaries. Handle expected failures explicitly; do not silently swallow exceptions.
- Consider security, privacy, concurrency, performance, accessibility and observability where relevant to the changed path.
- Keep secrets out of source, fixtures, screenshots, logs and documentation. Use environment variables or the project's secret-management approach.

## Testing contract
- Add tests that fail before the fix and pass after it whenever feasible.
- Cover happy path, invalid input, boundary values, error paths and relevant concurrency/retry behavior.
- Prefer deterministic tests. Avoid sleeps, external network calls and shared mutable state unless the integration test specifically requires them.
- Run the narrowest relevant tests during development and the broadest practical required checks before declaring completion.
- If a test cannot be run, state why and what evidence is still missing.

## Database and external systems
- Treat migrations, schema changes, queue contracts and external API changes as compatibility-sensitive.
- Inspect current data model, constraints, indexes, migration history and consumers before changing a contract.
- Use development/test resources by default. Production writes, deployments and irreversible operations require explicit approval.

## Completion gate
A task is complete only when each acceptance criterion has a status backed by evidence. Review the final diff and report:
- what changed and why;
- files and interfaces affected;
- acceptance criteria (pass / fail / blocked / not tested);
- exact checks executed and results;
- unresolved risks, assumptions and manual steps.
