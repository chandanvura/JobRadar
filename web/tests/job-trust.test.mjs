import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFreshness} from '../lib/job-trust.ts';
import {remoteEligibility} from '../lib/remote-eligibility.ts';
import {personalMatch} from '../lib/job-match.ts';
const now=Date.parse('2026-10-20T16:00:00Z');
const source={last_checked_at:'2026-10-20T15:00:00Z',last_success_at:'2026-10-20T15:00:00Z',error_count:0,warning:null};
test('source freshness distinguishes saved data, failed checks, stale checks and missing evidence',()=>{
 assert.match(sourceFreshness(source,false,source.last_checked_at,now).label,/Live catalogue · Source checked/);
 assert.match(sourceFreshness({...source,error_count:1},true,source.last_checked_at,now).label,/Saved catalogue · Source failed/);
 assert.match(sourceFreshness({...source,last_checked_at:'2026-10-20T09:00:00Z'},false,'bad',now).label,/stale/);
 assert.equal(sourceFreshness(undefined,true,'bad',now).seen,null);
 assert.equal(sourceFreshness({...source,last_checked_at:'2026-10-21T15:00:00Z'},false,'bad',now).checked,null);
 assert.match(sourceFreshness({...source,warning:'Limited coverage: page cap'},false,source.last_checked_at,now).label,/Limited source coverage/);
});
test('remote country evidence never turns generic remote into India permission',()=>{
 for(const location of ['Remote','Remote - Asia','Remote anywhere','Global remote'])assert.equal(remoteEligibility(location,[]).status,'unverified');
 for(const location of ['Remote - India','India (Remote)'])assert.equal(remoteEligibility(location,[]).status,'india');
 for(const location of ['Remote - USA','Remote - United Kingdom','Remote - Europe'])assert.equal(remoteEligibility(location,[]).status,'restricted');
 assert.equal(remoteEligibility('Remote - India',[{text:'Remote work is US-only.'}]).status,'conflict');
 assert.equal(remoteEligibility('Bengaluru',[{text:'Support remote customers.'}]).status,'none');
 assert.equal(remoteEligibility('Bengaluru',[{text:'This is a remote role. You must check country eligibility.'}]).status,'unverified');
});
test('missing optional skills do not reduce required-skill fit or appear as essential gaps',()=>{
 const prefs={titles:['Java Developer'],skills:['Java'],experienceMin:0,experienceMax:3};
 const job={title:'Java Developer',role_category:'Java / Backend',skills:'["Java","AWS","Docker"]',experience_min:0,experience_max:2,is_eligible:1,relevance_score:70,posted_at:null,posted_label:null,reported_age_hours:null};
 const base=personalMatch({...job,description:'Required: Java.'},prefs);
 const optional=personalMatch({...job,description:'Required: Java. Preferred: AWS and Docker.'},prefs);
 assert.equal(optional.components.skills,base.components.skills);
 assert.deepEqual(optional.missingRequiredSkills,[]);assert.deepEqual(optional.missingSkills,[]);
 const missing=personalMatch({...job,description:'Required: Java and AWS. Preferred: Docker.'},prefs);
 assert.deepEqual(missing.missingRequiredSkills,['aws']);assert.deepEqual(missing.missingSkills,['aws']);
 assert.ok(missing.components.skills<optional.components.skills);
 const preferredOnly=personalMatch({...job,description:'Preferred: AWS.'},prefs);
 assert.equal(preferredOnly.components.skills,50);
 assert.equal(personalMatch({...job,description:'Preferred: AWS.'},{...prefs,skills:['AWS']}).components.skills,100);
 assert.equal(optional.experienceMatch,base.experienceMatch);assert.equal(job.is_eligible,1);
});
