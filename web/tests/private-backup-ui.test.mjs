import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {JSDOM,VirtualConsole} from 'jsdom';
import React,{act} from 'react';
const console=new VirtualConsole();
const dom=new JSDOM('<div id="root"></div>',{url:'https://example.test',virtualConsole:console});
globalThis.window=dom.window;globalThis.document=dom.window.document;
globalThis.Event=dom.window.Event;globalThis.location=dom.window.location;
globalThis.localStorage=dom.window.localStorage;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.confirm=()=>true;
const {createRoot}=await import('react-dom/client');
const directory=await mkdtemp(fileURLToPath(new URL('../node_modules/.backup-harness-',import.meta.url)));
const output=await build({entryPoints:[fileURLToPath(new URL('../components/profile-panel.tsx',import.meta.url))],bundle:true,write:false,platform:'node',format:'esm',packages:'external',jsx:'automatic',logLevel:'silent'});
await writeFile(`${directory}/panel.mjs`,output.outputFiles[0].text);
const {ProfilePanel}=await import(pathToFileURL(`${directory}/panel.mjs`).href);
test('a failed resume restore stays visible instead of reloading after silent failure',async()=>{
 const root=createRoot(document.getElementById('root'));
 const original=dom.window.Storage.prototype.setItem;
 try{
  await act(()=>root.render(React.createElement(ProfilePanel)));
  dom.window.Storage.prototype.setItem=function(key,value){if(key==='jobradar-resume-v1')throw Error('QuotaExceededError');return original.call(this,key,value);};
  const file={size:100,text:async()=>JSON.stringify({version:1,data:{'jobradar-resume-v1':{name:'Restored person'}}})};
  const input=document.querySelector('input[type=file]');
  Object.defineProperty(input,'files',{configurable:true,value:[file]});
  await act(async()=>{input.dispatchEvent(new window.Event('change',{bubbles:true}));await new Promise(resolve=>setTimeout(resolve,0));});
  assert.match(document.querySelector('[role=alert]').textContent,/Restore incomplete.*resume/i);
  assert.equal(localStorage.getItem('jobradar-resume-v1'),null);
 }finally{dom.window.Storage.prototype.setItem=original;await act(()=>root.unmount());await rm(directory,{recursive:true,force:true});}
});
