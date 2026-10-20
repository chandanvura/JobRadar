import test from 'node:test';
import assert from 'node:assert/strict';
import taxonomy from '../../config/roles.json' with {type:'json'};
import {classifyRoleTitle,ROLE_TITLE_GROUPS,DEFAULT_SEARCH_TITLES,SUGGESTED_JOB_TITLES} from '../lib/role-taxonomy.ts';
test('every published title classifies consistently, without duplicate suggestions',()=>{
 for(const role of taxonomy.roles)for(const title of role.titles)assert.equal(classifyRoleTitle(title),role.family,title);
 assert.equal(new Set(SUGGESTED_JOB_TITLES.map(title=>title.toLowerCase())).size,SUGGESTED_JOB_TITLES.length);
 assert.equal(ROLE_TITLE_GROUPS.length,7);
 assert.ok(DEFAULT_SEARCH_TITLES.join(' OR ').length<200);
});
test('target aliases preserve boundaries and do not promote nontechnical roles',()=>{
 for(const [title,family] of [['CI/CD Engineer','DevOps'],['AWS Engineer','Cloud'],['Spring Boot Developer','Java / Backend'],['Infra Engineer','Infrastructure / Operations'],['Developer Productivity Engineer','Platform'],['SRE I','SRE']])assert.equal(classifyRoleTitle(title),family);
 for(const title of ['Civil Infra Engineer','Mechanical Production Reliability Engineer','Marketing Cloud Engineer','Human Resources Associate'])assert.equal(classifyRoleTitle(title),'Other');
 assert.notEqual(classifyRoleTitle('JavaScript Developer'),'Java / Backend');
});
