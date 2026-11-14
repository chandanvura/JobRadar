import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile, readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPublicCatalog} from '../lib/public-catalog.ts';
import {locationMatches, canonicalShortlistCity, enforceShortlistLocation} from '../lib/location-policy.ts';
import {cachedCatalog, purgeCatalogCache, CATALOG_CACHE_PREFIX} from '../worker/catalog-cache.ts';

const serverRoot = new URL('../dist/server/', import.meta.url);
const modulePaths = ['index.js', ...(await readdir(serverRoot, {recursive: true})).filter(path => path.endsWith('.js') && path !== 'index.js')];
const modules = modulePaths.map(path => ({type: 'ESModule', path: fileURLToPath(new URL(path, serverRoot))}));
const backupFixture = {
  version: 1,
  data_mode: 'backup',
  snapshot_at: new Date().toISOString(),
  jobs: [{id: 99999, title: 'Backup Engineer', company: 'Acme', city: 'Bengaluru', normalized_location: 'Bengaluru', is_eligible: 1}],
  companies: []
};

function createMemoryCacheFixture() {
  const memory = new Map();
  const pending = [];
  return {
    memory,
    cache: {
      match: async key => memory.get(key.url)?.clone(),
      put: async (key, value) => { memory.set(key.url, value.clone()); },
      delete: async key => memory.delete(key.url)
    },
    ctx: { waitUntil: p => pending.push(p) },
    flush: async () => Promise.all(pending)
  };
}

// ============================================================================
// TEST SUITE 1: ADVERSARIAL CACHE BYPASS HEADERS & CASING
// ============================================================================

test('adversarial: Cache-Control and Pragma header variations and case-insensitivity', async () => {
  const f = createMemoryCacheFixture();
  let liveReads = 0;
  const read = async () => Response.json({readCount: ++liveReads, timestamp: Date.now()});

  // Prime the cache
  const initial = await cachedCatalog(new Request('https://example.test/api/dashboard'), read, f.cache, f.ctx);
  await f.flush();
  assert.equal(liveReads, 1);
  assert.equal(initial.headers.get('X-JobRadar-Catalog-Cache'), null);

  // Normal repeat request -> must be cache HIT
  const hit = await cachedCatalog(new Request('https://example.test/api/dashboard'), read, f.cache, f.ctx);
  assert.equal(liveReads, 1, 'Repeat GET without bypass headers must hit cache');
  assert.equal(hit.headers.get('X-JobRadar-Catalog-Cache'), 'hit');

  // Variations of bypass headers that MUST bypass cache
  const bypassHeaders = [
    {'Cache-Control': 'no-cache'},
    {'Cache-Control': 'NO-CACHE'},
    {'Cache-Control': 'No-Cache'},
    {'cache-control': 'no-cache'},
    {'CACHE-CONTROL': 'NO-CACHE'},
    {'Cache-Control': 'no-store'},
    {'Cache-Control': 'NO-STORE'},
    {'cache-control': 'No-Store'},
    {'Cache-Control': 'max-age=0'},
    {'Cache-Control': 'MAX-AGE=0'},
    {'cache-control': 'max-age=0'},
    {'Cache-Control': 'public, max-age=0, must-revalidate'},
    {'Cache-Control': 'no-cache, no-store, max-age=0'},
    {'Pragma': 'no-cache'},
    {'Pragma': 'NO-CACHE'},
    {'pragma': 'No-Cache'},
    {'PRAGMA': 'NO-CACHE'},
    {'Cache-Control': 'private, no-cache', 'Pragma': 'no-cache'},
    {'Cache-Control': 'no-store', 'Pragma': 'no-cache'}
  ];

  for (const headers of bypassHeaders) {
    const req = new Request('https://example.test/api/dashboard', {headers});
    const res = await cachedCatalog(req, read, f.cache, f.ctx);
    assert.equal(res.headers.get('X-JobRadar-Catalog-Cache'), null, `Header ${JSON.stringify(headers)} must bypass edge cache`);
  }

  // Confirm live reads incremented for every bypass test
  assert.equal(liveReads, 1 + bypassHeaders.length, 'Every bypass variation must trigger a live read');

  // Verify non-bypass headers still HIT the cache
  const nonBypassHeaders = [
    {'Cache-Control': 'max-age=3600'},
    {'Cache-Control': 'public'},
    {'Cache-Control': 'only-if-cached'},
    {'Pragma': 'cache'},
    {'X-Custom': 'no-cache'}
  ];

  for (const headers of nonBypassHeaders) {
    const req = new Request('https://example.test/api/dashboard', {headers});
    const res = await cachedCatalog(req, read, f.cache, f.ctx);
    assert.equal(res.headers.get('X-JobRadar-Catalog-Cache'), 'hit', `Header ${JSON.stringify(headers)} must NOT bypass edge cache`);
  }
  assert.equal(liveReads, 1 + bypassHeaders.length, 'Non-bypass headers must not increment live read count');
});

