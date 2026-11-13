# Project Context — JobRadar

## 1. Project overview
- **Product / service:** JobRadar — verified early-career jobs in Bengaluru and Hyderabad with browser-private application tracking.
- **Main user or business problem:** Eliminating fake, expired, and misclassified junior listings by validating direct employer posting evidence within 24 hours, strictly requiring 0–2 years experience (any upper bound) and target cities.
- **Current status:** Production / Active (`https://jobradar.chandanvura.workers.dev`).
- **Repository root:** `JobRadar-ux-improvements/`

## 2. Technology inventory
| Area | Technology/version | Evidence path or command | Notes |
|---|---|---|---|
| Language/runtime | Python 3.12, Node.js >=24.13.0 | `web/package.json`, `.github/workflows/ci.yml` | Strict Node version gate in `package.json` |
| Framework | React 19.3.1, Cloudflare Workers | `web/package.json` | Static client SPA + Edge Worker API |
| Build/package manager | Vite 8.3.4, npm | `web/package.json`, `web/scripts/build.mjs` | Builds client static assets and Worker script |
| Database/cache/queue | Cloudflare D1 (SQLite), Drizzle ORM 0.45.4 | `web/package.json`, `web/worker/d1-metrics.ts` | Local emulation via Miniflare |
| Frontend/styles | Tailwind CSS 4.3.3, Radix UI 1.8.1, Lucide 1.59.0 | `web/package.json`, `web/vendor/` | CSS bundle vendored and scoped |
| Cloud/hosting | Cloudflare Workers + D1 | `web/wrangler.jsonc`, `deploy-cloudflare.yml` | Edge compute, static asset hosting, D1 database |
| CI/CD | GitHub Actions (Ubuntu 24.04) | `.github/workflows/ci.yml` | Parallel Python and Web verification jobs |
| Observability | Telegram digest, D1 metrics, health endpoints | `scripts/ops-check.py`, `web/worker/d1-metrics.ts` | Independent cron health monitoring |

## 3. Architecture and execution flow
- **Entry points:**
  - Frontend SPA: `web/src/main.tsx` (served as static assets via Worker)
  - Edge Worker API: `web/worker/index.ts`
  - Python Scrapers: `scraper/engine.py`, `scripts/run-discovery.py`
- **Main modules/packages:**
  - `scraper/`: Employer board adapters (Workday, Taleo, SuccessFactors, Lever, Greenhouse, Eightfold, Avature, etc.)
  - `web/src/`: React client components (job list, details disclosure, private tracking)
  - `web/worker/`: Cloudflare Worker endpoints, catalog cache, D1 metrics
  - `companies/`: Employer registry configurations and board descriptors
- **Trust boundaries:**
  - Client side is private-only: Resumes, personal notes, saved jobs, and applications reside exclusively in browser `localStorage`.
  - Scraper output is sanitized: External HTML from job boards is parsed to text; no raw employer markup is injected into DOM.
  - Edge API authentication: Ingestion endpoints require pre-shared bearer token.

## 4. Data and API contracts
- **Important tables (D1):**
  - `jobs`: Verified job records (job ID, title, company, location, experience range, posting date, JD excerpt, URL, status).
  - `companies`: Registry of target employers and scraper adapter mappings.
  - `scan_runs`: Historical telemetry on extraction duration, failures, and yield.
- **Important API endpoints:**
  - `GET /api/jobs`: Public paginated listings filtered by city and verification status.
  - `POST /api/ingest`: Protected ingestion endpoint for scraper pipelines.
  - `GET /api/health`: Edge service operational status and D1 connectivity check.
- **Migrations & compatibility:**
  - Managed via Drizzle Kit (`drizzle-kit generate`) and Wrangler (`wrangler d1 migrations apply`).
  - Strict expand-and-contract rule; no destructive column renames on live D1.

## 5. Local development & verification commands
- **Prerequisites:** Python 3.12, Node.js >=24.13.0, npm.
- **Python Setup:**
  ```bash
  pip install -r requirements-dev.txt
  ```
- **Web Setup:**
  ```bash
  cd web && npm ci --no-audit --no-fund
  ```
- **Verification Harness (All-in-one):**
  ```bash
  bash scripts/verify-harness.sh all
  ```
- **Focused Checks:**
  - Python tests: `pytest -q`
  - Python security audit: `bandit -q -r scraper scripts`
  - Web tests: `cd web && npm test`
  - Worker/D1 integration: `cd web && npm run test:api`
  - Typecheck UI: `cd web && npm run typecheck:ui`
  - Lint: `cd web && npm run lint`

## 6. Conventions and decisions
- **Private Data Invariant:** No user application history, resumes, or preferences are sent to or stored in D1.
- **Deterministic Tests:** Tests avoid real network calls; fixtures and Miniflare mock environments are used.
- **Zero Hallucination:** A lack of matching jobs is an acceptable state; dates, experience ranges, and locations are never guessed or filled in.
