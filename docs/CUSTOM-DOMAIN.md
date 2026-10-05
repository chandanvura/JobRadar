# Connect a custom domain later

JobRadar runs on the independent Cloudflare Worker named `jobradar`, not the
ChatGPT Sites project. Keep the existing workers.dev address during migration.
No domain is configured by this change; the optional variable is unset.

1. Choose a domain you already control and activate its zone in the same Cloudflare
   account. Preserve existing mail, TXT and other DNS records when moving DNS.
2. Choose a dedicated hostname, such as `jobs.yourdomain.com`. This example is a
   placeholder, not a registered or reserved hostname. Do not replace a working
   site or existing CNAME without checking what it serves.
3. In GitHub repository Settings → Secrets and variables → Actions → Variables,
   set `JOBRADAR_CUSTOM_DOMAIN` to the hostname only, with no scheme or path.
4. The deployment token needs permission to deploy the Worker and write Workers
   Routes for the affected zone. Change permissions only when enabling the domain;
   never paste token values into chat, source or documentation.
5. Run **Deploy independent JobRadar** after the zone is active. The deployment
   script emits a `custom_domain: true` route, retains other configured routes and
   explicitly retains `workers_dev: true`.
6. Check Cloudflare → Workers & Pages → jobradar → Settings → Domains & Routes.
   Wait for the hostname/certificate to activate, then check the home page,
   `/api/dashboard`, `/backup/catalog.json`, the internship/fresher views and one
   refresh. Cloudflare creates the Custom Domain DNS record and certificate.

Alternative: add the Custom Domain using the Cloudflare dashboard, then set the
same GitHub variable before the next deployment so the route remains declared
in code. Adding a Worker domain requires an active zone you own; it cannot be
attached over an existing CNAME.

## Private browser data

Saved jobs, resumes, notes and application history are local to the browser origin.
A custom hostname starts a separate browser storage area. Before switching,
use Settings → Download private backup on the old address. Open Settings on the
new hostname and Restore backup. Verify saved jobs, resume and tracking before
clearing anything from the old address. Do not upload this private backup to GitHub.
The shared D1 job catalog stays on the same database.

Do not redirect or disable workers.dev during initial verification: collector,
recovery and deployment checks still use it. Once both addresses are verified,
any canonical redirect or scheduler-origin change is a separate scoped change.
Removing the GitHub variable alone is not a verified rollback of a domain binding;
remove the specific Custom Domain in Cloudflare if necessary, then verify the old
address. Keep the database and private browser backups.

Official reference:
https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
