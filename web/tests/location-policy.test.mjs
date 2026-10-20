import test from 'node:test';
import assert from 'node:assert/strict';
import {discoveryLocations,shortlistCities,enforceShortlistLocation,shortlistLocation,locationMatches} from '../lib/location-policy.ts';
import {matchesCareerView} from '../lib/job-view.ts';

test('nationwide and explicit India remote are discovery only; shortlist stays in two cities',()=>{
 assert.deepEqual(shortlistCities,['Bengaluru','Hyderabad']);
 assert.ok(discoveryLocations.includes('Other India'));
 const base={title:'Java Engineer',is_active:1,is_eligible:1,experience_min:1,experience_max:2,experience_label:'1–2',eligibility_reason:'Eligible'};
 for(const [city,normalized_location,allowed] of [['Bengaluru','Bengaluru',true],['Hyderabad','Hyderabad',true],['Remote (India)','Remote (India)',false],['Other India','Pune, India',false]]){
  const job={...base,city,normalized_location};
  assert.equal(matchesCareerView(job,'All Jobs',0,3,true),true);
  assert.equal(matchesCareerView(job,'Recommended',0,3,true),allowed);
  assert.equal(Boolean(enforceShortlistLocation(job).is_eligible),allowed);
  assert.equal(matchesCareerView(job,'Applications',0,3,true),true);
 }
 assert.equal(locationMatches({city:'Other India',normalized_location:'Chennai, India'},'Other India'),true);
});

test('old eligible flags and ambiguous foreign Hyderabad cannot enter shortlist',()=>{
 const remote={city:'Remote (India)',normalized_location:'Remote (India)',is_eligible:1,eligibility_reason:'Eligible',id:123};
 const gated=enforceShortlistLocation(remote);
 assert.equal(gated.id,123);assert.equal(gated.is_eligible,0);assert.match(gated.eligibility_reason,/Outside shortlist cities/);
 assert.equal(remote.is_eligible,1);
 assert.equal(shortlistLocation({city:'Hyderabad',location:'Hyderabad, Pakistan',normalized_location:'Hyderabad'}),false);
 assert.equal(shortlistLocation({city:'Other India',normalized_location:'Bengaluru'}),false);
});
