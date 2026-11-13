---
trigger: always_on
description: Security and privacy invariants for repository changes.
---
# Security and Privacy Invariants

- Treat all inputs from users, networks, files, databases and tools as untrusted.
- Never hardcode or reveal secrets. Do not copy `.env`, credentials, private keys, session cookies or production data into prompts, tests, logs or artifacts.
- Validate and authorize at trust boundaries; authentication is not authorization.
- Use parameterized database queries and safe output encoding. Avoid shell interpolation with untrusted strings.
- Apply least privilege to service accounts, MCP servers, CI tokens and database users.
- Avoid logging access tokens, passwords, payment details or sensitive personal data.
- Do not weaken TLS, authentication, authorization, CSP, CORS or sandbox settings to make a test pass without an explicit security-approved reason.
- Destructive operations, production access, deployment, data export and external write actions require explicit user approval.
- Report vulnerabilities with the affected path, impact, preconditions and a practical mitigation. Do not claim a clean security audit unless relevant checks actually ran.
