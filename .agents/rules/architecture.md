---
trigger: model_decision
description: Apply when planning changes across modules, adding a new service or layer, changing module boundaries, or modifying public interfaces and architecture.
---
# Architecture and Change Boundaries

- Trace the real call path and data ownership before changing an interface.
- Keep dependency direction consistent with the repository's existing architecture.
- Prefer cohesive modules and explicit contracts; avoid hidden cross-module coupling.
- Before introducing a new abstraction, show the concrete duplication or complexity it removes.
- Before adding a dependency, inspect existing dependencies and explain maintenance, security, license and runtime implications.
- Document intentional breaking changes, migration steps and compatibility windows.
- Update architecture docs or decision records when a material design decision changes.
- Do not invent service boundaries or microservices merely to make a design look scalable.
