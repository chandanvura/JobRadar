---
name: web-ui-validation
description: Implements or validates web UI behavior, accessibility, responsive layouts and browser journeys using reliable selectors and observable outcomes. Use for frontend changes and browser-level regression checks.
---
# Web UI Validation Skill

1. Inspect the frontend framework, route structure, design system, state management and existing browser test tooling.
2. Convert requested UI behavior into user journeys and states: loading, empty, success, validation, error, disabled and permission-denied.
3. Preserve established components and tokens; avoid rebuilding an existing design system.
4. Check semantics, labels, keyboard use, focus visibility, contrast and screen-reader-relevant names.
5. Validate responsive behavior at representative narrow and wide viewports.
6. Prefer locators based on roles, labels and accessible names. Avoid brittle selectors and arbitrary timeouts.
7. Inspect console errors, failed network requests and route transitions.
8. Use test data and non-production accounts. Do not submit real forms or trigger external actions without approval.
9. Capture screenshots or recordings only where useful and avoid exposing private data.
10. Report routes, states, viewport sizes, tests and any manual checks not completed.
