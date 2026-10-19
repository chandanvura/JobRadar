# Reduce repeated catalog reads

## Justification

Deployment run 39298247164 reported D1 error 7500: the free daily row-read
quota was exhausted. Each browser catalog load requests the same public data.
Repeated reads can use the database allowance and force the saved snapshot.

## Evidence and change

The API returns public job and company data. Private tracking stays in each
browser. Keep successful public catalog responses at the serving edge for at
most 60 seconds. Use a canonical key for each cursor and page size. This can
reduce repeated reads at the same edge. It cannot guarantee a global hit rate
or restore a quota that is already exhausted.

Do not cache health, writes, alerts, credentialed requests, errors, or backup
responses. Keep browser responses `no-store`. Keep employer posting timestamps
unchanged. The client continues to re-evaluate posting age. Cache failures
fall through to the existing live read and static recovery.

Use the documented Cloudflare Cache API:
https://developers.cloudflare.com/workers/runtime-apis/cache/
Cloudflare respects the response expiry. An explicit expiry check also rejects
an old entry. Increment the cache-key version if the public response schema changes.

## Verification and rollback

Test repeated reads, expiry, page isolation, credential exclusion, backup
exclusion and cache failures. Run the web harness and compiled Worker checks.
The existing immediate-ingestion integration tests disable this bounded cache;
cache behavior has its own tests. No database migration is needed.

After deployment, request the same public page twice and inspect
`X-JobRadar-Catalog-Cache: hit`. Check health separately. A warm read does not
prove that current source scans are healthy.

Set `JOBRADAR_DISABLE_PUBLIC_CATALOG_CACHE=1` to disable this cache. Revert the
change for code rollback. Entries expire within 60 seconds. Do not delete
application history or database records.
