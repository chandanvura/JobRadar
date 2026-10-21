import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSearch} from '../lib/private-profile.ts';
import {atsSearches,groupedAtsSearches} from '../lib/job-search-strategy.ts';

test('new search defaults stay in Bengaluru and Hyderabad; saved city preferences are preserved',()=>{
  assert.deepEqual(cleanSearch({}).locations,['Bengaluru','Hyderabad']);
  assert.deepEqual(cleanSearch({locations:['Hyderabad']}).locations,['Hyderabad']);
  assert.deepEqual(cleanSearch({locations:['Remote (India)','Remote - USA']}).locations,['Bengaluru','Hyderabad']);
});
test('manual India remote discovery queries require both India and remote terms',()=>{
  for(const searches of [atsSearches,groupedAtsSearches]){
    const result=searches('Java Developer','Remote (India)','day');
    assert.ok(result.length>0);
    for(const entry of result){
      const q=new URL(entry.url).searchParams.get('q');
      assert.ok(q.includes('"India" "Remote"'));
      assert.ok(!q.includes('Hyderabad'));
    }
  }
});
