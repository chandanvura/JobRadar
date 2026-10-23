import test from 'node:test';
import assert from 'node:assert/strict';
import {formatIstTimestamp,istDateKey} from '../lib/job-time.ts';
test('timestamps use IST across midnight and invalid values stay honest',()=>{
 assert.match(formatIstTimestamp('2026-10-22T20:00:00Z'),/23 Oct 2026.*01:30:00.*am IST/i);
 assert.equal(istDateKey(Date.parse('2026-10-22T20:00:00Z')),'2026-10-23');
 assert.equal(formatIstTimestamp('bad'),'Time unknown');
});
