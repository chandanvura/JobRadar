---
trigger: glob
globs: "**/*.tsx, **/*.jsx, **/*.vue, **/*.svelte, **/*.html, **/*.css, **/*.scss"
description: Apply when changing web UI, client-side behavior, styles, accessibility or browser interactions.
---
# Web UI Quality Rules

- Follow the project's existing component, routing, state and styling patterns.
- Preserve responsive behavior and test narrow and wide viewports when layout changes.
- Use semantic HTML, accessible labels, keyboard operation, visible focus and appropriate contrast.
- Handle loading, empty, error, disabled and success states; avoid inaccessible custom controls.
- Do not expose secrets or trust client-side validation as the only security control.
- Prefer stable selectors and user-visible behavior for end-to-end tests; avoid brittle CSS/XPath selectors where accessible roles are available.
- Check browser console/network errors and relevant navigation/form flows after UI changes.
