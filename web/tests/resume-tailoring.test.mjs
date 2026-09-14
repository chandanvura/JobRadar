import test from 'node:test';
import assert from 'node:assert/strict';
import {blankResume,cleanResume,hasResume,tailorResume,matches} from '../lib/resume-tailoring.ts';
const base={...blankResume,name:'Example Candidate',skills:'Python, SQL, Java',experience:'Employer A | Engineer | 2024\n- Built Python tools\n  for internal teams\n- Built Java services\nEmployer B | Intern | 2023\n- Tested SQL queries\n- Wrote Java tests'};
test('tailoring preserves facts, master and employer grouping',()=>{
 const original=structuredClone(base),result=tailorResume(base,'Java Kubernetes');
 assert.deepEqual(base,original);
 assert.equal(result.resume.experience,'Employer A | Engineer | 2024\n- Built Java services\n- Built Python tools\n  for internal teams\nEmployer B | Intern | 2023\n- Wrote Java tests\n- Tested SQL queries');
 assert.equal(result.resume.skills,'Java, Python, SQL');
 assert.deepEqual(result.missing,['Kubernetes']);
 assert.ok(!result.resume.skills.includes('Kubernetes'));
 assert.deepEqual(result.resume.experience.split('\n').sort(),base.experience.split('\n').sort());
});
test('each job is derived independently from the unchanged master',()=>{
 const a=tailorResume(base,'Java'),b=tailorResume(base,'Python');
 assert.equal(b.resume.skills,'Python, SQL, Java');assert.equal(a.resume.skills,'Java, Python, SQL');
 assert.equal(b.resume.jd,'Python');
});
test('empty descriptions keep order and keyword boundaries avoid false positives',()=>{
 assert.equal(tailorResume(base,'').resume.experience,base.experience);
 assert.equal(matches('JavaScript','Java'),false);assert.equal(matches('C++ experience','C++'),true);
});
test('resume setup requires identity and evidence and sanitizes stored fields',()=>{
 assert.equal(hasResume(blankResume),false);assert.equal(hasResume(base),true);
 assert.deepEqual(cleanResume(null),blankResume);assert.equal(cleanResume({name:22}).name,'');
 assert.equal(cleanResume({skills:'x'.repeat(30000)}).skills.length,20000);
});
