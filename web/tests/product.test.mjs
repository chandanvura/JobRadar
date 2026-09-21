import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanSearch,privateKey,writePrivate,readPrivate,safeTracking} from '../lib/private-profile.ts';
import {postingAge,currentPosting} from '../lib/job-time.ts';
test('profile storage preserves owner keys and isolates other users',()=>{
 const memory=new Map();globalThis.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
 globalThis.window={location:{search:''}};
 writePrivate('jobradar-tracking-v2','owner');assert.equal(privateKey('jobradar-tracking-v2'),'jobradar-tracking-v2');
 window.location.search='?profile=friend';assert.equal(readPrivate('jobradar-tracking-v2'),null);writePrivate('jobradar-tracking-v2','friend');
 window.location.search='';assert.equal(readPrivate('jobradar-tracking-v2'),'owner');
});
test('untrusted search links normalize bounds and terms',()=>{
 const p=cleanSearch({titles:['Java','Java',null],locations:['Mars'],experienceMin:-5,experienceMax:'NaN'});
 assert.deepEqual(p.titles,['Java']);assert.equal(p.experienceMin,0);assert.equal(p.experienceMax,3);assert.deepEqual(p.locations,['Bengaluru','Hyderabad']);
 assert.deepEqual(cleanSearch(null),cleanSearch({}));
});
test('backup import rejects executable application links and malformed records',()=>{
 const job={title:'Engineer',company:'Test',normalized_location:'Bengaluru',skills:'[]',role_category:'Software Engineering',ats_provider:'test',external_job_id:'1',first_seen_at:'2026-09-13',application_url:'javascript:alert(1)',career_page_url:'https://example.com'};
 assert.deepEqual(safeTracking({'test:1':{job}}),{});job.application_url='https://example.com/job';assert.ok(safeTracking({'test:1':{job}})['test:1']);
 assert.deepEqual(safeTracking({'test:1':null}),{});
});
test('relative employer ages advance after observation',()=>{
 const now=Date.parse('2026-09-13T12:00:00Z');const job={reported_age_hours:2,posted_at:null,last_seen_at:'2026-09-12T12:00:00Z',posted_precision:'hour'};
 assert.equal(postingAge(job,now),26);assert.equal(currentPosting(job,now),false);
});
test('unknown, future, invalid dates never become fresh',()=>{
 for(const date of [null,'bad','2026-09-14T00:00:00Z'])assert.equal(currentPosting({reported_age_hours:null,posted_at:date,last_seen_at:'',posted_precision:'unknown'},Date.parse('2026-09-13T12:00:00Z')),false);
});
test('internship product area is isolated and uses explicit board filters',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('../components/jobradar-dashboard.tsx',import.meta.url),'utf8');
 assert.match(source,/active === "Internships" && !isInternship\(j\)/);
 assert.match(source,/active !== "Internships"[\s\S]*!\["Saved", "Applications"\]\.includes\(active\)[\s\S]*isInternship\(j\)/);
 assert.match(source,/f_JT=I&f_E=1%2C2&sortBy=DD/);
 assert.match(source,/f_JT=F&f_E=2&sortBy=DD/);
 assert.match(source,/active === "Internships" \? internshipBengaluru : bengaluru/);
 assert.match(source,/active === "Internships" \? internshipHyderabad : hyderabad/);
 assert.match(source,/Official ATS internships — Bengaluru/);
 assert.match(source,/apprentice\|apprenticeship/);
});

test('company coverage has safe career and contact fallback discovery',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('../components/jobradar-dashboard.tsx',import.meta.url),'utf8');
 assert.match(source,/Fallback discovery/);
 assert.match(source,/recruiter OR talent acquisition OR engineering manager/);
 assert.match(source,/>Contacts<\/a>/);
});
test('buyer-facing experience leads with the trust promise and hides operations',async()=>{
 const source=await (await import('node:fs/promises')).readFile(new URL('../components/jobradar-dashboard.tsx',import.meta.url),'utf8');
 assert.match(source,/EARLY-CAREER OPPORTUNITY RADAR/);
 assert.match(source,/Skip stale reposts\. Find verified roles where you can actually apply\./);
 assert.match(source,/official employer career pages/);
 assert.match(source,/Evidence before recommendation/);
 assert.match(source,/Private by default/);
 assert.match(source,/aria-expanded=\{showOperations\}/);
 assert.match(source,/System & privacy/);
});
test('employer timestamps keep the 24-hour boundary',()=>{
 const now=Date.parse('2026-09-13T12:00:00Z');const job={reported_age_hours:null,posted_at:'2026-09-12T12:00:00Z',last_seen_at:'',posted_precision:'exact'};assert.equal(currentPosting(job,now),true);assert.equal(currentPosting(job,now+1),false);
});
test('today labels expire at the next India calendar day',()=>{
 const job={reported_age_hours:null,posted_at:null,posted_label:'Posted today',last_seen_at:'2026-09-13T10:00:00Z',posted_precision:'day'};
 assert.equal(currentPosting(job,Date.parse('2026-09-13T12:00:00Z')),true);
 assert.equal(currentPosting(job,Date.parse('2026-09-13T19:00:00Z')),false);
});
import {buildJakeResume} from '../lib/resume-export.ts';
test('Jake export escapes user LaTeX and retains content and license',()=>{
 const output=buildJakeResume('Example & Test','test@example.com',[['Experience','Reduced latency by 20%\n- Used Java & SQL\n\\input{private}']]);
 assert.ok(output.includes('MIT License'));assert.ok(output.includes('20\\%'));assert.ok(output.includes('Java \\& SQL'));assert.ok(output.includes('\\textbackslash{}input\\{private\\}'));assert.ok(output.includes('\\begin{document}'));
});
