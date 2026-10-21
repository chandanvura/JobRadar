import {cleanSearch,privateKey,writePrivate,safeTracking} from './private-profile.ts';
import {readTracking,mergeTracking,persistTracking,trackingStorageKey,recoveryStorageKey} from './tracking-store.ts';
import {cleanResume} from './resume-tailoring.ts';
export const privateBackupKeys=['jobradar-search-preferences-v1',trackingStorageKey,'jobradar-resume-v1','jobradar-resume-draft-v1','jobradar-tailor-request-v1','jobradar-onboarded-v1'] as const;
// Pretty-printed exports can exceed 5 MB even when their compact storage fits.
export const maxPrivateBackupBytes=25_000_000;
const object=(value:unknown):value is Record<string,unknown>=>Boolean(value&&typeof value==='object'&&!Array.isArray(value));
export function exportPrivateBackup(){
 const data:Record<string,unknown>={};
 for(const key of privateBackupKeys){
  // Unlike optional UI reads, an export must report inaccessible storage.
  try{
   const raw=localStorage.getItem(privateKey(key));
   if(key===trackingStorageKey){
    const tracking=readTracking();
    if(raw!==null){
     let original:unknown;
     try{original=JSON.parse(raw);}catch{if(!Object.keys(tracking).length)throw Error('Invalid history');}
     if(original!==undefined&&(!object(original)||Object.keys(safeTracking(original)).length!==Object.keys(original).length))throw Error('Invalid history');
    }
    data[key]=tracking;
   }else data[key]=JSON.parse(raw||'null');
  }catch{throw Error('Backup could not read a private record. Existing browser data was kept.');}
 }
 const text=JSON.stringify({version:1,data},null,2);
 if(new TextEncoder().encode(text).byteLength>maxPrivateBackupBytes)throw Error('Backup exceeds the supported 25 MB limit. Existing browser data was kept.');
 return text;
}
export function parsePrivateBackup(text:string){
 if(new TextEncoder().encode(text).byteLength>maxPrivateBackupBytes)throw Error('Backup is larger than 25 MB.');
 const backup=JSON.parse(text);
 if(!object(backup)||backup.version!==1||!object(backup.data))throw Error('Choose a JobRadar version 1 backup.');
 const data=backup.data,updates:Record<string,unknown>={};
 for(const key of privateBackupKeys){
  const value=data[key];if(value===undefined||value===null)continue;
  if(key==='jobradar-onboarded-v1'){
   if(typeof value!=='boolean')throw Error('Invalid onboarding backup record.');
   updates[key]=value;continue;
  }
  if(!object(value))throw Error('Invalid workspace backup record.');
  if(key===trackingStorageKey){
   const tracking=safeTracking(value);
   if(Object.keys(tracking).length!==Object.keys(value).length)throw Error('Invalid application history in backup. No records were restored.');
   updates[key]=tracking;
  }else if(key==='jobradar-search-preferences-v1')updates[key]=cleanSearch(value);
  else if(key==='jobradar-resume-v1')updates[key]=cleanResume(value);
  else if(key==='jobradar-resume-draft-v1'){
   if(!object(value.resume)||!['key','source','jd'].every(field=>typeof value[field]==='string'))throw Error('Invalid resume draft in backup.');
   updates[key]={key:value.key,source:value.source,jd:value.jd,resume:cleanResume(value.resume)};
  }else{
   if(!['key','title','company','jd'].every(field=>typeof value[field]==='string'))throw Error('Invalid tailoring request in backup.');
   updates[key]=Object.fromEntries(['key','title','company','jd'].map(field=>[field,value[field]]));
  }
 }
 return updates;
}
export function restorePrivateBackup(updates:Record<string,unknown>){
 // Merge history first. A failed save must not change preferences or resume.
 const tracking=updates[trackingStorageKey];
 if(tracking){
  try{localStorage.getItem(privateKey(trackingStorageKey));localStorage.getItem(privateKey(recoveryStorageKey));}
  catch{throw Error('Restore incomplete: existing application history could not be read. No records were restored.');}
 }
 if(tracking&&!persistTracking(mergeTracking(readTracking(),tracking as ReturnType<typeof readTracking>)))throw Error('Restore incomplete: application history could not be saved. Existing stored history was kept.');
 for(const key of privateBackupKeys){
  if(key===trackingStorageKey||updates[key]===undefined)continue;
  const label=key==='jobradar-search-preferences-v1'?'search preferences':key==='jobradar-resume-v1'?'master resume':key==='jobradar-resume-draft-v1'?'resume draft':key==='jobradar-tailor-request-v1'?'tailoring request':'onboarding choices';
  if(!writePrivate(key,JSON.stringify(updates[key])))throw Error(`Restore incomplete: ${label} could not be saved. Earlier successful updates were kept; export a backup and retry after freeing browser storage.`);
 }
}
