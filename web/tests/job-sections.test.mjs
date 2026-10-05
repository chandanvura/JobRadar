import test from 'node:test';
import assert from 'node:assert/strict';
import {internshipRole,fresherRole,technicalInternshipRole} from '../lib/job-sections.ts';
const job=(title,minimum=null)=>({title,experience_min:minimum,employment_type:'Full-time'});
test('internships and apprenticeships never enter the full-time fresher section',()=>{
 for(const title of ['Java Intern','Cloud Apprenticeship','Graduate Apprentice']) {
  assert.equal(internshipRole(job(title,0)),true);assert.equal(fresherRole(job(title,0)),false);
 }
 assert.equal(internshipRole({...job('Software Engineer'),employment_type:'Internship'}),true);
});
test('fresher roles distinguish zero-experience jobs from 1–3-year jobs and unknown generic titles',()=>{
 assert.equal(fresherRole(job('Software Engineer',0)),true);
 assert.equal(fresherRole(job('Graduate Software Engineer')),true);
 assert.equal(fresherRole(job('Software Engineer')),false);
 assert.equal(fresherRole(job('Junior Software Engineer',1)),false);
 assert.equal(fresherRole(job('Senior Software Engineer',0)),false);
});

test('existing nontechnical apprentices are filtered before a new collector run',()=>{assert.equal(technicalInternshipRole(job('Talent Acquisition Coordinator Trainee_Non-Technical Graduate Apprentice',0)),false);assert.equal(technicalInternshipRole(job('Cloud Engineering Intern')),true);});
