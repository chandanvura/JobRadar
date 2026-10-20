type Source = {last_checked_at:string|null;last_success_at:string|null;error_count:number;warning:string|null};
export function sourceFreshness(source:Source|undefined,backup:boolean,lastSeen:string,now=Date.now()) {
 const date=(value:string|null|undefined)=>{const time=Date.parse(value||'');return Number.isFinite(time)&&time<=now?new Date(time).toISOString():null;};
 const checked=date(source?.last_checked_at),seen=date(lastSeen),success=date(source?.last_success_at);
 const status=!source?'Source check unavailable':source.error_count?'Source failed — previous listings retained':source.warning?.startsWith('Limited coverage')?'Limited source coverage':!checked?'Source not checked':now-Date.parse(checked)>=5*3600000?'Source check is stale':'Source checked';
 return {label:`${backup?'Saved catalogue':'Live catalogue'} · ${status}`,checked,seen,success,warning:source?.warning||null};
}
