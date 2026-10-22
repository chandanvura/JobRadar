import test from 'node:test';
import assert from 'node:assert/strict';
import {applyMigrations} from '../scripts/apply-migrations.mjs';
import {verifyQuotaDeployment,appliedMigrationHashes} from '../scripts/verify-quota-deployment.mjs';

const internal='internal error; reference = e_test_123 [code: 7500]';
async function simulate(results) {
  let calls=0; const waits=[]; const logs=[];
  const status=await applyMigrations({run:()=>results[Math.min(calls++,results.length-1)],sleep:async ms=>waits.push(ms),save:log=>logs.push(log)});
  return {status,calls,waits,logs};
}
test('observed internal error retries and resumes through Wrangler after backoff',async()=>{
  const result=await simulate([{status:1,stderr:internal},{status:0,stdout:'No migrations to apply'}]);
  assert.equal(result.status,0); assert.equal(result.calls,2); assert.deepEqual(result.waits,[5000]);
  assert.equal(result.logs.at(-1),'No migrations to apply');
});
test('persistent internal error stops after three attempts and remains ineligible for quota bypass',async()=>{
  const result=await simulate([{status:1,stderr:internal}]);
  assert.equal(result.status,1); assert.equal(result.calls,3); assert.deepEqual(result.waits,[5000,15000]);
  assert.throws(()=>verifyQuotaDeployment(result.logs.at(-1),appliedMigrationHashes));
});
test('SQL, quota, auth, unknown, timeout and spawn failures are never replayed',async()=>{
  for(const failure of [
    {status:1,stderr:'SQLITE_ERROR: bad schema'},
    {status:1,stderr:"exceeded D1's free tier daily row [code: 7500]"},
    {status:1,stderr:'Unauthorized [code: 10000]'},
    {status:1,stderr:'unknown failure'},
    {status:1,stderr:internal+' SQLITE_ERROR'},
    {status:null,signal:'SIGTERM',stderr:internal},
    {status:null,error:new Error('spawn failed'),stderr:internal},
  ]) {
    const result=await simulate([failure]);
    assert.equal(result.status,1); assert.equal(result.calls,1); assert.deepEqual(result.waits,[]);
  }
});
