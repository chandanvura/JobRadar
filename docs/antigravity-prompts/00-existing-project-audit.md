# Existing Repository Audit — READ ONLY

Act as a senior software architect and repository investigator. Use the `repo-onboarding` skill.

**Repository:** [path/name]
**Primary goal:** Understand the project fully before changing anything.

Inspect the real repository, including instructions, manifests, docs, source, tests, CI, deployment and infrastructure files. First check Git status and preserve every existing user change. Do not edit source files, install dependencies, change configuration or run destructive commands.

Deliver:
1. Technology inventory with evidence paths and detected versions.
2. Architecture/module map and actual entry points.
3. At least the important end-to-end data/request/job flows, tracing real functions/classes.
4. Database/API/external-service contracts and trust boundaries.
5. Exact install/run/test/lint/type-check/build commands discovered from the repo.
6. CI/CD and deployment overview based on checked-in files.
7. Test coverage map and meaningful gaps.
8. Risks, unknowns and questions that genuinely block safe work.
9. Draft `docs/PROJECT_CONTEXT.md` only if authorized; mark unknowns and cite paths.

Do not say “complete” based on a filename inventory. Explain what was actually traced and what remains unknown. No code changes in this audit.
