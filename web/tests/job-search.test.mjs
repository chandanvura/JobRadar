import test from 'node:test';
import assert from 'node:assert/strict';
import {createJobSearchIndex} from '../lib/job-search.ts';
import {classifyRoleTitle,SUGGESTED_JOB_TITLES} from '../lib/role-taxonomy.ts';
import taxonomy from '../../config/roles.json' with {type:'json'};
const job=(title,company='HPE',description='Python AWS Kubernetes software development')=>({title,company,description,skills:'["Python","AWS"]',role_category:classifyRoleTitle(title),normalized_location:'Bengaluru'});
test('all published title suggestions classify consistently in the browser',()=>{
 for(const role of taxonomy.roles) for(const title of role.titles)assert.equal(classifyRoleTitle(title),role.family,title);
 assert.ok(SUGGESTED_JOB_TITLES.includes('Cloud Developer'));
});
test('queries match terms across fields in either order, including requirements',()=>{
 const cloud=job('Cloud Developer'),other=job('Cloud Engineer','Other','Java only');const index=createJobSearchIndex([cloud,other]);
 assert.deepEqual([...index.search('hpe cloud').keys()],[cloud]);
 assert.deepEqual([...index.search('cloud HPE').keys()],[cloud]);
 assert.deepEqual([...index.search('HPE Kubernetes').keys()],[cloud]);
 assert.equal(index.search('cloud missingcompany').size,0);
});
test('aliases and bounded prefix/typo matching recover common search variants',()=>{
 const cloud=job('Cloud Developer'),sde=job('Software Development Engineer','Amazon');const index=createJobSearchIndex([cloud,sde]);
 assert.ok(index.search('cloud developr').has(cloud));
 assert.ok(index.search('cloud develo').has(cloud));
 assert.ok(index.search('hewlett packard enterprise cloud').has(cloud));
 assert.ok(index.search('sde amazon').has(sde));
 assert.ok(index.search('k8s bangalore').has(cloud));
 assert.equal(index.search('cX').size,0);
});
test('quoted phrases stay ordered and title evidence outranks description mentions',()=>{
 const direct=job('Cloud Developer'),indirect=job('Software Engineer','Other','We work with a Cloud Developer team');const index=createJobSearchIndex([direct,indirect]);
 assert.equal([...index.search('cloud developer').keys()][0],direct);
 assert.equal(index.search('"developer cloud"').size,0);
 assert.ok(index.search('"cloud developer"').has(direct));
});
test('hybrid retrieval recovers related roles while retaining employer and phrase constraints',()=>{
 const developer=job('Cloud Developer'),engineer=job('Cloud Engineer'),foreign=job('Cloud Engineer','Other');
 const index=createJobSearchIndex([developer,engineer,foreign]);
 const hits=[...index.search('HPE cloud developer').keys()];
 assert.equal(hits[0],developer);assert.ok(hits.includes(engineer));assert.ok(!hits.includes(foreign));
 assert.ok(!index.search('HPE "cloud developer"').has(engineer));
 assert.equal(index.search('missingcompany cloud developer').size,0);
});
test('concept retrieval finds requirements even without literal wording',()=>{
 const infra=job('Platform Engineer','HPE','Terraform AWS provisioning'),irrelevant=job('QA Engineer','Other','Manual tests');
 const index=createJobSearchIndex([infra,irrelevant]);
 assert.ok(index.search('HPE infrastructure as code').has(infra));
 assert.ok(index.search('HPE container orchestration').size===0);
});
test('role expansion does not admit unrelated jobs from employer boilerplate',()=>{
 const cloud=job('Cloud Developer'),hardware=job('ASIC Engineer','HPE','Our company works with cloud engineers worldwide.');
 const index=createJobSearchIndex([cloud,hardware]);
 assert.ok(index.search('HPE cloud developer').has(cloud));
 assert.ok(!index.search('HPE cloud developer').has(hardware));
});
