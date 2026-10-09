import test from 'node:test';
import assert from 'node:assert/strict';
import {safeUrl} from '../worker/urls.ts';
test('legacy Workday URLs become HTTPS while unsafe URLs remain rejected',()=>{
  assert.equal(safeUrl('http://bakerhughes.wd5.myworkdayjobs.com/BakerHughes/userHome/'),'https://bakerhughes.wd5.myworkdayjobs.com/BakerHughes/userHome/');
  for(const value of ['http://employer.test/careers','http://myworkdayjobs.com.evil.test/job','javascript:alert(1)','https://user:password@employer.test/job','not a URL'])assert.equal(safeUrl(value),null);
  assert.equal(safeUrl('https://employer.test/job'),'https://employer.test/job');
});
