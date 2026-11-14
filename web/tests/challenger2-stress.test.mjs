import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {
  canonicalShortlistCity,
  enforceShortlistLocation,
  locationMatches,
  shortlistLocation,
  shortlistCities
} from '../lib/location-policy.ts';
import {loadPublicCatalog} from '../lib/public-catalog.ts';

// ============================================================================
// SUITE 1: LOCATION NORMALIZATION & ALIAS HANDLING ADVERSARIAL STRESS
// ============================================================================

test('CHALLENGER 2: location normalization handles adversarial and weird inputs', () => {
  // 1. Whitespace padding variants
  assert.equal(canonicalShortlistCity({city: '   Bengaluru   '}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: '\t\nHyderabad\r\n '}), 'Hyderabad');
  assert.equal(canonicalShortlistCity({city: '   Bangalore \t '}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: '   \t\n  '}), null);

  // 2. Complex and delimited location strings
  assert.equal(canonicalShortlistCity({city: 'bangalore / remote'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: 'hybrid - hyderabad'}), 'Hyderabad');
  assert.equal(canonicalShortlistCity({city: 'BENGALURU, INDIA'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: 'Bengaluru - Whitefield, India'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: 'Hyderabad | HITEC City'}), 'Hyderabad');
  assert.equal(canonicalShortlistCity({city: 'Bengaluru (Karnataka)'}), 'Bengaluru');

  // 3. Mixed and extreme casing
  assert.equal(canonicalShortlistCity({city: 'bAnGaLoRe'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: 'HYDERABAD'}), 'Hyderabad');
  assert.equal(canonicalShortlistCity({city: 'bEnGaLuRu'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: 'hYdErAbAd'}), 'Hyderabad');

  // 4. Null / undefined / empty city falling back to normalized_location or location
  assert.equal(canonicalShortlistCity({city: null, normalized_location: 'Bangalore / remote'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: undefined, location: 'hybrid - hyderabad'}), 'Hyderabad');
  assert.equal(canonicalShortlistCity({city: '', normalized_location: 'BENGALURU, INDIA'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: '   ', location: 'Hyderabad, India'}), 'Hyderabad');
  assert.equal(canonicalShortlistCity({city: null, location: null, normalized_location: null}), null);
  assert.equal(canonicalShortlistCity({}), null);

  // 5. Non-string types safely handled
  assert.equal(canonicalShortlistCity({city: 12345, location: 'Bengaluru, India'}), 'Bengaluru');
  assert.equal(canonicalShortlistCity({city: null, location: 99999}), null);

  // 6. Foreign traps and non-shortlist exclusion
  assert.equal(canonicalShortlistCity({city: 'Hyderabad', location: 'Hyderabad, Sindh, Pakistan'}), null);
  assert.equal(canonicalShortlistCity({city: 'Bangalore', location: 'Bangalore, CA, USA'}), null);
  assert.equal(canonicalShortlistCity({city: 'Bengaluru', location: 'Bengaluru, Singapore'}), null);
  assert.equal(canonicalShortlistCity({city: 'Hyderabad', location: 'Hyderabad, Canada'}), null);
  assert.equal(canonicalShortlistCity({city: 'Other India', normalized_location: 'Bengaluru'}), null);
  assert.equal(canonicalShortlistCity({city: 'Remote (India)', normalized_location: 'Hyderabad'}), null);
  assert.equal(canonicalShortlistCity({city: 'Pune'}), null);
  assert.equal(canonicalShortlistCity({city: 'Chennai'}), null);
  assert.equal(canonicalShortlistCity({city: 'Mumbai'}), null);

  // 7. Substring lures (word boundary enforcement)
  assert.equal(canonicalShortlistCity({city: 'NewBangaloreCity'}), null);
  assert.equal(canonicalShortlistCity({city: 'OldHyderabadTown'}), null);
});

