---
name: database-change
description: Reviews and implements database schema, migration, ORM and SQL changes with attention to correctness, compatibility, query performance and rollback limitations. Use for SQL, schema, index, migration or persistence changes.
---
# Database Change Skill

1. Inspect DB engine/version, migration framework, schema, constraints, indexes, ORM mappings, query callers and deployment order.
2. Identify data volume, lock risks, transaction behavior, online index support and compatibility with old/new application versions.
3. Prefer expand-and-contract for deployed schema changes. Make additive changes first, deploy compatible readers/writers, backfill in bounded batches, then remove obsolete schema in a later release.
4. Use parameterized queries; validate query plans for expensive paths; avoid N+1 access and unbounded scans.
5. Test migration on a disposable database with representative data, including duplicate, null and boundary cases.
6. Assess rollback honestly. A destructive transformation may require a forward repair, not a simple down migration.
7. Never connect an agent to production with write privileges. Production migrations and data changes require explicit human approval.
8. Report migration order, compatibility window, locking/performance concerns, tests and rollback/forward-fix strategy.
