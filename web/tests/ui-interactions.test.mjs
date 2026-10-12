import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
import ts from 'typescript';
import React,{act} from 'react';
const boot=new JSDOM('<div></div>',{url:'https://test.example'});
globalThis.window=boot.window;globalThis.document=boot.window.document;
const {createRoot}=await import('react-dom/client');
boot.window.close();

const directory=await mkdtemp(new URL('./.ui-test-',import.meta.url).pathname);
async function component(name){
  const source=await readFile(new URL(`../components/${name}.tsx`,import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
  const path=`${directory}/${name}.mjs`;await writeFile(path,compiled);return import(path);
}
const {JobPagination,JOB_PAGE_SIZE}=await component('job-pagination');
const {PrivateNotes}=await component('private-notes');
function setup(){
  const dom=new JSDOM('<div id="root"></div>',{url:'https://test.example'});
  globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
  return {dom,root:createRoot(document.getElementById('root'))};
}
const click=async node=>act(()=>node.dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
const button=text=>[...document.querySelectorAll('button')].find(node=>node.textContent.startsWith(text));
test('10,000 jobs stay bounded; saves preserve the page; filters reset it; every page is reachable',async()=>{
  const {dom,root}=setup();let jobs=Array.from({length:10000},(_,id)=>({id})),key='all',saved=false;
  const render=()=>root.render(React.createElement(JobPagination,{jobs,resetKey:key,renderJob:job=>React.createElement('article',{key:job.id,'data-id':job.id},React.createElement('button',{onClick:()=>{saved=true;jobs=[...jobs];render();}},'Save'))}));
  try{
    await act(render);assert.equal(document.querySelectorAll('article').length,JOB_PAGE_SIZE);
    await click(button('Show more jobs'));
    assert.equal(document.querySelector('article').dataset.id,'30');assert.equal(document.querySelectorAll('article').length,30);
    assert.equal(document.activeElement.getAttribute('aria-live'),'polite');
    await click(document.querySelector('article button'));assert.equal(saved,true);
    assert.equal(document.querySelector('article').dataset.id,'30');
    // Clock/catalog reference changes must not collapse the current page.
    await act(()=>{jobs=jobs.map(job=>({...job}));render();});assert.equal(document.querySelector('article').dataset.id,'30');
    const select=document.querySelector('select');
    await act(()=>{select.value='333';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
    assert.equal(document.querySelector('article').dataset.id,'9990');assert.equal(document.querySelectorAll('article').length,10);assert.equal(button('Show more jobs').disabled,true);
    await click(button('Previous jobs'));assert.equal(document.querySelector('article').dataset.id,'9960');
    await act(()=>{key='hyderabad';render();});assert.equal(document.querySelector('article').dataset.id,'0');assert.equal(button('Previous jobs').disabled,true);
    await click(button('Show more jobs'));
    await act(()=>{jobs=jobs.slice(0,5);render();});assert.equal(document.querySelectorAll('article').length,5);assert.equal(document.querySelector('nav'),null);
    await act(()=>{jobs=[];render();});assert.equal(document.querySelectorAll('article').length,0);assert.match(document.querySelector('p').textContent,/Showing 0–0/);
  }finally{await act(()=>root.unmount());dom.window.close();}
});
test('notes do not rerank on each key; blur, idle and navigation flush pending edits once',async()=>{
  const {dom,root}=setup(),writes=[];
  try{
    await act(()=>root.render(React.createElement(PrivateNotes,{value:'',onSave:value=>writes.push(value)})));
    const textarea=document.querySelector('textarea');
    const input=value=>{
      Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype,'value').set.call(textarea,value);
      textarea.dispatchEvent(new window.Event('input',{bubbles:true}));
    };
    const blur=()=>textarea.dispatchEvent(new window.FocusEvent('focusout',{bubbles:true}));
    await act(()=>{for(const value of ['J','Ja','Java'])input(value);});
    assert.deepEqual(writes,[]);assert.equal(textarea.value,'Java');
    await act(()=>blur());assert.deepEqual(writes,['Java']);
    await act(()=>input('Java interview'));
    await act(()=>new Promise(resolve=>setTimeout(resolve,400)));assert.deepEqual(writes,['Java','Java interview']);
    await act(()=>input('Follow up'));
    await act(()=>window.dispatchEvent(new window.Event('pagehide')));assert.equal(writes.at(-1),'Follow up');
    await act(()=>input('Final note'));
    await act(()=>root.unmount());assert.equal(writes.at(-1),'Final note');assert.equal(writes.length,4);
  }finally{await act(()=>root.unmount());dom.window.close();}
});
test('remove compiled test modules',async()=>{await rm(directory,{recursive:true,force:true});});