// ============================================================================
// TEST SUITE 2: MULTI-PAGE & OVERFLOW RANGE HYDRATION IN loadPublicCatalog
// ============================================================================

test('adversarial: loadPublicCatalog multi-page range pagination, boundaries, and overflow', async () => {
  // Scenario 1: A range with > 500 jobs requires multiple paginated requests via next_cursor
  const totalJobsInRange = 1250;
  const mockJobs = Array.from({length: totalJobsInRange}, (_, i) => ({
    id: i + 1,
    title: `Job ${i + 1}`,
    company: 'Test Corp',
    city: 'Bengaluru',
    is_eligible: 1
  }));

  const fetchCalls = [];
  const mockFetcher = async (path, options) => {
    fetchCalls.push(path);
    if (path === '/api/dashboard') {
      return Response.json({
        jobs: mockJobs.slice(0, 100),
        companies: [{name: 'Test Corp'}],
        catalog_ranges: [
          {after: 0, through: totalJobsInRange}
        ]
      });
    }
    const url = new URL(`https://mock.test${path}`);
    if (url.pathname === '/api/jobs') {
      const after = Number(url.searchParams.get('after') || '0');
      const through = Number(url.searchParams.get('through') || '0');
      const limit = Number(url.searchParams.get('limit') || '500');

      // Slice matching jobs
      const inRange = mockJobs.filter(j => j.id > after && j.id <= through);
      const pageJobs = inRange.slice(0, limit);
      const nextCursor = inRange.length > limit ? pageJobs[pageJobs.length - 1].id : null;
      return Response.json({jobs: pageJobs, next_cursor: nextCursor});
    }
    return Response.json(backupFixture);
  };

  const initialPayloads = [];
  const result = await loadPublicCatalog(p => initialPayloads.push(p), mockFetcher);

  assert.equal(result.data_mode, undefined, 'Must not fall back to backup');
  assert.equal(result.jobs.length, totalJobsInRange, 'Must hydrate all 1250 jobs across multiple pages');
  // Confirm pagination happened (1 dashboard + 3 range pages: 1-500, 501-1000, 1001-1250)
  assert.ok(fetchCalls.length >= 4, `Expected at least 4 fetch calls, got ${fetchCalls.length}`);

  // Scenario 2: Newly ingested trailing jobs beyond range maxThrough are preserved from preview
  const previewJobBeyondRange = {
    id: 9999, // greater than through (1250)
    title: 'Brand New Ingested Job',
    company: 'Fresh Corp',
    city: 'Hyderabad',
    is_eligible: 1
  };

  const mockFetcherWithTrailing = async (path, options) => {
    if (path === '/api/dashboard') {
      return Response.json({
        jobs: [...mockJobs.slice(0, 99), previewJobBeyondRange],
        companies: [{name: 'Test Corp'}],
        catalog_ranges: [{after: 0, through: totalJobsInRange}]
      });
    }
    const url = new URL(`https://mock.test${path}`);
    if (url.pathname === '/api/jobs') {
      const after = Number(url.searchParams.get('after') || '0');
      const through = Number(url.searchParams.get('through') || '0');
      const limit = Number(url.searchParams.get('limit') || '500');
      const inRange = mockJobs.filter(j => j.id > after && j.id <= through);
      const pageJobs = inRange.slice(0, limit);
      const nextCursor = inRange.length > limit ? pageJobs[pageJobs.length - 1].id : null;
      return Response.json({jobs: pageJobs, next_cursor: nextCursor});
    }
    return Response.json(backupFixture);
  };

  const trailingResult = await loadPublicCatalog(() => {}, mockFetcherWithTrailing);
  assert.ok(trailingResult.jobs.some(j => j.id === 9999), 'Trailing newly ingested job must be preserved in hydrated catalog');
  assert.equal(trailingResult.jobs.length, totalJobsInRange + 1);

  // Scenario 3: Malformed range boundary or non-monotonic cursor gracefully falls back to backup
  const corruptFetcher = async (path) => {
    if (path === '/api/dashboard') {
      return Response.json({
        jobs: mockJobs.slice(0, 100),
        companies: [{name: 'Test Corp'}],
        catalog_ranges: [{after: 0, through: 100}]
      });
    }
    if (path.startsWith('/api/jobs')) {
      // Corrupt: returns jobs with descending or invalid IDs
      return Response.json({
        jobs: [{id: 50}, {id: 20}], // out of order
        next_cursor: null
      });
    }
    return Response.json(backupFixture);
  };

  const corruptResult = await loadPublicCatalog(() => {}, corruptFetcher);
  assert.equal(corruptResult.data_mode, 'backup', 'Malformed range response must safely trigger backup recovery');
  assert.equal(corruptResult.jobs[0].id, 99999);
});

