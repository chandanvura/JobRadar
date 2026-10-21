# Security policy

JobRadar supports the latest deployed `main` revision. Older branches and saved
catalog snapshots do not receive independent security updates.

## Report a vulnerability privately

Use **Security → Advisories → Report a vulnerability** on this repository:
https://github.com/chandanvura/JobRadar/security

Include the affected revision, a minimal reproduction, expected impact and a
redacted request/response if useful. Never post credentials, private application
history, resumes, personal contact data, or exploit payloads in a public issue.
There is no guaranteed response SLA for this solo-maintained project.

## Security boundaries

- Browsing public jobs is anonymous. Ingestion and notification writes require
  a server-held bearer secret. A workspace URL is not an authenticated account.
- Preferences, resumes and application history remain in browser storage.
  Export a private backup before clearing storage. On shared computers use a
  separate browser profile; local workspace names are not an access control.
- Employer descriptions are untrusted and displayed as React text, never HTML.
  HTML-to-text helpers are evidence extractors, not safe-HTML sanitizers.
- Keep tokens in GitHub/Cloudflare secret stores. Never put tokens in URLs,
  source, screenshots or issue logs. Revoke any exposed credential immediately.
- CodeQL, dependency and secret alerts support review; a passing scan does not
  prove the absence of vulnerabilities. Required PR CI cannot be bypassed.
- No unreviewed automated merges, destructive data recovery, or new employer
  source activation. Dependencies are locked and updated through tested PRs.

SQL backup artifacts contain database data. Restrict artifact access and avoid
publishing them. Public static snapshots contain only the public job catalogue;
they must never contain private browser exports or credentials.
