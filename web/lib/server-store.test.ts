import test from 'node:test';
import assert from 'node:assert/strict';
import { createJobRadarStore, parseCompaniesCsv, safeUrl } from './server-store';

test('safeUrl normalizes legacy workday http URLs and rejects unsafe schemes', () => {
  assert.equal(
    safeUrl('http://bakerhughes.wd5.myworkdayjobs.com/BakerHughes/userHome/'),
    'https://bakerhughes.wd5.myworkdayjobs.com/BakerHughes/userHome/',
  );
  assert.equal(safeUrl('http://unsafe.example/careers'), null);
  assert.equal(safeUrl('javascript:alert(1)'), null);
  assert.equal(safeUrl('https://jobs.lever.co/hevodata/123'), 'https://jobs.lever.co/hevodata/123');
});

test('parseCompaniesCsv parses enabled companies and skips disabled rows', () => {
  const csv = [
    'company_name,careers_url,ats_provider,ats_identifier,priority,enabled',
    'Postman,https://postman.wd108.myworkdayjobs.com/careers,workday_complete,postman|careers,5,true',
    'DisabledCo,https://disabled.example/jobs,custom,disabled,2,false',
  ].join('\n');

  const companies = parseCompaniesCsv(csv, '2026-11-14T12:00:00Z');
  assert.equal(companies.length, 1);
  assert.equal(companies[0].name, 'Postman');
  assert.equal(companies[0].priority, 5);
});

test('seeded store provides Bengaluru and Hyderabad jobs, companies, and healthy status', () => {
  const fixedNow = Date.parse('2026-11-14T12:00:00Z');
  const store = createJobRadarStore({
    seedJobs: true,
    ingestSecret: 'test-secret',
    now: () => fixedNow,
  });

  const dashboard = store.getDashboard();
  assert.ok(dashboard.jobs.length >= 10);
  assert.ok(dashboard.jobs.some((j) => j.city === 'Bengaluru' && j.is_eligible === 1));
  assert.ok(dashboard.jobs.some((j) => j.city === 'Hyderabad' && j.is_eligible === 1));
  assert.ok(dashboard.latest_run);
  assert.equal(store.getHealth().status, 200);
});

test('getJobsPage validates cursor, range, and limit parameters', () => {
  const store = createJobRadarStore({ seedJobs: true });
  assert.equal(store.getJobsPage({ afterRaw: '-1' }).status, 400);
  assert.equal(store.getJobsPage({ limitRaw: '0' }).status, 400);
  assert.equal(store.getJobsPage({ limitRaw: '501' }).status, 400);
  assert.equal(store.getJobsPage({ afterRaw: '5', throughRaw: '3' }).status, 400);
  const page = store.getJobsPage({ afterRaw: '0', limitRaw: '5' });
  assert.equal(page.status, 200);
  assert.equal((page.body as { jobs: unknown[] }).jobs.length, 5);
});

