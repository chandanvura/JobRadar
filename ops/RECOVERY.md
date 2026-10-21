# JobRadar recovery

The independent Cloudflare Cron Worker checks every five minutes. It dispatches
one scan when the latest scan start is at least 150 minutes old and no scan is
queued/running. The GitHub watchdog is a second trigger. Completed scan workflows
have a 30-minute recovery cooldown, including failed/cancelled runs. Confirmed
D1 quota exhaustion suppresses recovery dispatch. Neither component rewrites
application code. The external dispatcher requires a valid Actions token.

## Operational checks

`JobRadar operational health` runs hourly at minute 23 and can be dispatched
manually. It uses only read requests: portal/static-backup HEAD probes, public
health, backup workflow history and artifact metadata. It fails when a completed
scan is missing/at least five hours old, sources report failure, database or
ingestion is unavailable, quota is exhausted, the latest successful backup is
at least 36 hours old, or its artifact is absent/expired/empty. Missing evidence
is a failure, not a healthy result. The JSON report is retained for seven days
and the check writes a GitHub step summary. Monthly reports retain 90 days.

Enable GitHub Actions failure notifications for your account. The workflow does
not configure email, Telegram incident delivery, or an external uptime service.
A failed GitHub schedule cannot report its own absence; the Cloudflare scheduler
can restore allowlisted workflows disabled for inactivity, but only while its
token and provider remain available. Manually disabled workflows stay disabled.
Monthly recording uploads an artifact; it never pushes to protected `main` and
is not a repository keepalive mechanism.

## Database backup and isolated restore

`Backup JobRadar database` exports SQL daily at 01:17 UTC. Before compression or
upload, `scripts/verify_d1_backup.py` restores the export into a disposable,
in-memory SQLite database. It checks required schema, integrity, foreign keys,
and row counts. Invalid exports fail the workflow. No production restore occurs.
The 250 MB input limit and workflow deadline bound verification resources.

Successful runs retain `jobradar.sql.gz`, `SHA256SUMS`, and
`restore-verification.json` for 90 days. The artifact contains database data:
keep repository/Actions access restricted appropriately and do not publish it.
The verifier covers SQLite compatibility and internal consistency; a separate
Cloudflare D1 staging restore is still required before a production recovery.
Older artifacts created before this verifier have no restore-verification report.

GitHub schedules are best effort. Check the latest successful backup and report
before relying on it. Cloudflare Time Travel recovery availability depends on
the account's current provider plan; verify it in Cloudflare at incident time.

## If data is damaged

1. Pause ingestion and record the current database UUID and last healthy scan.
   Diagnose whether the cause is a bad import or a code bug.
2. Check Cloudflare Time Travel for a suitable recovery point before corruption.
   Confirm the point and its scope before applying any production restore.
3. For SQL recovery, download a successful `jobradar-d1-*` artifact. Run
   `sha256sum -c SHA256SUMS`, `gzip -t jobradar.sql.gz`, and decompress the SQL.
4. Run `python scripts/verify_d1_backup.py /path/to/jobradar.sql` locally.
   This is isolated verification and does not contact Cloudflare.
5. Import into a **new staging D1 database** and compare row counts, scan history,
   migrations, browsing and notification deduplication. Redirect production only
   after explicit release approval. Never overwrite the live database automatically.

Browser-private saved jobs, notes, resumes and application history are outside
D1 snapshots. Export private backups from Settings and test importing them in a
separate browser profile. Clearing browser storage without an export can lose
that history; no server-side recovery is promised.

If the dispatch token expires, replace the repository secret
`JOBRADAR_DISPATCH_TOKEN` and install it on the recovery Worker through the
approved deployment process. No token value belongs in a URL, issue or README.

## Release and rollback

Require a PR, passing `python`/`web`, an up-to-date branch and resolved review
conversations. Zero required approvals supports solo maintenance; no bypass
actor is configured. Keep automated dependency PRs subject to these same gates.
Do not automatically merge fixes or deploy during an incident.

Before releasing database changes, verify a fresh backup and staging migration.
After release, verify HTML, live health, live/backup catalogues and the next
completed scan. On regression, use a reviewed revert or the provider's known
healthy Worker version; code rollback does not undo schema/data changes. Use
the database recovery procedure separately when needed.
