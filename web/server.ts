import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  createJobRadarStore,
  parseCompaniesCsv,
  safeUrl,
  type RecordValue,
} from './lib/server-store.ts';
import {
  scrapeCompanyLive,
  type CompanyScrapeOutcome,
  type CompanyTarget,
} from './lib/ats-engine.ts';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const INGEST_SECRET = process.env.JOBRADAR_INGEST_SECRET || 'local-dev-ingest-secret';

const companiesCsvPath = fs.existsSync(path.join(__dirname, 'companies', 'companies.csv'))
  ? path.join(__dirname, 'companies', 'companies.csv')
  : path.join(__dirname, '..', 'companies', 'companies.csv');
const persistPath = fs.existsSync(path.join(__dirname, 'data'))
  ? path.join(__dirname, 'data', 'jobradar-state.json')
  : path.join(__dirname, '..', 'data', 'jobradar-state.json');
const nowIso = new Date().toISOString();
const companies = fs.existsSync(companiesCsvPath)
  ? parseCompaniesCsv(fs.readFileSync(companiesCsvPath, 'utf8'), nowIso)
  : [];

const store = createJobRadarStore({
  companies,
  seedJobs: true,
  ingestSecret: INGEST_SECRET,
  persistPath,
});

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const runWorker = async () => {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => runWorker()));
  return results;
}

function summarizeOutcome(
  o: CompanyScrapeOutcome,
  applied: { new_jobs: number; upgraded: boolean },
) {
  return {
    company: o.company,
    ats_provider: o.ats_provider,
    ats_identifier: o.ats_identifier,
    careers_url: o.careers_url,
    total_discovered: o.total_discovered,
    target_city_jobs: o.target_city_jobs,
    eligible_jobs: o.eligible_jobs,
    new_jobs: applied.new_jobs,
    upgraded: applied.upgraded,
    discovered_source: o.discovered_source || null,
    warning: o.warning,
    error: o.error,
    diagnostics: o.diagnostics,
    duration_ms: o.duration_ms,
  };
}

