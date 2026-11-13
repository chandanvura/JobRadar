---
trigger: glob
globs: "**/*.sql, **/*migration*, **/*Migration*, **/migrations/**, **/db/**"
description: Apply when editing SQL, schema definitions, ORM mappings, migration files or database access code.
---
# Database Change Rules

- Inspect schema, constraints, indexes, migration history, ORM mappings and all known consumers before changing data structures.
- Prefer backward-compatible expand-and-contract changes for deployed systems: add compatible structures, deploy compatible code, backfill safely, then remove obsolete structures in a later release.
- Make migrations deterministic, ordered, documented and safe to retry where the migration framework requires it.
- Consider lock duration, table size, index build behavior, nullability, defaults, data volume and rollback limits.
- Use transactions where supported and appropriate; do not assume DDL is transactional across all engines.
- Parameterize queries and inspect query plans for performance-sensitive changes.
- Test migrations against a disposable database with representative data. Never point automated tests at production.
- State whether rollback is truly safe; do not label irreversible data transformations as reversible.