// ============================================================================
// TEST SUITE 3: MINIFLARE END-TO-END CONCURRENCY & CACHE PURGE RESILIENCE
// ============================================================================

test('adversarial: concurrent ingests, cache purges, and zero stale read race conditions', async () => {
  const mf = new Miniflare({
    workers: [{
      name: 'jobradar-adversarial',
      modules,
      modulesRoot: fileURLToPath(new URL('../dist/server/', import.meta.url)),
      scriptPath: fileURLToPath(new URL('../dist/server/index.js', import.meta.url)),
      compatibilityDate: '2026-07-30',
      compatibilityFlags: ['nodejs_compat'],
      d1Databases: {DB: 'adv-db'},
      bindings: {JOBRADAR_INGEST_SECRET: 'adv-secret'},
      serviceBindings: {
        ASSETS: async request => new URL(request.url).pathname === '/backup/catalog.json'
          ? Response.json(backupFixture)
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

    const post = async (path, body) => mf.dispatchFetch(`https://adv.example${path}`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer adv-secret'},
      body: JSON.stringify(body)
    });
    const get = async (path, headers = {}) => mf.dispatchFetch(`https://adv.example${path}`, {headers});

    // 1. Initial ingest of 5 baseline jobs
    const makeJob = (id, title, city = 'Bengaluru', company = 'AdvCorp') => ({
      company,
      ats_provider: 'workday',
      external_job_id: `ADV-${id}`,
      title,
      job_url: `https://adv.test/job/${id}`,
      application_url: `https://adv.test/job/${id}`,
      career_page_url: 'https://adv.test/careers',
      city,
      location: `${city}, India`,
      normalized_location: city,
      role_category: 'Software Engineering',
      skills: ['TypeScript'],
      is_eligible: 1,
      relevance_score: 85
    });

    const baselineJobs = [
      makeJob(1, 'Engineer 1', 'Bangalore'), // alias
      makeJob(2, 'Engineer 2', 'bengaluru'), // case
      makeJob(3, 'Engineer 3', 'Hyderabad'),
      makeJob(4, 'Engineer 4', 'hyderabad'),
      makeJob(5, 'Engineer 5', 'Bengaluru')
    ];

    const initRes = await post('/api/ingest', {jobs: baselineJobs});
    assert.equal(initRes.status, 200);

    // 2. Prime the cache with a GET
    const dash1 = await get('/api/dashboard');
    assert.equal(dash1.status, 200);
    const body1 = await dash1.json();
    assert.equal(body1.jobs.length, 5);

    // Confirm next GET is an edge cache hit
    const dashCacheHit = await get('/api/dashboard');
    assert.equal(dashCacheHit.headers.get('X-JobRadar-Catalog-Cache'), 'hit');

    // 3. Sequential Ingest Test: Ingesting a new job must invalidate cache immediately
    for (let i = 6; i <= 10; i++) {
      const newJob = makeJob(i, `Engineer ${i}`, i % 2 === 0 ? 'Bangalore' : 'Hyderabad');
      const ingRes = await post('/api/ingest', {jobs: [newJob]});
      assert.equal(ingRes.status, 200);

      // The immediate subsequent GET must NOT be a stale cache hit
      const checkDash = await get('/api/dashboard');
      assert.equal(checkDash.headers.get('X-JobRadar-Catalog-Cache'), null, `GET after ingest ${i} must not hit stale cache`);
      const checkBody = await checkDash.json();
      assert.equal(checkBody.jobs.length, i, `Dashboard must contain all ${i} jobs`);
      assert.ok(checkBody.jobs.some(j => j.external_job_id === `ADV-${i}`), `Job ADV-${i} must be visible immediately`);

      // Repeat GET should hit the newly populated cache
      const nextHit = await get('/api/dashboard');
      assert.equal(nextHit.headers.get('X-JobRadar-Catalog-Cache'), 'hit');
    }

    // 4. Concurrent Ingest & Read Storm
    // Fire 5 simultaneous ingests of different jobs while concurrently firing 10 GET requests
    const concurrentIngests = Array.from({length: 5}, (_, idx) => {
      const jobId = 100 + idx;
      return post('/api/ingest', {jobs: [makeJob(jobId, `Concurrent Eng ${jobId}`)]});
    });

    const concurrentGets = Array.from({length: 10}, () => get('/api/dashboard'));

    const [ingestResults, getResults] = await Promise.all([
      Promise.all(concurrentIngests),
      Promise.all(concurrentGets)
    ]);

    for (const res of ingestResults) {
      assert.equal(res.status, 200);
    }
    for (const res of getResults) {
      assert.equal(res.status, 200);
    }

    // After all concurrent operations resolve, check final state
    const finalDash = await (await get('/api/dashboard', {'Cache-Control': 'no-cache'})).json();
    assert.equal(finalDash.jobs.length, 15, 'All 15 jobs must be present in the dashboard');

    // Verify all concurrent jobs are present
    for (let idx = 0; idx < 5; idx++) {
      const jobId = 100 + idx;
      assert.ok(finalDash.jobs.some(j => j.external_job_id === `ADV-${jobId}`), `Concurrent job ADV-${jobId} must be present`);
    }

    // 5. Finalization with Case Mismatch: Deactivation Test
    // Ingest finalization run where ADV-1 to ADV-14 are seen, but ADV-15 is NOT seen.
    // Company name in successful_companies is lowercase 'advcorp'
    const seenKeys = Array.from({length: 14}, (_, i) => {
      const id = i < 10 ? i + 1 : 100 + (i - 10);
      return `advcorp\x1fworkday\x1fADV-${id}`;
    });

    const finalizeRes = await post('/api/ingest', {
      run: {
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        companies_checked: 1,
        companies_successful: 1,
        companies_failed: 0,
        status: 'success',
        successful_companies: ['advcorp'],
        seen_job_keys: seenKeys
      }
    });
    assert.equal(finalizeRes.status, 200);

    // Verify ADV-15 was deactivated
    const adv15 = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='ADV-104'").first();
    assert.equal(adv15.is_active, 0, 'Omitted job ADV-104 (id 15) must be deactivated to is_active=0');

    // Verify ADV-14 (seen with lowercase company) remains active
    const adv14 = await db.prepare("SELECT is_active FROM jobs WHERE external_job_id='ADV-103'").first();
    assert.equal(adv14.is_active, 1, 'Seen job ADV-103 must remain is_active=1 despite lowercase company in manifest');

    // Verify dashboard reflects deactivation immediately (cache purged on run finalization)
    const afterFinalizeDash = await (await get('/api/dashboard')).json();
    assert.equal(afterFinalizeDash.jobs.length, 14, 'Dashboard must have 14 active jobs (1 deactivated)');
    assert.ok(!afterFinalizeDash.jobs.some(j => j.external_job_id === 'ADV-104'), 'Deactivated job must NOT be in dashboard');

  } finally {
    await mf.dispose();
  }
});

// ============================================================================
// TEST SUITE 4: ADVERSARIAL LOCATION MATCHING & NORMALIZATION BOUNDARIES
// ============================================================================

test('adversarial: location normalization aliases, international negatives, and case variations', () => {
  // Aliases that MUST resolve to Bengaluru
  const bengaluruAliases = [
    {city: 'Bangalore'},
    {city: 'bangalore'},
    {city: 'BANGALORE'},
    {city: 'Bengaluru'},
    {city: 'bengaluru'},
    {city: 'BENGALURU'},
    {city: null, normalized_location: 'Bangalore, India'},
    {city: '', location: 'Bengaluru - Electronic City, India'},
    {city: undefined, location: 'Bangalore Urban, Karnataka, India'}
  ];

  for (const job of bengaluruAliases) {
    assert.equal(canonicalShortlistCity(job), 'Bengaluru', `Failed to canonicalize ${JSON.stringify(job)} to Bengaluru`);
    const enforced = enforceShortlistLocation(job);
    assert.equal(enforced.city, 'Bengaluru');
    assert.equal(locationMatches(enforced, 'Bengaluru'), true);
    assert.equal(locationMatches(enforced, 'Hyderabad'), false);
  }

  // Aliases that MUST resolve to Hyderabad
  const hyderabadAliases = [
    {city: 'Hyderabad'},
    {city: 'hyderabad'},
    {city: 'HYDERABAD'},
    {city: null, normalized_location: 'Hyderabad, Telangana, India'},
    {city: '', location: 'HITEC City, Hyderabad, India'}
  ];

  for (const job of hyderabadAliases) {
    assert.equal(canonicalShortlistCity(job), 'Hyderabad', `Failed to canonicalize ${JSON.stringify(job)} to Hyderabad`);
    const enforced = enforceShortlistLocation(job);
    assert.equal(enforced.city, 'Hyderabad');
    assert.equal(locationMatches(enforced, 'Hyderabad'), true);
    assert.equal(locationMatches(enforced, 'Bengaluru'), false);
  }

  // International negatives that MUST be rejected (null)
  const internationalNegatives = [
    {city: 'Bangalore', location: 'Bangalore, Pakistan'},
    {city: 'Hyderabad', location: 'Hyderabad, Pakistan'},
    {city: 'Bangalore', location: 'Bangalore, USA'},
    {city: 'Bengaluru', location: 'Bengaluru, United Kingdom'},
    {city: 'Hyderabad', location: 'Hyderabad, Canada'},
    {city: 'Other India', location: 'Pune, Maharashtra'},
    {city: 'Remote (India)', location: 'Remote, India'},
    {city: 'Noida', location: 'Noida, UP, India'}
  ];

  for (const job of internationalNegatives) {
    assert.equal(canonicalShortlistCity(job), null, `Must reject non-shortlist/international location ${JSON.stringify(job)}`);
    const enforced = enforceShortlistLocation({...job, is_eligible: 1});
    assert.equal(enforced.is_eligible, 0, `Must mark ineligible ${JSON.stringify(job)}`);
  }
});

// ============================================================================
// TEST SUITE 5: CACHE INTEGRITY UNDER ERROR CONDITIONS AND SENSITIVE HEADERS
// ============================================================================

test('adversarial: edge cache handles auth, cookies, error codes, and cache failure gracefully', async () => {
  const f = createMemoryCacheFixture();
  let reads = 0;
  const readSuccess = async () => { reads++; return Response.json({status: 'ok'}); };
  const readError500 = async () => { reads++; return Response.json({error: 'd1 failure'}, {status: 500}); };
  const readCookie = async () => { reads++; return Response.json({status: 'ok'}, {headers: {'Set-Cookie': 'session=abc'}}); };
  const readBackup = async () => { reads++; return Response.json({status: 'ok'}, {headers: {'X-JobRadar-Data-Mode': 'backup'}}); };

  // 1. Auth requests must never hit or populate cache
  const authReq = new Request('https://example.test/api/dashboard', {headers: {Authorization: 'Bearer secret'}});
  await cachedCatalog(authReq, readSuccess, f.cache, f.ctx);
  await f.flush();
  assert.equal(f.memory.size, 0, 'Auth request must not populate cache');

  // 2. Cookie requests must never hit or populate cache
  const cookieReq = new Request('https://example.test/api/dashboard', {headers: {Cookie: 'user=123'}});
  await cachedCatalog(cookieReq, readSuccess, f.cache, f.ctx);
  await f.flush();
  assert.equal(f.memory.size, 0, 'Cookie request must not populate cache');

  // 3. 500 error responses must never be cached
  await cachedCatalog(new Request('https://example.test/api/dashboard'), readError500, f.cache, f.ctx);
  await f.flush();
  assert.equal(f.memory.size, 0, '500 error response must not be cached');

  // 4. Set-Cookie responses must never be cached
  await cachedCatalog(new Request('https://example.test/api/dashboard'), readCookie, f.cache, f.ctx);
  await f.flush();
  assert.equal(f.memory.size, 0, 'Set-Cookie response must not be cached');

  // 5. Backup mode responses must never be cached
  await cachedCatalog(new Request('https://example.test/api/dashboard'), readBackup, f.cache, f.ctx);
  await f.flush();
  assert.equal(f.memory.size, 0, 'Backup response must not be cached');

  // 6. Broken cache throwing errors on match/put/delete does not crash or break live reads
  const faultyCache = {
    match: async () => { throw new Error('Faulty Cache Match'); },
    put: async () => { throw new Error('Faulty Cache Put'); },
    delete: async () => { throw new Error('Faulty Cache Delete'); }
  };

  const responseFromFaulty = await cachedCatalog(new Request('https://example.test/api/dashboard'), readSuccess, faultyCache, f.ctx);
  assert.equal(responseFromFaulty.status, 200);
  const data = await responseFromFaulty.json();
  assert.equal(data.status, 'ok');

  // purgeCatalogCache does not throw on cache fault
  await assert.doesNotReject(async () => {
    await purgeCatalogCache('https://example.test', faultyCache);
  });
});