function isAuthorized(req: express.Request): boolean {
  const auth = req.headers.authorization;
  if (!auth) return false;
  const a = Buffer.from(auth, 'utf8');
  const b = Buffer.from(`Bearer ${INGEST_SECRET}`, 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

async function startServer() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '6mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.get('/api/health', (_req, res) => {
    const result = store.getHealth();
    res.setHeader('Cache-Control', 'no-store');
    res.status(result.status).json(result.body);
  });

  app.get('/api/dashboard', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.source === 'backup') {
      res.setHeader('X-JobRadar-Data-Mode', 'backup');
      return res.json(store.getBackupCatalog());
    }
    return res.json(store.getDashboard());
  });

  app.get('/api/jobs', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.query.source === 'backup') {
      const after = Number(req.query.after ?? '0');
      if (!Number.isSafeInteger(after) || after < 0) {
        return res.status(400).json({ error: 'Invalid cursor' });
      }
      res.setHeader('X-JobRadar-Data-Mode', 'backup');
      return res.json({ jobs: [], next_cursor: null, data_mode: 'backup' });
    }
    const result = store.getJobsPage({
      afterRaw: typeof req.query.after === 'string' ? req.query.after : undefined,
      limitRaw: typeof req.query.limit === 'string' ? req.query.limit : undefined,
      throughRaw: typeof req.query.through === 'string' ? req.query.through : undefined,
    });
    return res.status(result.status).json(result.body);
  });

  app.get('/backup/catalog.json', (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-JobRadar-Data-Mode', 'backup');
    return res.json(store.getBackupCatalog());
  });

  app.post('/api/companies/scrape', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const startedIso = new Date().toISOString();
    let targets: CompanyTarget[] = [];
    let batchMode: 'unproductive' | 'custom' | 'priority' | 'all' = 'unproductive';
    const excludeNames = new Set(
      Array.isArray(body.excludeNames)
        ? body.excludeNames
            .filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
            .map((n) => n.trim().toLowerCase())
        : [],
    );

    if (typeof body.name === 'string' && body.name.trim()) {
      const target = store.getCompanyTarget(body.name);
      if (!target) {
        return res.status(404).json({ error: `Company "${body.name.trim()}" not found` });
      }
      targets = [target];
    } else if (Array.isArray(body.names) && body.names.length > 0) {
      targets = body.names
        .filter((n): n is string => typeof n === 'string' && Boolean(n.trim()))
        .slice(0, 25)
        .map((n) => store.getCompanyTarget(n))
        .filter((t): t is CompanyTarget => Boolean(t));
      if (!targets.length) {
        return res.status(404).json({ error: 'No matching companies found' });
      }
    } else {
      const modeRaw = typeof body.mode === 'string' ? body.mode : 'unproductive';
      batchMode = (['unproductive', 'custom', 'priority', 'all'].includes(modeRaw)
        ? modeRaw
        : 'unproductive') as 'unproductive' | 'custom' | 'priority' | 'all';
      const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));
      targets = store.listScrapeTargets(batchMode, limit, excludeNames);
    }

    const outcomes = await mapWithConcurrency(targets, 4, (t) => scrapeCompanyLive(t));
    const single = outcomes.length === 1 && !Array.isArray(body.excludeNames);
    const applied = outcomes.map((o) => store.applyCompanyScrape(o, single));
    const newJobsTotal = applied.reduce((sum, a) => sum + a.new_jobs, 0);
    if (!single && outcomes.length > 0) {
      store.recordBatchRun(outcomes, newJobsTotal, startedIso);
    }

    for (const o of outcomes) excludeNames.add(o.company.trim().toLowerCase());
    const remaining =
      typeof body.name === 'string' && body.name.trim()
        ? 0
        : store.countScrapeTargets(batchMode, excludeNames);

    return res.json({
      outcomes: outcomes.map((o, i) => summarizeOutcome(o, applied[i])),
      summary: {
        scanned: outcomes.length,
        remaining,
        upgraded: applied.filter((a) => a.upgraded).length,
        total_discovered: outcomes.reduce((s, o) => s + o.total_discovered, 0),
        target_jobs: outcomes.reduce((s, o) => s + o.target_city_jobs, 0),
        eligible_jobs: outcomes.reduce((s, o) => s + o.eligible_jobs, 0),
        new_jobs: newJobsTotal,
      },
    });
  });

  app.post('/api/companies/probe', async (req, res) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const existing = name ? store.getCompanyTarget(name) : null;
    if (name && !existing && typeof body.careers_url !== 'string') {
      return res.status(404).json({ error: `Company "${name}" not found` });
    }

    const rawUrl = typeof body.careers_url === 'string' && body.careers_url.trim()
      ? body.careers_url.trim()
      : existing?.careers_url || '';
    const validUrl = safeUrl(rawUrl);
    if (!validUrl) {
      return res.status(400).json({ error: 'Valid https:// careers URL is required' });
    }

    const requestedProvider = typeof body.ats_provider === 'string' ? body.ats_provider.trim().toLowerCase() : '';
    const forceDiscovery = !requestedProvider || requestedProvider === 'auto';
    const target: CompanyTarget = {
      name: existing?.name || name || new URL(validUrl).hostname,
      careers_url: validUrl,
      ats_provider: forceDiscovery ? 'custom' : requestedProvider,
      ats_identifier: forceDiscovery
        ? undefined
        : typeof body.ats_identifier === 'string'
          ? body.ats_identifier.trim() || undefined
          : existing?.ats_identifier,
      priority: existing?.priority ?? 4,
    };

    const outcome = await scrapeCompanyLive(target);
    const shouldApply = body.apply !== false && Boolean(name || existing);
    const applied = shouldApply
      ? store.applyCompanyScrape(outcome, true)
      : { new_jobs: 0, upgraded: Boolean(outcome.discovered_source) };

    return res.json({
      outcome: summarizeOutcome(outcome, applied),
      jobs: outcome.jobs.slice(0, 60),
    });
  });

  const handleUpsertCompany = async (req: express.Request, res: express.Response) => {
    const body = (req.body || {}) as Record<string, unknown>;
    const saved = store.upsertCompany({
      name: body.name,
      careers_url: body.careers_url,
      ats_provider: body.ats_provider,
      ats_identifier: body.ats_identifier,
      priority: body.priority,
    });
    if (saved.status !== 200 || !('company' in saved.body)) {
      return res.status(saved.status).json(saved.body);
    }

    let scrapeSummary = null;
    if (body.scrape) {
      const target = store.getCompanyTarget(saved.body.company.name);
      if (target) {
        const outcome = await scrapeCompanyLive(target);
        const applied = store.applyCompanyScrape(outcome, true);
        scrapeSummary = summarizeOutcome(outcome, applied);
      }
    }

    return res.json({
      company: store.getCompanyTarget(saved.body.company.name)
        ? store.getCompanyJobs(saved.body.company.name).company
        : saved.body.company,
      scrape: scrapeSummary,
    });
  };

  app.post('/api/companies', handleUpsertCompany);
  app.patch('/api/companies', handleUpsertCompany);

  app.get('/api/companies/:name/jobs', (req, res) => {
    const name = decodeURIComponent(req.params.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Company name is required' });
    const result = store.getCompanyJobs(name);
    if (!result.company && result.ingested_jobs.length === 0) {
      return res.status(404).json({ error: `Company "${name}" not found` });
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.json(result);
  });

  app.post('/api/ingest', (req, res) => {
    if (!isAuthorized(req)) {
      res.setHeader('WWW-Authenticate', 'Bearer');
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = store.ingest(req.body as RecordValue);
    return res.status(result.status).json(result.body);
  });

  app.post('/api/notifications', (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const result = store.recordNotification(req.body as RecordValue);
    return res.status(result.status).json(result.body);
  });

  app.patch('/api/jobs/:id/status', (_req, res) => {
    return res.status(410).json({ error: 'Personal tracking is stored privately in this browser' });
  });

  app.all('/api/{*splat}', (_req, res) => {
    return res.status(404).json({ error: 'Not found' });
  });

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err) {
      return res.status(400).json({ error: 'Invalid JSON' });
    }
    if (typeof err === 'object' && err !== null && 'type' in err && (err as { type?: string }).type === 'entity.too.large') {
      return res.status(413).json({ error: 'Payload too large' });
    }
    return next(err);
  });

  if (process.env.NODE_ENV === 'production') {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`JobRadar listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
