import test from 'node:test';
import assert from 'node:assert/strict';
import data from './fixtures/real-search-review.json' with {type:'json'};
import {createJobSearchIndex} from '../lib/job-search.ts';
import {matchesCareerView} from '../lib/job-view.ts';
test('reviewed real-listing queries retain all annotated 0–3 YOE discovery candidates',()=>{
 const candidates=data.jobs.filter(j=>matchesCareerView(j,'Dashboard',0,3,false));
 const index=createJobSearchIndex(candidates);
 for(const {query,relevance} of data.queries){
  const hits=[...index.search(query).keys()].slice(0,5);
  assert.ok(hits.length,query);
  for(const key of Object.keys(relevance))assert.ok(hits.some(j=>j.key===key),`${query}: missed ${key}`);
  for(const j of hits)assert.ok(relevance[j.key],`${query}: unrelated ${j.key}`);
 }
});
