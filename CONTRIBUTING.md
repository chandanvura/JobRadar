# Contributing to JobRadar

JobRadar is maintained by [Chandan Vura](https://github.com/chandanvura).
Feature development is frozen as of 21 October 2026. Contributions are limited
to reproducible security vulnerabilities, data-loss risks and failures of
existing functionality. Small documentation corrections are welcome.

Read [README.md](README.md), [the readiness review](docs/READINESS-REVIEW.md)
and [maintenance scenarios](docs/MAINTENANCE.md) first. Check existing issues,
open PRs and current maintenance work before starting, including work by other
maintainers or agents. Avoid duplicate or conflicting repairs.

## Report problems

For ordinary bugs, open an issue with the affected revision, reproduction steps,
expected and actual behavior, and redacted evidence. Distinguish a local test
from a completed production scan. A successful CI or freshness-gate-only run
is not proof that an employer feed recovered.

Report vulnerabilities privately through the process in
[SECURITY.md](SECURITY.md). Do not include credentials, resumes, private browser
exports, application history or personal contact details in public reports.
This solo-maintained project has no guaranteed response SLA.

## Scope and correctness

- Keep the existing Python collectors, React/TypeScript frontend and Worker.
  Do not add companies, features, services, workflows or framework migrations.
- Public job browsing remains Bengaluru/Bangalore and Hyderabad only. Verified
  matches need employer posting evidence within 24 hours and explicit JD evidence
  compatible with 0–3 years. Unknown dates or conflicting experience stay reviewable.
- Keep source totals, unique IDs, full-detail and final-snapshot checks. Preserve
  prior source data on incomplete collection; never report failures as empty success.
- Preserve private application history, browser-storage compatibility and exports.
  Do not delete user data to resolve quota or storage failures.
- Respect provider access controls, rate limits and existing concurrency bounds.
  Do not bypass 403 responses, replay 429 responses or guess replacement endpoints.

## Local setup

Use Python 3.12, Node 24 LTS and npm. Bash and GNU `timeout` are needed for the
combined verification harness. From the repository root:

```sh
python -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements-dev.txt
cd web
npm ci --no-audit --no-fund
npm run build
npm run db:migrate:local
npm run dev
```

On Windows, activate the virtual environment with `.venv\Scripts\Activate.ps1`
in PowerShell, then run the Python/npm commands individually or use Bash for the
harness. Wrangler development binds to `127.0.0.1:8787` and uses the local database.
Optional UI hot reload is `npm run dev:ui` in a second terminal under `web`.
Use local fixtures and fake credentials. Never copy production secrets into tests.

## Verify a repair

First demonstrate the defect with a focused regression test; ensure it fails on
the previous implementation and passes with the repair. From the root:

```sh
bash scripts/verify-harness.sh python
bash scripts/verify-harness.sh web
```

The Python suite covers regression/fault tests, Bandit and runtime dependencies.
The web suite covers dependency audits, build, browser behavior, compiled Worker
with local D1, lint and UI types. See the harness for exact underlying commands.
These checks do not dispatch production scans, deploy or write production data.
Run checks relevant to the change; required GitHub `python` and `web` CI and
security checks must still pass. Documentation-only changes do not need invented
implementation tests. Check links and run `git diff --check`.

## Pull requests and release discipline

Use an isolated branch and a narrowly scoped PR. Explain the trigger, the fixed
behavior, reproduction/test evidence and remaining limits. Update documentation
when behavior changes. Keep generated output, secrets and unrelated refactors out.

The protected `main` branch requires a PR, successful `python` and `web` checks,
an up-to-date branch and resolved review conversations; it requires zero approvals
for solo maintenance. Do not weaken these protections or push directly to `main`.
Automation may prepare draft fixes; it must not merge, deploy, change protections
or perform destructive/production data operations. An owner-authorized release
uses the protected PR path and verifies the exact tested revision.

Do not manually dispatch scans or send test notifications to prove a repair.
Use naturally completed collection evidence for feed recovery. Leave provider
exceptions open until verified and retain backup/recovery schedules. Never claim
continuous uptime or a guaranteed maintenance-free operating period.

## License and attribution

Original JobRadar code is available under the [MIT License](LICENSE).
Contributions are submitted under that license. Retain existing third-party
licenses, copyright notices and attribution; the repository license does not
replace dependency or bundled-template licenses. Employer content and trademarks
remain subject to their respective owners' rights.