test('CHALLENGER 2: enforceShortlistLocation guarantees canonical city and eligibility gating', () => {
  // Shortlist aliases must receive canonical city and preserve eligibility
  const b1 = enforceShortlistLocation({city: 'bangalore / remote', is_eligible: 1});
  assert.equal(b1.city, 'Bengaluru');
  assert.equal(b1.is_eligible, 1);

  const h1 = enforceShortlistLocation({city: 'hybrid - hyderabad', is_eligible: 1});
  assert.equal(h1.city, 'Hyderabad');
  assert.equal(h1.is_eligible, 1);

  const b2 = enforceShortlistLocation({city: 'BENGALURU, INDIA', is_eligible: 1});
  assert.equal(b2.city, 'Bengaluru');
  assert.equal(b2.is_eligible, 1);

  const b3 = enforceShortlistLocation({city: null, normalized_location: 'Bangalore', is_eligible: 1});
  assert.equal(b3.city, 'Bengaluru');
  assert.equal(b3.is_eligible, 1);

  // Outside locations must have eligibility revoked
  const nonEligible = enforceShortlistLocation({city: 'Pune', is_eligible: 1});
  assert.equal(nonEligible.city, 'Pune');
  assert.equal(nonEligible.is_eligible, 0);
  assert.match(nonEligible.eligibility_reason, /Outside shortlist cities/);

  const foreign = enforceShortlistLocation({city: 'Hyderabad', location: 'Hyderabad, Pakistan', is_eligible: 1});
  assert.equal(foreign.is_eligible, 0);
});

test('CHALLENGER 2: locationMatches prevents cross-city leakage in UI', () => {
  const blrJob = {city: 'Bengaluru', normalized_location: 'Bangalore / Remote'};
  assert.equal(locationMatches(blrJob, 'Bengaluru'), true);
  assert.equal(locationMatches(blrJob, 'Hyderabad'), false);

  const hydJob = {city: 'Hyderabad', normalized_location: 'Hybrid - Hyderabad'};
  assert.equal(locationMatches(hydJob, 'Hyderabad'), true);
  assert.equal(locationMatches(hydJob, 'Bengaluru'), false);
});

// ============================================================================
// SUITE 2, 3, 4: MINIFLARE INTEGRATION STRESS TEST
// (Ingestion Normalization, Casing Deactivation, Multi-ATS, Inactive Job Suppression, D1 Query Filtering)
// ============================================================================

const serverRoot = new URL('../dist/server/', import.meta.url);
const modulePaths = ['index.js', ...(await readdir(serverRoot, {recursive: true})).filter(path => path.endsWith('.js') && path !== 'index.js')];
const modules = modulePaths.map(path => ({type: 'ESModule', path: fileURLToPath(new URL(path, serverRoot))}));
const saved = {version: 1, data_mode: 'backup', snapshot_at: new Date().toISOString(), jobs: [{id: 999, title: 'Backup fixture'}], companies: []};

