// Replay one existing record to verify deployed ingestion without creating data.
import assert from 'node:assert/strict';
const {CLOUDFLARE_ACCOUNT_ID:account,CLOUDFLARE_D1_DATABASE_ID:database,CLOUDFLARE_API_TOKEN:token,JOBRADAR_WORKER_URL:origin,JOBRADAR_INGEST_SECRET:secret}=process.env;
assert.ok(account && database && token && origin && secret,'Deployment verification configuration missing');
const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${database}/query`,{
  method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({sql:'SELECT * FROM jobs WHERE is_active=1 ORDER BY id DESC LIMIT 1'}),signal:AbortSignal.timeout(20000),
});
const result=await response.json();
if(!result.success){
  if(JSON.stringify(result.errors).includes('7500')){
    console.log('D1 quota exhausted: deployed zero-write replay verification deferred until reset.');
    process.exit(0);
  }
  throw Error('Unable to read existing D1 fixture for deployed write verification');
}
const job=result.result[0]?.results?.[0];
assert.ok(job,'An existing active job is required to verify deployed ingestion');
job.skills=JSON.parse(job.skills);
const replay=await fetch(`${origin}/api/ingest`,{
  method:'POST',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},
  body:JSON.stringify({jobs:[job]}),signal:AbortSignal.timeout(20000),
});
assert.equal(replay.status,200,'Deployed existing-record replay failed');
const outcome=await replay.json();
assert.equal(outcome.accepted,1);assert.equal(outcome.rejected,0);
assert.equal(outcome.d1_rows_written,0,'Existing-record replay consumed D1 writes');
assert.deepEqual(outcome.new_job_keys,[]);
console.log('VERIFIED deployed ingestion: existing job accepted, zero D1 rows written, no new job created.');
