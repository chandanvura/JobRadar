import {Miniflare,convertV4MiniflareOptions} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const saved={version:1,data_mode:'backup',snapshot_at:new Date().toISOString(),jobs:[{id:900,title:'Saved fixture'}],companies:[]};
const serverRoot=new URL('../dist/server/',import.meta.url);
const modulePaths=['index.js',...(await readdir(serverRoot,{recursive:true})).filter(path=>path.endsWith('.js') && path!=='index.js')];
const modules=modulePaths.map(path=>({type:'ESModule',path:new URL(path,serverRoot).pathname}));
const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:"jobradar-api-audit",modules,modulesRoot:new URL('../dist/server/',import.meta.url).pathname,scriptPath:new URL('../dist/server/index.js',import.meta.url).pathname,compatibilityDate:'2026-09-26',compatibilityFlags:['nodejs_compat'],d1Databases:{DB:'audit-db'},bindings:{JOBRADAR_INGEST_SECRET:'local-audit-only'},serviceBindings:{ASSETS:async()=>Response.json(saved)}}]}));
const request=(path,body,authorized=true)=>mf.dispatchFetch(`https://audit.example${path}`,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json',...(authorized?{Authorization:'Bearer local-audit-only'}:{})},body:JSON.stringify(body)});
try {
  assert.equal((await request('/api/ingest',{},false)).status,401);
  assert.equal((await request('/api/ingest',null)).status,400);
  assert.equal((await request('/api/ingest',{jobs:[null]})).status,400);
  assert.equal((await request('/api/ingest',{jobs:Array.from({length:2001},()=>({}))})).status,413);
  assert.equal((await request('/api/notifications',null)).status,400);
  assert.equal((await request('/api/unknown')).status,404);
  assert.equal((await request('/api/jobs?after=-1')).status,400);
  assert.equal((await (await request('/api/dashboard')).json()).data_mode,'backup');
  assert.equal((await request('/api/health')).status,503);
  const db=await mf.getD1Database('DB');const dir=new URL('../drizzle/',import.meta.url);
  for(const file of (await readdir(dir)).filter(p=>p.endsWith('.sql')).sort()){
    for(const statement of (await readFile(new URL(file,dir),'utf8')).split('--> statement-breakpoint'))if(statement.trim())await db.prepare(statement).run();
  }
  assert.equal((await (await request('/api/dashboard')).json()).jobs.length,0);
  const job={company:'Example',ats_provider:'workday',external_job_id:'REQ-1',title:'Java Engineer',job_url:'https://example.test/job/1',application_url:'https://example.test/job/1',career_page_url:'https://example.test/careers',city:'Bengaluru',location:'Bengaluru',normalized_location:'Bengaluru',role_category:'Java / Backend',skills:[]};
  for(const company of ['Example','example'])assert.equal((await request('/api/ingest',{jobs:[{...job,company}]})).status,200);
  assert.equal((await db.prepare('SELECT count(*) AS total FROM jobs').first()).total,1);
  const legacyCareer='http://bakerhughes.wd5.myworkdayjobs.com/BakerHughes/userHome/';
  const repaired=await (await request('/api/ingest',{jobs:[{...job,career_page_url:legacyCareer}]})).json();
  assert.equal(repaired.accepted,1);assert.equal(repaired.rejected,0);
  assert.equal((await db.prepare('SELECT career_page_url FROM jobs').first()).career_page_url,legacyCareer.replace('http:','https:'));
  const rejected=await (await request('/api/ingest',{jobs:[{...job,career_page_url:'http://unsafe.example/careers'}]})).json();
  assert.equal(rejected.rejected,1);
  await request('/api/ingest',{jobs:[job]});
  const run={started_at:new Date().toISOString(),finished_at:new Date().toISOString(),companies_checked:1,companies_successful:1,companies_failed:0,status:'success',successful_companies:['Example'],seen_job_keys:[...Array.from({length:5001},(_,i)=>`unrelated-${i}`),'Example\x1fworkday\x1fREQ-1']};
  assert.equal((await request('/api/ingest',{run})).status,200);
  assert.equal((await db.prepare('SELECT is_active FROM jobs').first()).is_active,1);
  assert.equal((await request('/api/ingest',{run:{...run,seen_job_keys:Array(50001).fill('x')}})).status,413);
  // Malformed finalization must neither retire jobs nor record a completed scan.
  const previousRuns=(await db.prepare('SELECT * FROM scraper_runs').all()).results;
  for(const change of [
    {seen_job_keys:undefined},{seen_job_keys:null},{seen_job_keys:'not-an-array'},
    {seen_job_keys:[null]},{seen_job_keys:['']},
    {successful_companies:undefined},{successful_companies:[{}]},
  ])assert.equal((await request('/api/ingest',{run:{...run,...change}})).status,400);
  assert.equal((await request('/api/ingest',{run:{...run,successful_companies:Array(1001).fill('Example')}})).status,413);
  assert.equal((await request('/api/ingest',{jobs:[{...job,external_job_id:'REQ-2'},{...job,application_url:'javascript:invalid'}],run:{...run,seen_job_keys:[]}})).status,400);
  assert.equal((await db.prepare('SELECT is_active FROM jobs').first()).is_active,1);
  assert.deepEqual((await db.prepare('SELECT * FROM scraper_runs').all()).results,previousRuns);
  assert.equal((await db.prepare('SELECT count(*) AS total FROM jobs').first()).total,1);
  for(let attempt=0;attempt<2;attempt++)assert.equal((await request('/api/notifications',{company:'example',ats_provider:'workday',external_job_id:'REQ-1',status:'sent'})).status,200);
  assert.equal((await db.prepare('SELECT notifications_sent FROM scraper_runs').first()).notifications_sent,1);
  const results=await Promise.all([request('/api/ingest',{jobs:[job]}),request('/api/ingest',{jobs:[job]})]);
  assert.ok(results.every(r=>r.status===200));
  assert.equal((await db.prepare('SELECT count(*) AS total FROM jobs').first()).total,1);
  assert.equal((await request('/api/health')).status,200);
  assert.equal((await (await request('/api/health')).json()).pipeline_ok,true);
  for(const status of ['partial','degraded','failed']){
    await db.prepare('UPDATE scraper_runs SET status=?').bind(status).run();
    const response=await request('/api/health');assert.equal(response.status,503);
    const health=await response.json();assert.equal(health.pipeline_ok,true);assert.equal(health.scan_ok,false);
  }
  await db.prepare("UPDATE scraper_runs SET status='success'").run();
  for(const finished of ['invalid-date',new Date(Date.now()+60_000).toISOString(),new Date(Date.now()-6*3600_000).toISOString()]){
    await db.prepare('UPDATE scraper_runs SET finished_at=?').bind(finished).run();
    const response=await request('/api/health');assert.equal(response.status,503);
    const health=await response.json();assert.equal(health.pipeline_ok,false);assert.equal(health.stale,true);
  }
  await db.prepare('UPDATE scraper_runs SET finished_at=?').bind(new Date().toISOString()).run();
  const beforeRegistryRun = await db.prepare('SELECT * FROM scraper_runs').all();
  assert.equal((await request('/api/ingest',{companies:[{name:'New source',careers_url:'https://new.test/careers',ats_provider:'custom',ats_identifier:'new-source',priority:4,warning:'Awaiting first scheduled scan'}]})).status,200);
  assert.equal((await db.prepare('SELECT is_active FROM jobs').first()).is_active,1);
  assert.deepEqual((await db.prepare('SELECT * FROM scraper_runs').all()).results,beforeRegistryRun.results);
  assert.equal((await db.prepare('SELECT last_checked_at FROM companies WHERE name=?').bind('New source').first()).last_checked_at,null);
  // Unchanged results must still record every real same-day check.
  const checkedSource={name:'New source',careers_url:'https://new.test/careers',ats_provider:'custom',ats_identifier:'new-source',priority:4,warning:'Limited coverage: no structured public job feed',error_count:0,jobs_found:0};
  for(const checked of ['2026-10-08T00:07:00+00:00','2026-10-08T04:07:00+00:00']){
    assert.equal((await request('/api/ingest',{companies:[{...checkedSource,last_checked_at:checked,last_success_at:checked}]})).status,200);
    const stored=await db.prepare('SELECT last_checked_at,last_success_at FROM companies WHERE name=?').bind('New source').first();
    assert.equal(stored.last_checked_at,checked);assert.equal(stored.last_success_at,checked);
  }
  assert.equal((await request('/api/ingest',{companies:[{...checkedSource,error_count:1,warning:'Upstream unavailable',last_checked_at:'2026-10-08T08:07:00+00:00',last_success_at:null}]})).status,200);
  const failedCheck=await db.prepare('SELECT last_checked_at,last_success_at FROM companies WHERE name=?').bind('New source').first();
  assert.equal(failedCheck.last_checked_at,'2026-10-08T08:07:00+00:00');assert.equal(failedCheck.last_success_at,'2026-10-08T04:07:00+00:00');
  const live=await (await request('/api/dashboard')).json();assert.equal(live.jobs.length,1);assert.equal(live.data_mode,undefined);
  const page=await (await request('/api/jobs?after=0')).json();assert.equal(page.jobs.length,1);assert.equal(page.next_cursor,null);
  // An explicit empty successful manifest is authoritative and can retire jobs.
  assert.equal((await request('/api/ingest',{run:{...run,seen_job_keys:[]}})).status,200);
  assert.equal((await db.prepare('SELECT is_active FROM jobs').first()).is_active,0);
  assert.equal((await (await request('/api/dashboard?source=backup')).json()).data_mode,'backup');
  await db.prepare('DROP TABLE scraper_runs').run();
  assert.equal((await request('/api/health')).status,503);
  assert.equal((await (await request('/api/dashboard')).json()).data_mode,'backup');
  console.log('VERIFIED: compiled Worker auth, invalid inputs, fresh migrations, case-insensitive deduplication, concurrency, notification replay, live recovery, pagination, static failover, and caught database errors.');
}finally{await mf.dispose();}
