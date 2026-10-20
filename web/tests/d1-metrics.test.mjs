import test from 'node:test';
import assert from 'node:assert/strict';
import {d1Metrics} from '../worker/d1-metrics.ts';
test('database telemetry aggregates measured metadata without jobs, queries or private data',()=>{
 const captured=[],log=console.log;console.log=value=>captured.push(value);
 try{
  const m=d1Metrics('/api/ingest',[{meta:{rows_read:700,rows_written:2,duration:1.25}},{meta:{rows_read:3,rows_written:0,duration:2}},{}]);
  assert.equal(m.rows_read,703);assert.equal(m.rows_written,2);assert.equal(m.headers['X-JobRadar-D1-Rows-Read'],'703');
  assert.deepEqual(JSON.parse(captured[0]),{event:'d1_usage',route:'/api/ingest',rows_read:703,rows_written:2,query_ms:3.25});
 }finally{console.log=log;}
});
