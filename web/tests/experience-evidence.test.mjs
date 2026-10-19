import test from 'node:test';
import assert from 'node:assert/strict';
import fixtures from '../../config/experience-fixtures.json' with {type:'json'};
import {analyzeExperience,experienceWithinPolicy,experienceDecision} from '../lib/job-experience.ts';
import {normalizeExperience} from '../lib/job-requirements.ts';
import {matchesCareerView,visibleCareerJobs} from '../lib/job-view.ts';
for(const fixture of fixtures)test(`experience: ${fixture.name}`,()=>{
 const result=analyzeExperience(fixture.text);
 assert.deepEqual([result.min,result.max,result.status],[fixture.min,fixture.max,fixture.status]);
 if('preferred' in fixture)assert.equal(result.preferred.length,fixture.preferred);
 assert.ok([...result.required,...result.preferred].every(item=>item.evidence&&item.section));
 const expected=fixture.status!=='stated'?'Verify JD before shortlisting':experienceWithinPolicy(fixture.min,fixture.max)?'Shortlist by experience':'Do not shortlist by experience';
 assert.equal(experienceDecision(result),expected);
 const normalized=normalizeExperience(job({description:fixture.text,experience_min:fixture.min,experience_max:fixture.max,experience_label:result.label}));
 assert.equal(matchesCareerView(normalized,'Recommended',0,3,true),expected==='Shortlist by experience');
});
test('old numeric scan values cannot approve missing, unsupported or negated JD evidence',()=>{
 for(const description of [undefined,'','Build APIs using Java.','Experience: 2 years of Java is not required']){
  const result=normalizeExperience(job({experience_min:1,experience_max:2,experience_label:'1–2',description}));
  assert.equal(result.is_eligible,0);assert.equal(result.experience_min,null);assert.equal(result.experience_max,null);
  assert.equal(matchesCareerView(result,'Recommended',0,3,true),false);
 }
});
const job=(changes={})=>({title:'Java Developer',is_active:1,is_eligible:1,experience_min:null,experience_max:null,experience_label:'Unknown',eligibility_reason:'Experience not stated — verify',...changes});
test('JD extraction repairs labels without fabricating scan approval or weakening stricter scan evidence',()=>{
 const result=normalizeExperience(job({is_eligible:0,description:'Experience: 1–2 years'}));
 assert.equal(result.experience_min,1);assert.equal(result.is_eligible,0);assert.match(result.eligibility_reason,/awaiting scan verification/);
 const stricter=normalizeExperience(job({experience_min:5,experience_max:8,experience_label:'5–8',description:'Experience: 1–2 years'}));
 assert.equal(stricter.experience_min,5);assert.equal(stricter.is_eligible,0);assert.match(stricter.eligibility_reason,/differs/);
 for(const description of ["Qualifications: Bachelor's with 4 years experience or Master's with 2 years experience",'Experience: 3–1 years','Preferred Experience: 2 years'])assert.equal(normalizeExperience(job({description})).is_eligible,0);
});
test('verified recommendations reject unknown and open 3+ requirements; no fallback inserts review leads',()=>{
 assert.equal(matchesCareerView(job(),'Recommended',0,3,true),false);
 assert.equal(matchesCareerView(job({experience_min:3}),'Recommended',0,3,true),false);
 assert.equal(experienceWithinPolicy(2,null),true);assert.equal(experienceWithinPolicy(1,3),true);
 assert.deepEqual(visibleCareerJobs('Recommended',[],[job()]),[]);
});
