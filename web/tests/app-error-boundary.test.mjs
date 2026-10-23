import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import React,{act} from 'react';
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',virtualConsole:new VirtualConsole()});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
test('a render fault shows recovery, preserves private history and retries only on request',async()=>{
 const directory=await mkdtemp(fileURLToPath(new URL('../node_modules/.boundary-harness-',import.meta.url)));
 const output=await build({entryPoints:[fileURLToPath(new URL('../components/app-error-boundary.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
 await writeFile(`${directory}/boundary.mjs`,output.outputFiles[0].text);
 const {AppErrorBoundary}=await import(pathToFileURL(`${directory}/boundary.mjs`).href);
 let broken=true,attempts=0;
 function Page(){attempts++;if(broken)throw Error('private diagnostic must not be displayed');return React.createElement('h1',null,'Dashboard recovered');}
 const root=createRoot(document.getElementById('root'),{onCaughtError:()=>{}});
 dom.window.localStorage.setItem('jobradar-tracking-v2','saved history');
 try {
  await act(()=>root.render(React.createElement(AppErrorBoundary,null,React.createElement(Page))));
  assert.match(document.querySelector('[role=alert]').textContent,/could not display/);
  assert.doesNotMatch(document.body.textContent,/private diagnostic/);
  const failedAttempts=attempts;
  await act(async()=>{await new Promise(resolve=>setTimeout(resolve,10));});
  assert.equal(attempts,failedAttempts);
  assert.equal(dom.window.localStorage.getItem('jobradar-tracking-v2'),'saved history');
  broken=false;
  await act(()=>document.querySelector('button').dispatchEvent(new window.MouseEvent('click',{bubbles:true})));
  assert.match(document.body.textContent,/Dashboard recovered/);
  assert.equal(dom.window.localStorage.getItem('jobradar-tracking-v2'),'saved history');
 } finally {await act(()=>root.unmount());await rm(directory,{recursive:true,force:true});}
});