test('CHALLENGER 2 ADVERSARIAL INTEGRATION: location ingestion, deactivation casing, multi-ats, inactive suppression, and D1 filtering', async () => {
  const mf = new Miniflare({
    workers: [{
      name: 'jobradar-challenger2-stress',
      modules,
      modulesRoot: fileURLToPath(new URL('../dist/server/', import.meta.url)),
      scriptPath: fileURLToPath(new URL('../dist/server/index.js', import.meta.url)),
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: {DB: 'challenger2-db'},
      bindings: {JOBRADAR_INGEST_SECRET: 'challenger2-secret'},
      serviceBindings: {
        ASSETS: async request => new URL(request.url).pathname === '/backup/catalog.json'
          ? Response.json(saved)
          : new Response(await readFile(new URL('../dist/client/index.html', import.meta.url)), {headers: {'Content-Type': 'text/html'}})
      }
    }]
  });

  try {
    const db = await mf.getD1Database('DB');
    const dir = new URL('../drizzle/', import.meta.url);
    for (const file of (await readdir(dir)).filter(p => p.endsWith('.sql')).sort()) {
      for (const statement of (await readFile(new URL(file, dir), 'utf8')).split('--> statement-breakpoint')) {
        if (statement.trim()) await db.prepare(statement).run();
      }
    }

    const post = async (path, body) => mf.dispatchFetch(`https://challenger2.example${path}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer challenger2-secret'},
      body: JSON.stringify(body)
    });
    const get = async (path, headers = {}) => mf.dispatchFetch(`https://challenger2.example${path}`, {headers});

    // -------------------------------------------------------------------------
    // 1. INGESTION WITH WEIRD LOCATION STRINGS
    // -------------------------------------------------------------------------
    const weirdJobs = [
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-1',
        title: 'Backend Dev 1',
        job_url: 'https://alpha.test/1',
        application_url: 'https://alpha.test/1',
        career_page_url: 'https://alpha.test/careers',
        city: 'bangalore / remote',
        location: 'Bangalore / Remote',
        normalized_location: 'Bangalore',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 95
      },
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-2',
        title: 'Backend Dev 2',
        job_url: 'https://alpha.test/2',
        application_url: 'https://alpha.test/2',
        career_page_url: 'https://alpha.test/careers',
        city: 'hybrid - hyderabad',
        location: 'Hybrid - Hyderabad',
        normalized_location: 'Hyderabad',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 94
      },
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-3',
        title: 'Backend Dev 3',
        job_url: 'https://alpha.test/3',
        application_url: 'https://alpha.test/3',
        career_page_url: 'https://alpha.test/careers',
        city: 'BENGALURU, INDIA',
        location: 'Bengaluru, India',
        normalized_location: 'Bengaluru',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 93
      },
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-4',
        title: 'Backend Dev 4',
        job_url: 'https://alpha.test/4',
        application_url: 'https://alpha.test/4',
        career_page_url: 'https://alpha.test/careers',
        city: '   Bengaluru \t\n  ',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 92
      },
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-5',
        title: 'Backend Dev 5',
        job_url: 'https://alpha.test/5',
        application_url: 'https://alpha.test/5',
        career_page_url: 'https://alpha.test/careers',
        city: null,
        location: 'Bangalore, Karnataka, India',
        normalized_location: 'Bangalore',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 91
      },
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-6',
        title: 'Backend Dev 6',
        job_url: 'https://alpha.test/6',
        application_url: 'https://alpha.test/6',
        career_page_url: 'https://alpha.test/careers',
        city: '',
        location: 'Hyderabad - HiTech City, India',
        normalized_location: 'Hyderabad',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 90
      },
      // Non-shortlist job
      {
        company: 'Alpha Corp',
        ats_provider: 'workday',
        external_job_id: 'LOC-7-PUNE',
        title: 'Backend Dev 7',
        job_url: 'https://alpha.test/7',
        application_url: 'https://alpha.test/7',
        career_page_url: 'https://alpha.test/careers',
        city: 'Pune',
        location: 'Pune, Maharashtra',
        normalized_location: 'Pune',
        role_category: 'Java / Backend',
        is_eligible: 1,
        relevance_score: 80
      }
    ];

    const ingestRes = await post('/api/ingest', {jobs: weirdJobs});
    assert.equal(ingestRes.status, 200);
    const ingestBody = await ingestRes.json();
    assert.equal(ingestBody.accepted, 7);

    // Verify D1 records: Jobs 1-6 are canonical Bengaluru / Hyderabad and is_eligible = 1
    const d1Loc1 = await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='LOC-1'").first();
    assert.equal(d1Loc1.city, 'Bengaluru');
    assert.equal(d1Loc1.is_eligible, 1);

    const d1Loc2 = await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='LOC-2'").first();
    assert.equal(d1Loc2.city, 'Hyderabad');
    assert.equal(d1Loc2.is_eligible, 1);

    const d1Loc3 = await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='LOC-3'").first();
    assert.equal(d1Loc3.city, 'Bengaluru');
    assert.equal(d1Loc3.is_eligible, 1);

    const d1Loc4 = await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='LOC-4'").first();
    assert.equal(d1Loc4.city, 'Bengaluru');
    assert.equal(d1Loc4.is_eligible, 1);

    const d1Loc5 = await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='LOC-5'").first();
    assert.equal(d1Loc5.city, 'Bengaluru');
    assert.equal(d1Loc5.is_eligible, 1);

    const d1Loc6 = await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='LOC-6'").first();
    assert.equal(d1Loc6.city, 'Hyderabad');
    assert.equal(d1Loc6.is_eligible, 1);

    // LOC-7-PUNE must have is_eligible = 0
    const d1Loc7 = await db.prepare("SELECT city, is_eligible, eligibility_reason FROM jobs WHERE external_job_id='LOC-7-PUNE'").first();
    assert.equal(d1Loc7.is_eligible, 0);
    assert.match(d1Loc7.eligibility_reason, /Outside shortlist cities/);

    // -------------------------------------------------------------------------
    // 2. DEACTIVATION QUERY CASING, SPECIAL CHARS & MULTI-ATS PROVIDERS
    // -------------------------------------------------------------------------
    const multiAtsJobs = [
      // Company MICROSOFT in UPPERCASE
      {
        company: 'MICROSOFT',
        ats_provider: 'workday',
        external_job_id: 'MS-WD-KEEP',
        title: 'MS Engineer 1',
        job_url: 'https://ms.test/1',
        application_url: 'https://ms.test/1',
        career_page_url: 'https://ms.test/careers',
        city: 'Bengaluru',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Software Engineering',
        is_eligible: 1
      },
      {
        company: 'MICROSOFT',
        ats_provider: 'workday',
        external_job_id: 'MS-WD-REMOVE',
        title: 'MS Engineer 2',
        job_url: 'https://ms.test/2',
        application_url: 'https://ms.test/2',
        career_page_url: 'https://ms.test/careers',
        city: 'Bengaluru',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Software Engineering',
        is_eligible: 1
      },
      // Same company on greenhouse (multi-ATS)
      {
        company: 'microsoft',
        ats_provider: 'greenhouse',
        external_job_id: 'MS-GH-KEEP',
        title: 'MS Engineer 3',
        job_url: 'https://ms.test/3',
        application_url: 'https://ms.test/3',
        career_page_url: 'https://ms.test/careers',
        city: 'Hyderabad',
        location: 'Hyderabad',
        normalized_location: 'Hyderabad',
        role_category: 'Software Engineering',
        is_eligible: 1
      },
      // Company with apostrophe and accents
      {
        company: "L'Oréal R&D",
        ats_provider: 'smartrecruiters',
        external_job_id: 'LOR-KEEP',
        title: 'Research Chemist',
        job_url: 'https://loreal.test/1',
        application_url: 'https://loreal.test/1',
        career_page_url: 'https://loreal.test/careers',
        city: 'Bengaluru',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Other',
        is_eligible: 1
      },
      {
        company: "L'Oréal R&D",
        ats_provider: 'smartrecruiters',
        external_job_id: 'LOR-REMOVE',
        title: 'Research Chemist 2',
        job_url: 'https://loreal.test/2',
        application_url: 'https://loreal.test/2',
        career_page_url: 'https://loreal.test/careers',
        city: 'Bengaluru',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Other',
        is_eligible: 1
      },
      // Company with plus signs and commas
      {
        company: 'C++ Systems, LLC',
        ats_provider: 'workday',
        external_job_id: 'CPP-REMOVE',
        title: 'Systems Programmer',
        job_url: 'https://cpp.test/1',
        application_url: 'https://cpp.test/1',
        career_page_url: 'https://cpp.test/careers',
        city: 'Hyderabad',
        location: 'Hyderabad',
        normalized_location: 'Hyderabad',
        role_category: 'Software Engineering',
        is_eligible: 1
      }
    ];

    const ingestMulti = await post('/api/ingest', {jobs: multiAtsJobs});
    assert.equal(ingestMulti.status, 200);

    // Initial read to populate edge cache before deactivation run
    const preDash = await (await get('/api/dashboard')).json();
    assert.ok(preDash.jobs.some(j => j.external_job_id === 'MS-WD-REMOVE'));

    // Cache should hit on subsequent GET
    const preDashCached = await get('/api/dashboard');
    assert.equal(preDashCached.headers.get('X-JobRadar-Catalog-Cache'), 'hit');

    // Run finalization scan:
    // - successful_companies in lowercase: ['microsoft', "l'oréal r&d", 'c++ systems, llc']
    // - seen_job_keys keeps:
    //     'microsoft\x1fworkday\x1fMS-WD-KEEP'
    //     'microsoft\x1fgreenhouse\x1fMS-GH-KEEP'
    //     "l'oréal r&d\x1fsmartrecruiters\x1fLOR-KEEP"
    //   and OMITS:
    //     'MS-WD-REMOVE', 'LOR-REMOVE', 'CPP-REMOVE'
    const finalizationRun = {
      started_at: new Date().toISOString(),
      finished_at: new Date().toISOString(),
      companies_checked: 3,
      companies_successful: 3,
      companies_failed: 0,
      status: 'success',
      successful_companies: ['microsoft', "l'oréal r&d", 'c++ systems, llc'],
      seen_job_keys: [
        'microsoft\x1fworkday\x1fMS-WD-KEEP',
        'microsoft\x1fgreenhouse\x1fMS-GH-KEEP',
        "l'oréal r&d\x1fsmartrecruiters\x1fLOR-KEEP"
      ]
    };

    const finalizeRes = await post('/api/ingest', {run: finalizationRun});
    assert.equal(finalizeRes.status, 200);

    // Verify empirical D1 status after deactivation:
    // 1. Kept jobs MUST remain is_active = 1
    const msKeepWd = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='MS-WD-KEEP'").first();
    assert.equal(msKeepWd.is_active, 1, 'MS-WD-KEEP must remain is_active=1 despite D1 MICROSOFT vs seen key microsoft');

    const msKeepGh = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='MS-GH-KEEP'").first();
    assert.equal(msKeepGh.is_active, 1, 'MS-GH-KEEP must remain is_active=1 on greenhouse');

    const lorKeep = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='LOR-KEEP'").first();
    assert.equal(lorKeep.is_active, 1, 'LOR-KEEP must remain is_active=1 with apostrophe and accents');

    // 2. Omitted jobs MUST be deactivated to is_active = 0
    const msRemove = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='MS-WD-REMOVE'").first();
    assert.equal(msRemove.is_active, 0, 'MS-WD-REMOVE must be deactivated to is_active=0');

    const lorRemove = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='LOR-REMOVE'").first();
    assert.equal(lorRemove.is_active, 0, 'LOR-REMOVE must be deactivated to is_active=0');

    const cppRemove = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='CPP-REMOVE'").first();
    assert.equal(cppRemove.is_active, 0, 'CPP-REMOVE must be deactivated to is_active=0');

    // -------------------------------------------------------------------------
    // 3. INACTIVE JOB SUPPRESSION & EDGE CACHE PURGE
    // -------------------------------------------------------------------------
    // After deactivation, edge cache must have been purged by finalizeRes
    const postDashRes = await get('/api/dashboard');
    assert.equal(postDashRes.headers.get('X-JobRadar-Catalog-Cache'), null, 'Dashboard cache must be purged after finalization deactivation');
    const postDash = await postDashRes.json();

    // Verify NO deactivated jobs appear in /api/dashboard
    assert.ok(!postDash.jobs.some(j => j.external_job_id === 'MS-WD-REMOVE'), 'Deactivated MS-WD-REMOVE must NOT appear in /api/dashboard');
    assert.ok(!postDash.jobs.some(j => j.external_job_id === 'LOR-REMOVE'), 'Deactivated LOR-REMOVE must NOT appear in /api/dashboard');
    assert.ok(!postDash.jobs.some(j => j.external_job_id === 'CPP-REMOVE'), 'Deactivated CPP-REMOVE must NOT appear in /api/dashboard');
    assert.ok(postDash.jobs.every(j => j.is_active === 1), 'All jobs in /api/dashboard must be is_active=1');

    // Verify NO deactivated jobs appear in /api/jobs
    const jobsApiRes = await (await get('/api/jobs?after=0&limit=100')).json();
    assert.ok(!jobsApiRes.jobs.some(j => j.external_job_id === 'MS-WD-REMOVE'), 'Deactivated jobs must not appear in /api/jobs');
    assert.ok(jobsApiRes.jobs.every(j => j.is_active === 1), 'All jobs in /api/jobs must have is_active=1');

    // Verify hydrated catalog via loadPublicCatalog suppresses inactive jobs
    const fetcher = async (path, options) => mf.dispatchFetch(`https://challenger2.example${path}`, options);
    const hydrated = await loadPublicCatalog(() => {}, fetcher);
    assert.ok(!hydrated.jobs.some(j => j.external_job_id === 'MS-WD-REMOVE'), 'loadPublicCatalog must not contain deactivated jobs');
    assert.ok(!hydrated.jobs.some(j => j.external_job_id === 'CPP-REMOVE'));
    assert.ok(hydrated.jobs.every(j => j.is_active === 1), 'All hydrated jobs must be active');

    // -------------------------------------------------------------------------
    // 4. D1 DATABASE QUERY FILTERING & ACTIVE SHORTLIST COMPLETENESS
    // -------------------------------------------------------------------------
    // Insert a batch of active and inactive jobs across various cities
    const bulkJobs = [];
    for (let i = 1; i <= 60; i++) {
      bulkJobs.push({
        company: 'Beta Corp',
        ats_provider: 'workday',
        external_job_id: `BULK-BLR-${i}`,
        title: `BLR Job ${i}`,
        job_url: `https://beta.test/blr/${i}`,
        application_url: `https://beta.test/blr/${i}`,
        career_page_url: 'https://beta.test/careers',
        city: 'Bengaluru',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Software Engineering',
        is_eligible: 1
      });
      bulkJobs.push({
        company: 'Beta Corp',
        ats_provider: 'workday',
        external_job_id: `BULK-HYD-${i}`,
        title: `HYD Job ${i}`,
        job_url: `https://beta.test/hyd/${i}`,
        application_url: `https://beta.test/hyd/${i}`,
        career_page_url: 'https://beta.test/careers',
        city: 'Hyderabad',
        location: 'Hyderabad',
        normalized_location: 'Hyderabad',
        role_category: 'Software Engineering',
        is_eligible: 1
      });
      // Inactive job in Bengaluru
      bulkJobs.push({
        company: 'Beta Corp',
        ats_provider: 'workday',
        external_job_id: `BULK-INACTIVE-${i}`,
        title: `Inactive Job ${i}`,
        job_url: `https://beta.test/inact/${i}`,
        application_url: `https://beta.test/inact/${i}`,
        career_page_url: 'https://beta.test/careers',
        city: 'Bengaluru',
        location: 'Bengaluru',
        normalized_location: 'Bengaluru',
        role_category: 'Software Engineering',
        is_eligible: 1
      });
    }

    const bulkIngest = await post('/api/ingest', {jobs: bulkJobs});
    assert.equal(bulkIngest.status, 200);

    // Deactivate the BULK-INACTIVE jobs directly in D1 to simulate retired jobs
    await db.prepare("UPDATE jobs SET is_active=0 WHERE external_job_id LIKE 'BULK-INACTIVE-%'").run();

    // Query D1 directly to count expected active shortlist jobs
    const activeCount = await db.prepare("SELECT count(*) as total FROM jobs WHERE is_active=1 AND city IN ('Bengaluru','Hyderabad')").first();
    assert.ok(activeCount.total >= 120, `Must have at least 120 active shortlist jobs (got ${activeCount.total})`);

    // Verify /api/jobs pagination across pages
    let after = 0;
    const retrievedActiveJobs = [];
    while (true) {
      const pageRes = await (await get(`/api/jobs?limit=50&after=${after}`)).json();
      assert.ok(Array.isArray(pageRes.jobs));
      if (pageRes.jobs.length === 0) break;

      // Invariant: every job returned by /api/jobs must be is_active=1 and shortlist city
      for (const j of pageRes.jobs) {
        assert.equal(j.is_active, 1, `Job ${j.external_job_id} must have is_active=1`);
        assert.ok(['Bengaluru', 'Hyderabad'].includes(j.city), `Job ${j.external_job_id} must be in Bengaluru or Hyderabad`);
        retrievedActiveJobs.push(j);
      }

      if (pageRes.next_cursor === null) break;
      after = pageRes.next_cursor;
    }

    // Verify no duplicates
    const uniqueIds = new Set(retrievedActiveJobs.map(j => j.id));
    assert.equal(uniqueIds.size, retrievedActiveJobs.length, 'Retrieved jobs must not contain duplicate IDs');
    assert.equal(retrievedActiveJobs.length, activeCount.total, 'All active shortlist jobs must be retrieved across pagination');

    // Verify strictly ascending ID order
    for (let i = 1; i < retrievedActiveJobs.length; i++) {
      assert.ok(retrievedActiveJobs[i].id > retrievedActiveJobs[i - 1].id, 'Jobs must be sorted strictly by ascending ID');
    }

  } finally {
    await mf.dispose();
  }
});
