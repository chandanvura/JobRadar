import {privateKey,readPrivate,safeTracking,trackingIdentity} from './private-profile.ts';
export const trackingStorageKey='jobradar-tracking-v2',recoveryStorageKey='jobradar-tracking-recovery-v1';
type Entry={updated_at?:string;status?:string;history?:{at:string;status:string}[];job:unknown;[key:string]:unknown};
type Records=Record<string,Entry>;
const parse=(raw:string|null):Records|null=>{if(raw===null)return null;try{const value=JSON.parse(raw);if(!value||typeof value!=='object'||Array.isArray(value))return null;const rows=safeTracking(value) as Records;return Object.keys(value).length&&!Object.keys(rows).length?null:rows;}catch{return null;}};
export function readTracking():Records {
 return parse(readPrivate(trackingStorageKey))??parse(readPrivate(recoveryStorageKey))??{};
}
export function mergeTracking(...sets:Records[]):Records {
 const result:Records={};
 for(const rows of sets)for(const [key,row] of Object.entries(rows)){
  const prior=result[key], newer=!prior||(Date.parse(row.updated_at||'')||0)>=(Date.parse(prior.updated_at||'')||0);
  const history=[...new Map([...(prior?.history||[]),...(row.history||[])].map(event=>[`${event.at}:${event.status}`,event])).values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at));
  result[key]={...(newer?row:prior),...(history.length?{history}:{})};
 }
 return result;
}
export function persistTracking(rows:Records):boolean {
 try{
  const serialized=JSON.stringify(rows),prior=readPrivate(trackingStorageKey);
  let recoveryFailed=false;
  if(prior&&parse(prior)!==null){
   try{localStorage.setItem(privateKey(recoveryStorageKey),prior);}
   catch{recoveryFailed=true;}
  }
  // A full recovery copy must not prevent a primary replacement that still fits.
  // Keep the existing recovery record intact; never delete history to free space.
  localStorage.setItem(privateKey(trackingStorageKey),serialized);
  if(recoveryFailed)window.dispatchEvent(new Event('jobradar-tracking-recovery-error'));
  return true;
 }catch{window.dispatchEvent(new Event('jobradar-storage-error'));return false;}
}
export function saveTrackingPatch(current:Records,job:{company:unknown;ats_provider:unknown;external_job_id:unknown},patch:Record<string,unknown>,now:string):Records {
 const merged=mergeTracking(current,readTracking()),key=trackingIdentity(job);
 const prior=merged[key]||{saved:false,status:'New',updated_at:now,job};
 const stamp=new Date(Math.max(Date.parse(now), (Date.parse(prior.updated_at||'')||0)+1)).toISOString();
 const history=[...(prior.history||[])];
 if(typeof patch.status==='string'&&patch.status!==prior.status){
  if(!history.length)history.push({at:prior.updated_at||now,status:prior.status||'New'});
  history.push({at:stamp,status:patch.status});
 }
 const next={...merged,[key]:{...prior,...patch,job,history,updated_at:stamp}};
 persistTracking(next);return next;
}
export function clearTrackingStorage(){
 try{localStorage.removeItem(privateKey(trackingStorageKey));localStorage.removeItem(privateKey(recoveryStorageKey));return true;}
 catch{window.dispatchEvent(new Event('jobradar-storage-error'));return false;}
}
