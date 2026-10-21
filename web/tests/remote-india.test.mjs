import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSearch} from '../lib/private-profile.ts';
import {atsSearches,groupedAtsSearches} from '../lib/job-search-strategy.ts';

test('new search defaults stay in Bengaluru and Hyderabad; saved city preferences are preserved',()=>{
  assert.deepEqual(cleanSearch({}).locations,['Bengaluru','Hyderabad']);
  assert.deepEqual(cleanSearch({locations:['Hyderabad']}).locations,['Hyderabad']);
  assert.deepEqual(cleanSearch({locations:['Remote (India)','Remote - USA']}).locations,['Bengaluru','Hyderabad']);
});
test('manual search tools reject locations outside the two target cities',()=>{
  for(const searches of [atsSearches,groupedAtsSearches]){
    for(const city of ['Remote (India)','Other India','Pune']) assert.deepEqual(searches('Java Developer',city,'day'),[]);
    for(const city of ['Bengaluru','Hyderabad']) assert.equal(searches('Java Developer',city,'day').length,7);
  }
});