test('ingest validates URLs, upserts case-insensitively, and enforces finalization manifests', () => {
  const store = createJobRadarStore({ ingestSecret: 'local-secret' });
  const job = {
    company: 'Example',
    ats_provider: 'workday',
    external_job_id: 'REQ-1',
    title: 'Java Engineer',
    job_url: 'https://example.test/job/1',
    application_url: 'https://example.test/job/1',
    career_page_url: 'https://example.test/careers',
    city: 'Bengaluru',
    location: 'Bengaluru',
    normalized_location: 'Bengaluru',
    role_category: 'Java / Backend',
    is_eligible: true,
    skills: ['Java'],
  };

  const first = store.ingest({ jobs: [job] });
  assert.equal(first.status, 200);
  assert.equal((first.body as { accepted: number }).accepted, 1);

  const duplicate = store.ingest({ jobs: [{ ...job, company: 'example', description: 'Updated' }] });
  assert.equal(duplicate.status, 200);
  assert.equal(store.getDashboard().jobs.length, 1);
  assert.equal(store.getDashboard().jobs[0].description, 'Updated');

  const badManifest = store.ingest({ run: { successful_companies: ['Example'] } });
  assert.equal(badManifest.status, 400);

  const finalized = store.ingest({
    run: {
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      companies_checked: 1,
      companies_successful: 1,
      companies_failed: 0,
      status: 'success',
      successful_companies: ['Example'],
      seen_job_keys: [],
    },
  });
  assert.equal(finalized.status, 200);
  assert.equal(store.getDashboard().jobs.length, 0);
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

test('store preserves ats_identifier, applies live scrapes, upserts sources, and persists to disk', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jobradar-store-'));
  const persistPath = path.join(tmpDir, 'state.json');

  try {
    const csvCompanies = parseCompaniesCsv(
      [
        'company_name,careers_url,ats_provider,ats_identifier,priority,enabled',
        'CustomCo,https://customco.example/careers,custom,,5,true',
        'StructuredCo,https://boards.greenhouse.io/structured,greenhouse,structured,4,true',
      ].join('\n'),
      '2026-11-14T12:00:00Z',
    );
    assert.equal(csvCompanies[1].ats_identifier, 'structured');

    const store = createJobRadarStore({
      companies: csvCompanies,
      persistPath,
      now: () => Date.parse('2026-11-14T12:05:00Z'),
    });

    const targets = store.listScrapeTargets('custom', 10);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].name, 'CustomCo');

    const outcome = {
      company: 'CustomCo',
      ats_provider: 'greenhouse',
      ats_identifier: 'customco',
      careers_url: 'https://boards.greenhouse.io/customco',
      total_discovered: 2,
      target_city_jobs: 1,
      eligible_jobs: 1,
      discovered_source: {
        ats_provider: 'greenhouse',
        ats_identifier: 'customco',
        careers_url: 'https://boards.greenhouse.io/customco',
        method: 'html-embed',
      },
      jobs: [
        {
          external_job_id: 'gh-1',
          company: 'CustomCo',
          title: 'Backend Engineer I',
          normalized_title: 'backend engineer i',
          role_category: 'Java / Backend',
          location: 'Bengaluru, India',
          normalized_location: 'Bengaluru',
          city: 'Bengaluru',
          employment_type: 'Full-time',
          experience_min: 0,
          experience_max: 2,
          experience_label: '0–2',
          description: 'Java Spring Boot 0-2 years',
          skills: ['Java', 'Spring Boot'],
          ats_provider: 'greenhouse',
          source: 'greenhouse',
          job_url: 'https://boards.greenhouse.io/customco/jobs/1',
          application_url: 'https://boards.greenhouse.io/customco/jobs/1',
          career_page_url: 'https://boards.greenhouse.io/customco',
          posted_at: '2026-11-14T11:30:00Z',
          posted_label: null,
          posted_precision: 'exact' as const,
          reported_age_hours: 0.5,
          first_seen_at: '2026-11-14T12:05:00Z',
          last_seen_at: '2026-11-14T12:05:00Z',
          is_eligible: true,
          eligibility_reason: '',
          relevance_score: 90,
          freshness_score: 95,
          priority_score: 92,
          hiring_signal: null,
        },
        {
          external_job_id: 'gh-2',
          company: 'CustomCo',
          title: 'Sales Lead',
          normalized_title: 'sales lead',
          role_category: 'Other',
          location: 'London, UK',
          normalized_location: 'London, UK',
          city: null,
          employment_type: 'Full-time',
          experience_min: null,
          experience_max: null,
          experience_label: 'Unknown',
          description: 'Enterprise sales',
          skills: [],
          ats_provider: 'greenhouse',
          source: 'greenhouse',
          job_url: 'https://boards.greenhouse.io/customco/jobs/2',
          application_url: 'https://boards.greenhouse.io/customco/jobs/2',
          career_page_url: 'https://boards.greenhouse.io/customco',
          posted_at: '2026-11-14T11:30:00Z',
          posted_label: null,
          posted_precision: 'exact' as const,
          reported_age_hours: 0.5,
          first_seen_at: '2026-11-14T12:05:00Z',
          last_seen_at: '2026-11-14T12:05:00Z',
          is_eligible: false,
          eligibility_reason: 'Outside target locations',
          relevance_score: 40,
          freshness_score: 95,
          priority_score: 60,
          hiring_signal: null,
        },
      ],
      warning: null,
      error: null,
      diagnostics: ['Detected greenhouse (customco)'],
      duration_ms: 120,
    };

    const applied = store.applyCompanyScrape(outcome, true);
    assert.equal(applied.upgraded, true);
    assert.equal(applied.new_jobs, 1);
    assert.equal(applied.company.ats_provider, 'greenhouse');
    assert.equal(applied.company.ats_identifier, 'customco');
    assert.equal(store.getDashboard().jobs.length, 1);

    const inspected = store.getCompanyJobs('CustomCo');
    assert.equal(inspected.ingested_jobs.length, 1);
    assert.equal(inspected.fetched_jobs.length, 2);
    assert.equal(inspected.diagnostics[0], 'Detected greenhouse (customco)');

    const badUpsert = store.upsertCompany({ name: 'Bad', careers_url: 'javascript:alert(1)' });
    assert.equal(badUpsert.status, 400);

    // Cross-provider migration with identical normalized_title + city updates in place (no duplicate)
    const migratedOutcome = {
      ...outcome,
      ats_provider: 'phenom',
      ats_identifier: 'customco-ph',
      jobs: outcome.jobs.slice(0, 1).map((j) => ({
        ...j,
        external_job_id: 'ph-new-99',
        ats_provider: 'phenom',
        source: 'phenom',
      })),
    };
    const migratedApplied = store.applyCompanyScrape(migratedOutcome, false, false);
    assert.equal(migratedApplied.new_jobs, 0);
    const fullDash = store.getFullDashboard();
    assert.equal(fullDash.jobs.length, 1);
    assert.equal(fullDash.catalog_ranges, undefined);
    assert.equal((fullDash.jobs[0] as { experience_normalized?: boolean }).experience_normalized, true);
    assert.ok((fullDash.jobs[0] as { precomputed_requirements?: unknown }).precomputed_requirements);
    assert.equal(store.getCompanies().companies.length, 2);
    assert.ok(store.getJobById(fullDash.jobs[0].id));

    store.flushPersist();

    const reloaded = createJobRadarStore({
      companies: csvCompanies,
      persistPath,
    });
    const reloadedTarget = reloaded.getCompanyTarget('CustomCo');
    assert.equal(reloadedTarget?.ats_provider, 'phenom');
    assert.equal(reloadedTarget?.ats_identifier, 'customco-ph');
    assert.equal(reloaded.getDashboard().jobs.length, 1);
    const remainingAll = store.countScrapeTargets('all');
    assert.equal(remainingAll, 2);
    const excludeSet = new Set(['customco']);
    assert.equal(store.countScrapeTargets('all', excludeSet), 1);
    const nextTargets = store.listScrapeTargets('all', 10, excludeSet);
    assert.equal(nextTargets.length, 1);
    assert.equal(nextTargets[0].name, 'StructuredCo');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('CI dataset invariants: companies/companies.csv and config/roles.json remain valid', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const csvPath = fs.existsSync(path.resolve(process.cwd(), 'companies/companies.csv'))
    ? path.resolve(process.cwd(), 'companies/companies.csv')
    : path.resolve(process.cwd(), '../companies/companies.csv');
  const parsed = parseCompaniesCsv(fs.readFileSync(csvPath, 'utf8'), '2026-11-14T12:00:00Z');
  assert.ok(parsed.length >= 500, `Expected >= 500 enabled companies, got ${parsed.length}`);
  const uniqueNames = new Set(parsed.map((c) => c.name.trim().toLowerCase()));
  assert.equal(uniqueNames.size, parsed.length, 'Company names in companies.csv must be unique');

  const rolesPath = fs.existsSync(path.resolve(process.cwd(), 'config/roles.json'))
    ? path.resolve(process.cwd(), 'config/roles.json')
    : path.resolve(process.cwd(), '../config/roles.json');
  const roles = JSON.parse(fs.readFileSync(rolesPath, 'utf8')) as {
    roles?: Array<{ family: string; patterns: string[]; titles: string[] }>;
    review_titles?: string[];
  };
  assert.ok(Array.isArray(roles.roles) && roles.roles.length >= 10);
  assert.ok(roles.roles.every((r) => typeof r.family === 'string' && Array.isArray(r.patterns) && Array.isArray(r.titles)));
  assert.ok(Array.isArray(roles.review_titles) && roles.review_titles.length > 0);
});


