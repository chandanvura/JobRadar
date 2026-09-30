# JobRadar recovery

The independent Cloudflare Cron Worker checks the scan every 15 minutes. It
dispatches a scan after five hours without a completed run, unless a scan is
already active. The GitHub watchdog is a second trigger. Neither component
changes stored jobs or tries to rewrite application code.

Cloudflare D1 Time Travel covers the previous seven days on the free plan.
The `Backup JobRadar database` workflow also exports SQL on the 1st and 15th
of each month. Successful runs retain the compressed artifact for 90 days.
GitHub schedules are best effort, so check the most recent successful backup
in Actions before relying on it. Backups are not committed to this repository.

## If data is damaged

1. Stop the ingest workflow and record the current time, database UUID, and
   last healthy scan. Diagnose whether the issue is a bad import or a code bug.
2. Prefer Cloudflare's D1 Time Travel to a minute before the corruption, if
   within seven days. Verify the recovery point before applying it.
3. For older damage, download a successful `jobradar-d1-*` artifact, check
   `sha256sum -c SHA256SUMS` and `gzip -t jobradar.sql.gz`, then decompress.
4. Import into a **new** D1 database first and compare row counts and recent
   scan history. Only redirect production after verifying the data and Worker
   binding. Do not import a backup over a live database automatically: doing
   so could erase newer applications, notifications, or scan history.

If the GitHub dispatch token expires, create a replacement with Actions read
and write permission and update the `JOBRADAR_DISPATCH_TOKEN` repository secret;
rerun the Cloudflare deployment to install it on the recovery Worker.
