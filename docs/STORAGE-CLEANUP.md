# Disposable storage cleanup

The `Clean disposable JobRadar storage` workflow removes rebuildable GitHub
Actions caches once when installed or manually run. Its daily run removes
job-detail caches older than 48 hours and dependency caches unused for seven days.
Useful caches can rebuild on the next validation or scan.

Scan shard artifacts expire after two days. Cleanup also removes older shard
artifacts from completed scans, including artifacts created before the shorter
retention was configured. It never removes inputs belonging to active scans.
Database backup artifacts retain their existing 90-day retention. Git history,
workflow logs, deployments and job records are not disposable caches.

Cloudflare's live API and public backup responses already use `Cache-Control:
no-store`. The Worker has no explicit Cache API storage. Static asset caching is
retained for page performance. D1 contains real job data; deleting it would not
be cache cleanup. Browser-local saved jobs and preferences are also retained.

The cleanup run summary reports actual deleted counts and bytes. Cleanup is
limited to this repository, using its temporary Actions token with `actions:
write`; no account-wide or Cloudflare purge credentials are required.
