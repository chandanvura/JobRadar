---
name: repo-onboarding
description: Maps an unfamiliar existing repository, explains its architecture and execution flows, discovers real development and test commands, and creates an evidence-based project context document. Use when starting work in an existing codebase or when project understanding is incomplete.
---
# Repository Onboarding Skill

## Goal
Build an accurate, evidence-backed map of the repository without changing product code.

## Procedure
1. Inspect Git status first. Preserve all existing edits and untracked files.
2. Read root instructions (`AGENTS.md`, `GEMINI.md`, `.agents/`) and relevant README/docs.
3. Inventory manifests, lockfiles, build files, CI workflows, Docker/container files, infrastructure configuration and environment templates. Never read or print secret values.
4. Identify languages, frameworks, package managers, entry points, modules, APIs, persistence, queues, scheduled jobs and external integrations.
5. Trace the main execution paths end to end. Cite exact file paths, classes/functions and important contracts.
6. Discover commands from package scripts, build files, Makefiles, CI and docs. Run only safe, non-destructive checks; ask before installing packages or starting services if this may change the environment.
7. Map existing tests to modules and identify gaps without declaring code defective solely because coverage is absent.
8. Record architecture, data flow, commands, constraints, unknowns and risks in `docs/PROJECT_CONTEXT.md` only when the user asks or the repo onboarding task includes that deliverable.

## Output
- Repository map and technology inventory.
- Main entry points and 2–5 important execution flows.
- Data/API contracts and trust boundaries.
- How to install, run, test, lint, type-check and build, with evidence.
- CI/CD and deployment overview from repository files.
- Unknowns, risks and recommended next steps.

## Rules
- Do not modify source code during discovery.
- Do not assume a framework from a file extension alone.
- Mark unverified details as unknown.
- Never expose `.env` contents or credentials.
