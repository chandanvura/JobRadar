import test from 'node:test';
import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPublicCatalog} from '../lib/public-catalog.ts';
import {locationMatches} from '../lib/location-policy.ts';

const serverRoot=new URL('../dist/server/',import.meta.url);
const modulePaths=['index.js',...(await readdir(serverRoot,{recursive:true})).filter(path=>path.endsWith('.js')&&path!=='index.js')];
const modules=modulePaths.map(path=>({type:'ESModule',path:fileURLToPath(new URL(path,serverRoot))}));
const saved={version:1,data_mode:'backup',snapshot_at:new Date().toISOString(),jobs:[{id:900,title:'Saved fixture'}],companies:[]};

test('sync pipeline: scraper ingestion, normalization, collation, edge cache purge, and UI matching',async()=>{
  const mf=new Miniflare({
    workers:[{
      name:'jobradar-sync-pipeline',
      modules,
      modulesRoot:fileURLToPath(new URL('../dist/server/',import.meta.url)),
      scriptPath:fileURLToPath(new URL('../dist/server/index.js',import.meta.url)),
      compatibilityDate:'2026-07-30',
      compatibilityFlags:['nodejs_compat'],
      d1Databases:{DB:'sync-db'},
      bindings:{JOBRADAR_INGEST_SECRET:'local-sync-secret'},
      serviceBindings:{
        ASSETS:async request=>new URL(request.url).pathname==='/backup/catalog.json'
          ? Response.json(saved)
          : new Response(await readFile(new URL('../dist/client/index.html',import.meta.url)),{headers:{'Content-Type':'text/html'}})
      }
    }]
  });

  try{
    const db=await mf.getD1Database('DB');
    const dir=new URL('../drizzle/',import.meta.url);
    for(const file of (await readdir(dir)).filter(p=>p.endsWith('.sql')).sort()){
      for(const statement of (await readFile(new URL(file,dir),'utf8')).split('--> statement-breakpoint')){
        if(statement.trim())await db.prepare(statement).run();
      }
    }

    const post=async(path,body)=>mf.dispatchFetch(`https://sync.example${path}`,{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer local-sync-secret'},
      body:JSON.stringify(body)
    });
    const get=async(path,headers={})=>mf.dispatchFetch(`https://sync.example${path}`,{headers});

    // 1. Initial job ingestion with aliases and casing variants
    const initialJobs=[
      {
        company:'Acme Corp',
        ats_provider:'workday',
        external_job_id:'INIT-1',
        title:'Software Engineer 1',
        job_url:'https://acme.test/job/1',
        application_url:'https://acme.test/job/1',
        career_page_url:'https://acme.test/careers',
        city:'Bangalore', // alias to be normalized to Bengaluru
        location:'Bangalore, India',
        normalized_location:'Bangalore',
        role_category:'Software Engineering',
        skills:['Java'],
        is_eligible:1,
        relevance_score:80
      },
      {
        company:'Acme Corp',
        ats_provider:'workday',
        external_job_id:'INIT-2',
        title:'Software Engineer 2',
        job_url:'https://acme.test/job/2',
        application_url:'https://acme.test/job/2',
        career_page_url:'https://acme.test/careers',
        city:null, // unnormalized to be resolved from normalized_location
        location:'Bengaluru, Karnataka',
        normalized_location:'Bengaluru',
        role_category:'Software Engineering',
        skills:['Python'],
        is_eligible:1,
        relevance_score:82
      },
      {
        company:'Acme Corp',
        ats_provider:'workday',
        external_job_id:'INIT-3',
        title:'Software Engineer 3',
        job_url:'https://acme.test/job/3',
        application_url:'https://acme.test/job/3',
        career_page_url:'https://acme.test/careers',
        city:'hyderabad', // lowercase to be canonicalized to Hyderabad
        location:'Hyderabad',
        normalized_location:'Hyderabad',
        role_category:'Software Engineering',
        skills:['Go'],
        is_eligible:1,
        relevance_score:84
      }
    ];

    const initRes=await post('/api/ingest',{jobs:initialJobs});
    assert.equal(initRes.status,200);
    const initBody=await initRes.json();
    assert.equal(initBody.accepted,3);

    // Verify D1 normalization
    const row1=await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='INIT-1'").first();
    assert.equal(row1.city,'Bengaluru','Bangalore alias must be stored as canonical Bengaluru');
    assert.equal(row1.is_eligible,1);

    const row2=await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='INIT-2'").first();
    assert.equal(row2.city,'Bengaluru','Null city must be resolved to canonical Bengaluru');

    const row3=await db.prepare("SELECT city, is_eligible FROM jobs WHERE external_job_id='INIT-3'").first();
    assert.equal(row3.city,'Hyderabad','Lowercase hyderabad must be stored as canonical Hyderabad');

    // 2. Fetch dashboard (initial read populates edge cache)
    const dash1=await (await get('/api/dashboard')).json();
    assert.equal(dash1.jobs.length,3);

    // Repeat read hits edge cache
    const cachedDash=await get('/api/dashboard');
    assert.equal(cachedDash.headers.get('X-JobRadar-Catalog-Cache'),'hit');

    // 3. New job discovered by scraper and notified on Telegram
    const telegramJob={
      company:'Acme Corp',
      ats_provider:'workday',
      external_job_id:'TELEGRAM-NEW-BENGALURU-1',
      title:'Senior Cloud Engineer',
      job_url:'https://acme.test/job/new-1',
      application_url:'https://acme.test/job/new-1',
      career_page_url:'https://acme.test/careers',
      city:'Bangalore',
      location:'Bangalore - Whitefield',
      normalized_location:'Bangalore, Karnataka',
      role_category:'DevOps / Cloud',
      skills:['AWS','Kubernetes'],
      is_eligible:1,
      relevance_score:90
    };
    const ingestRes=await post('/api/ingest',{jobs:[telegramJob]});
    assert.equal(ingestRes.status,200);

    // 4. Finalization run deactivation with case mismatch
    // successful_companies has 'acme corp' (lowercase), seen_job_keys includes 'acme corp\x1fworkday\x1fTELEGRAM-NEW-BENGALURU-1'
    const finalizeRun={
      started_at:new Date().toISOString(),
      finished_at:new Date().toISOString(),
      companies_checked:1,
      companies_successful:1,
      companies_failed:0,
      status:'success',
      successful_companies:['acme corp'],
      seen_job_keys:[
        'acme corp\x1fworkday\x1fINIT-1',
        'acme corp\x1fworkday\x1fINIT-2',
        'acme corp\x1fworkday\x1fINIT-3',
        'acme corp\x1fworkday\x1fTELEGRAM-NEW-BENGALURU-1'
      ]
    };
    const finalizeRes=await post('/api/ingest',{run:finalizeRun});
    assert.equal(finalizeRes.status,200);

    // Verify job remained active despite casing mismatch
    const telegramJobRow=await db.prepare("SELECT is_active, city FROM jobs WHERE external_job_id='TELEGRAM-NEW-BENGALURU-1'").first();
    assert.equal(telegramJobRow.is_active,1,'Job must not be deactivated when company casing differs in seen_job_keys');
    assert.equal(telegramJobRow.city,'Bengaluru');

    // 5. Edge cache was purged on ingest -> fresh read shows the new job immediately
    const dashAfterIngest=await (await get('/api/dashboard')).json();
    assert.equal(dashAfterIngest.jobs.length,4);
    assert.ok(dashAfterIngest.jobs.some(j=>j.external_job_id==='TELEGRAM-NEW-BENGALURU-1'),'New job must be present in dashboard after ingest purge');

    // 6. Client Cache-Control: no-cache header bypasses cache
    const bypassRes=await get('/api/dashboard',{'Cache-Control':'no-cache'});
    assert.equal(bypassRes.headers.get('X-JobRadar-Catalog-Cache'),null);

    // 7. Client catalog hydration check (loadPublicCatalog)
    const fetcher=async(path,options)=>mf.dispatchFetch(`https://sync.example${path}`,options);
    const catalog=await loadPublicCatalog(()=>{},fetcher);
    assert.equal(catalog.data_mode,undefined,'Catalog must be live data, not backup');
    const hydratedJob=catalog.jobs.find(j=>j.external_job_id==='TELEGRAM-NEW-BENGALURU-1');
    assert.ok(hydratedJob,'Hydrated catalog must include newly ingested Telegram job');

    // 8. UI location matching check
    assert.equal(locationMatches(hydratedJob,'Bengaluru'),true,'locationMatches must recognize Bangalore alias when city is Bengaluru');
    assert.equal(locationMatches(hydratedJob,'Hyderabad'),false);
  }finally{
    await mf.dispose();
  }
});
