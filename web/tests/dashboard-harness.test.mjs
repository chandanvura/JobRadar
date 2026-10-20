import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {build} from 'esbuild';
import {JSDOM} from 'jsdom';
import React,{act} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.history=dom.window.history;
globalThis.HashChangeEvent=dom.window.HashChangeEvent;globalThis.CustomEvent=dom.window.CustomEvent;
globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
const {createRoot}=await import('react-dom/client');
const directory=await mkdtemp(new URL('../node_modules/.dashboard-harness-',import.meta.url).pathname);
const output=await build({entryPoints:[new URL('../components/jobradar-dashboard.tsx',import.meta.url).pathname],bundle:true,write:false,platform:'node',format:'esm',packages:'external',alias:{'next/link':'next/link.js'},jsx:'automatic',logLevel:'silent'});
await writeFile(`${directory}/dashboard.mjs`,output.outputFiles[0].text);
const {JobRadarDashboard}=await import(`${directory}/dashboard.mjs`);
const now=new Date().toISOString();
const jobs=Array.from({length:7000},(_,i)=>({id:i+1,company:`Company ${i%700}`,external_job_id:String(i+1),title:`Java Engineer ${i}`,description:i===0?'Experience: 0–2 years. Must know Java and AWS. Preferred Experience: 5 years.':'Experience: 0–2 years. Must know Java and AWS. Preferred: Terraform.',normalized_location:i%2?'Hyderabad':'Bengaluru',location:'India',experience_min:0,experience_max:2,experience_label:'0–2',skills:'["Java","AWS"]',role_category:'Java / Backend',ats_provider:'test',application_url:`https://employer.test/jobs/${i+1}`,career_page_url:'https://employer.test',posted_at:now,posted_label:null,posted_precision:'exact',reported_age_hours:null,first_seen_at:now,last_seen_at:now,relevance_score:70,is_active:1,is_eligible:1,eligibility_reason:''}));
const companies=Array.from({length:700},(_,i)=>({name:`Company ${i}`,careers_url:'https://employer.test',ats_provider:'test',last_checked_at:now,last_success_at:now,error_count:0,jobs_found:10,candidate_jobs:10,eligible_jobs:10,warning:null}));
const payload={jobs:jobs.slice(0,100),companies,latest_run:{finished_at:now,status:'success',companies_checked:700,companies_successful:700},runs:[],notifications:[],configured:true,server_time:now,policy:{cities:['Bengaluru','Hyderabad']}};
const fetcher=globalThis.fetch;let fetchCalls=0,holdRefresh=false,releaseRefresh,omitTrackedJob=false;
globalThis.fetch=async path=>{
 fetchCalls++;
 if(path==='/api/dashboard'){
  if(holdRefresh)await new Promise(resolve=>releaseRefresh=resolve);
  return Response.json({...payload,jobs:payload.jobs.filter(job=>!omitTrackedJob||job.id!==1)});
 }
 const url=new URL(path,'https://test.example'),after=Number(url.searchParams.get('after'));
 const batch=jobs.filter(job=>job.id>after).slice(0,500);
 return Response.json({jobs:batch,next_cursor:batch.at(-1).id===7000?null:batch.at(-1).id});
};
const click=async text=>{const node=[...document.querySelectorAll('button')].find(node=>node.textContent.trim()===text);assert.ok(node,`button ${text}`);await act(()=>node.click());};
const results=()=>document.querySelector('[aria-label="Job results"]')?.textContent;
async function settle(predicate){for(let i=0;i<150;i++){await act(()=>new Promise(resolve=>setTimeout(resolve,10)));if(predicate())return;}assert.fail('Dashboard did not settle');}
test('full dashboard: 7,000 jobs, 700 companies, navigation, page retention and refresh cancellation',async()=>{
 let root=createRoot(document.getElementById('root'));
 try{
  await act(()=>root.render(React.createElement(JobRadarDashboard)));
  await settle(()=>results()?.includes('of 7000 jobs'));
  const loadedCalls=fetchCalls;
  await click('Edit search');
  const editor=()=>document.querySelector('[aria-label="Edit job search preferences"]');
  assert.ok(editor());
  await act(()=>editor().querySelector('input[type="checkbox"]').click());
  const editStarted=performance.now();await click('Save & search jobs');
  assert.equal(editor(),null);assert.equal(fetchCalls,loadedCalls,'saving preferences must not refetch the catalog');
  assert.equal(JSON.parse(localStorage.getItem('jobradar-search-preferences-v1')).locations.includes('Bengaluru'),false);
  await click('Edit search');await click('Reset defaults');await click('Save & search jobs');
  assert.equal(fetchCalls,loadedCalls);
  console.log(`HARNESS PERF: 7,000-job preference edit, save and reset ${Math.round(performance.now()-editStarted)} ms; no catalog refetch`);
  const durations=[];
  for(const view of ['All Jobs','Recommended','Needs Review','Internships','Saved','Applications','All Jobs']){
   const started=performance.now();await click(view);durations.push(Math.round(performance.now()-started));
   assert.equal(document.querySelector('h1').textContent,view);
   assert.ok(document.querySelectorAll('[aria-label="Job results"] article').length<=30);
  }
  assert.equal([...document.querySelectorAll('nav[aria-label="JobRadar views"] button')].some(node=>node.textContent.trim()==='Fresher Roles'),false);
  assert.equal(document.querySelectorAll('article details').length>0,true);
  assert.ok([...document.querySelectorAll('article summary')].some(node=>node.textContent==='Shortlist by experience'));
  assert.equal([...document.querySelectorAll('article details')].find(node=>node.querySelector('summary')?.textContent==='Track & give feedback').open,false);
  await click('More filters');
  const experience=document.querySelector('[aria-label="Experience view"]');
  await act(()=>{experience.value='fresher';experience.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal(document.querySelector('h1').textContent,'Fresher Roles');
  await click('Recommended');
  const feedback=document.querySelector('select[aria-label^="Recommendation feedback"]'),label=feedback.getAttribute('aria-label');
  await act(()=>{feedback.value='experience';feedback.dispatchEvent(new window.Event('change',{bubbles:true}));});
  assert.equal([...document.querySelectorAll('select')].some(node=>node.getAttribute('aria-label')===label),false);
  assert.ok(Object.values(JSON.parse(localStorage.getItem('jobradar-tracking-v2'))).some(row=>row.feedback==='experience'&&row.preference_at));
  const metric=label=>[...document.querySelectorAll('p')].find(node=>node.textContent===label)?.previousElementSibling?.textContent;
  assert.equal(Number(metric('Verified < 3h')?.replaceAll(',','')),6999);
  await click('Needs Review');assert.ok(document.body.textContent.includes('Experience feedback — verify JD'));
  assert.equal(document.querySelectorAll('[aria-label="Job results"] article').length,1);
  await click('All Jobs');
  const restore=[...document.querySelectorAll('select')].find(node=>node.getAttribute('aria-label')===label);assert.ok(restore);
  await act(()=>{restore.value='';restore.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await act(()=>[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Show more jobs')).click());
  assert.match(results(),/Page 2/);
  holdRefresh=true;await act(()=>document.querySelector('[aria-label="Refresh jobs"]').click());
  await settle(()=>Boolean(releaseRefresh));assert.match(results(),/Page 2/);assert.equal(document.querySelector('[aria-label="Refresh jobs"]').disabled,true);
  holdRefresh=false;await act(()=>releaseRefresh());await settle(()=>!document.querySelector('[aria-label="Refresh jobs"]').disabled);assert.match(results(),/Page 2/);
  await click('Career tools');await click('Companies');
  assert.equal(document.querySelectorAll('tbody tr').length,30);assert.equal(document.querySelectorAll('article').length,30);
  const more=[...document.querySelectorAll('button')].find(b=>b.textContent.startsWith('Show more companies'));await act(()=>more.click());
  assert.match(document.querySelector('[aria-label="Company results"]').textContent,/Page 2/);
  await click('All Jobs');
  const stage=document.querySelector('[aria-label="Application stage for Java Engineer 0"]');assert.ok(stage);
  await act(()=>{stage.value='Applied';stage.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await act(()=>{stage.value='Interview';stage.dispatchEvent(new window.Event('change',{bubbles:true}));});
  if(!document.querySelector('[aria-label="Work arrangement filter"]'))await click('More filters');
  const arrangement=document.querySelector('[aria-label="Work arrangement filter"]');
  await act(()=>{arrangement.value='Remote';arrangement.dispatchEvent(new window.Event('change',{bubbles:true}));});
  await click('Applications');assert.equal(document.querySelectorAll('article').length,1);
  await click('Add notes or referral status');
  assert.ok(document.body.textContent.includes('Application history'));
  assert.ok(document.body.textContent.includes('Applied ·'));
  assert.ok(document.body.textContent.includes('Interview ·'));
  // Simulate a fresh page after the employer removes the opening.
  omitTrackedJob=true;await act(()=>root.unmount());root=createRoot(document.getElementById('root'));
  await act(()=>root.render(React.createElement(JobRadarDashboard)));
  await settle(()=>Boolean(document.querySelector('[aria-label="Application stage for Java Engineer 0"]')));
  assert.equal(document.querySelector('[aria-label="Application stage for Java Engineer 0"]').value,'Interview');
  assert.ok(document.body.textContent.includes('No longer in live feed'));
  await click('Dashboard');assert.equal(document.querySelector('h1').textContent,'Dashboard');
  console.log(`HARNESS PERF: full dashboard navigation ${durations.join(', ')} ms; bounded 30 job cards / 30 company rows`);
 }finally{await act(()=>root.unmount());globalThis.fetch=fetcher;dom.window.close();await rm(directory,{recursive:true,force:true});}
});
