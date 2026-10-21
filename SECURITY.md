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

## Public-clone boundary

This is a public repository: anyone can clone committed files and reachable Git
history. A license does not control visibility. GitHub/Cloudflare secret-store
values and private browser storage are not included in a clone. Keep deployment
credentials in those secret stores; use placeholders in `.env.example`. Never
put a real secret in a frontend bundle, public snapshot, issue, log or release asset.

Ignore rules exclude local environment variants, private-key files, local
databases, generated backup directories and private browser-export filenames.
They prevent accidental staging of untracked files; they do not remove existing
commits or block `git add -f`. Review `git diff --cached` before publishing. Preserve
tracked schema migrations and third-party license notices.

On 21 October 2026, GitHub's secret-scanning interface showed zero open and zero
closed alerts. A local pattern scan inspected 1,434 reachable history blobs
(26,352,436 bytes) at application/documentation base `24b64625f56ed9f783c3459463ce49afd9233681`.
Matches were reviewed as example placeholders and test credential URLs. This
is bounded pattern evidence, not a guarantee that every credential format or
external log/artifact/account has been audited. No real credential was identified
in that review. GitHub security policy, private reporting, Dependabot, code scanning
and secret scanning were visibly enabled.

If a real credential is ever exposed, revoke/rotate it first through the provider.
Deleting a file in a later commit does not revoke the credential or erase copies.
Do not post the value in an issue or attempt destructive history rewriting without
an owner-approved incident plan.
