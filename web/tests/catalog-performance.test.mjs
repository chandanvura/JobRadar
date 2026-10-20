import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker as NodeWorker} from 'node:worker_threads';
import {prepareCatalog,prepareCooperatively} from '../lib/prepare-catalog.ts';
import {extractRequirements,requirementsFor,normalizeExperience} from '../lib/job-requirements.ts';
const description='Requirements: Java, AWS and Kubernetes are required. 2 years of experience. Preferred: Terraform and SQL. '.repeat(60);
const job=()=>({description,normalized_location:'Hyderabad',experience_label:'Entry-level title',experience_min:0,experience_max:3,is_eligible:1,eligibility_reason:''});
class BrowserWorker {
  constructor(url) {
    this.worker=new NodeWorker(`const {parentPort}=require('node:worker_threads');import(${JSON.stringify(url.href)}).then(({analyzeRequirements})=>parentPort.on('message',message=>parentPort.postMessage(analyzeRequirements(message.jobs))));`,{eval:true});
    this.worker.on('message',data=>this.onmessage?.({data}));
    this.worker.on('error',error=>this.onerror?.(error));
  }
  postMessage(message){this.worker.postMessage(message);}
  terminate(){void this.worker.terminate();}
}
test('large catalog analysis keeps the event loop moving and primes exact requirement evidence',async()=>{
  globalThis.Worker=BrowserWorker;
  const jobs=Array.from({length:2000},job),expected=extractRequirements(description,'Hyderabad');
  let beats=0;const timer=setInterval(()=>beats++,5);const started=performance.now();
  try{
    await prepareCatalog(jobs);
    assert.ok(beats>3,'UI event loop must run while descriptions are parsed');
    assert.deepEqual(requirementsFor(jobs[0]),expected);
    const normalized=normalizeExperience(jobs[0]);
    Object.defineProperty(normalized,'description',{get(){throw Error('must reuse primed analysis');}});
    assert.deepEqual(requirementsFor(normalized),expected);
    console.log(`HARNESS PERF: 2,000 full descriptions analyzed in worker; ${beats} event-loop ticks in ${Math.round(performance.now()-started)} ms`);
  }finally{clearInterval(timer);delete globalThis.Worker;}
});
test('worker failure falls back cooperatively; abort ends pending work without publishing stale analysis',async()=>{
  globalThis.Worker=class {postMessage(){queueMicrotask(()=>this.onerror());}terminate(){}};
  const jobs=Array.from({length:200},job);let yielded=false;const timer=setTimeout(()=>yielded=true,0);
  try{await prepareCatalog(jobs);assert.equal(yielded,true);assert.ok(requirementsFor(jobs[0]).requiredSkills.length);}
  finally{clearTimeout(timer);delete globalThis.Worker;}
  const controller=new AbortController();setTimeout(()=>controller.abort(),0);
  await assert.rejects(prepareCooperatively(Array.from({length:2000},job),controller.signal),{name:'AbortError'});
  let stopped=false;
  globalThis.Worker=class {postMessage(){queueMicrotask(()=>controller2.abort());}terminate(){stopped=true;}};
  const controller2=new AbortController();
  try{await assert.rejects(prepareCatalog([job()],controller2.signal),{name:'AbortError'});assert.equal(stopped,true);}
  finally{delete globalThis.Worker;}
});

test('preference edits reuse compiled title families and preserve exact matching decisions',async()=>{
 const {personalMatch,createPersonalMatcher}=await import('../lib/job-match.ts');
 const preferences={titles:['DevOps Engineer','Java Developer','Cloud Engineer','Platform Engineer','Site Reliability Engineer','Software Engineer I','Backend Developer','Spring Boot Developer'],skills:['Java','AWS','Kubernetes','Terraform'],locations:['Bengaluru','Hyderabad'],experienceMin:0,experienceMax:3};
 const jobs=Array.from({length:2000},(_,i)=>({...job(),title:i%2?'DevOps Engineer':'Java Developer',role_category:i%2?'DevOps / Cloud':'Software Engineering',skills:'["Java","AWS"]',relevance_score:80,posted_at:null,posted_label:null,reported_age_hours:null}));
 await prepareCooperatively(jobs);
 const before=performance.now(),expected=jobs.map(j=>personalMatch(j,preferences)),baseline=performance.now()-before;
 const match=createPersonalMatcher(preferences),after=performance.now(),actual=jobs.map(match),compiled=performance.now()-after;
 assert.deepEqual(actual,expected);
 console.log(`HARNESS PERF: 2,000 preference matches: repeated setup ${Math.round(baseline)} ms; compiled preferences ${Math.round(compiled)} ms; exact decisions preserved`);
});
