---
name: test-engineering
description: Designs, writes, repairs and runs reliable unit, integration, contract, browser and end-to-end tests. Use when adding test coverage, debugging flaky tests or validating changes.
---
# Test Engineering Skill

## Test design
1. Start from user-visible acceptance criteria and contracts.
2. Select the narrowest appropriate test layer: unit for isolated logic, integration for collaborating components/persistence, contract for service boundaries, E2E for critical user journeys.
3. Cover happy paths, validation, boundaries, error handling, permissions, retries and concurrency when relevant.
4. Prefer deterministic fixtures, controlled clocks, fake external services and isolated resources.

## Test quality
- Assert observable outcomes, not private implementation details unless needed for a stable contract.
- Avoid arbitrary sleeps; use synchronization, polling with bounded deadlines or deterministic clocks.
- Ensure cleanup and test isolation.
- Do not make tests depend on real production services or live credentials.
- Do not reduce assertions or broaden skips merely to obtain green CI.

## Execution
- Discover commands from repository scripts, build files and CI.
- Run targeted tests first, then all relevant tests and quality gates.
- Record command, exit status, counts and failures.
- Investigate flakes separately from product defects.

## Output
Test matrix, files added/changed, commands/results, untested requirements and confidence limitations.
