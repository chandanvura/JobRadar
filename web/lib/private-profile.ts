let invitedWorkspace: string | null = null;
export const profileId = () => {
  if (typeof window === 'undefined') return 'default';
  const params = new URLSearchParams(window.location.search);
  if (params.get('newWorkspace') === '1') {
    invitedWorkspace ||= crypto.randomUUID();
    return invitedWorkspace;
  }
  const id = params.get('profile') || 'default';
  return /^[a-z0-9-]{1,64}$/.test(id) ? id : 'default';
};
export const privateKey = (key: string) => profileId() === 'default' ? key : `${key}:${profileId()}`;
export function readPrivate(key: string) { try { return localStorage.getItem(privateKey(key)); } catch { return null; } }
export function writePrivate(key: string, value: string) { try { localStorage.setItem(privateKey(key), value); } catch { window.dispatchEvent(new Event('jobradar-storage-error')); } }
export function removePrivate(key: string) { try { localStorage.removeItem(privateKey(key)); } catch { window.dispatchEvent(new Event('jobradar-storage-error')); } }
export const defaultSearch = {titles: [] as string[], skills: [] as string[], experienceMin: 0, experienceMax: 3, locations: ['Bengaluru','Hyderabad','Chennai','Pune']};
export function cleanSearch(value: unknown) {
  const v = value && typeof value === 'object' ? value as Record<string,unknown> : {};
  const terms = (x: unknown) => Array.isArray(x) ? [...new Set(x.filter((s): s is string => typeof s === 'string').map(s=>s.trim().slice(0,100)).filter(Boolean))].slice(0,30) : [];
  const min = typeof v.experienceMin === 'number' && Number.isFinite(v.experienceMin) ? Math.max(0,Math.min(40,v.experienceMin)) : 0;
  const max = typeof v.experienceMax === 'number' && Number.isFinite(v.experienceMax) ? Math.max(min,Math.min(40,v.experienceMax)) : Math.max(min,3);
  const locations = terms(v.locations).filter(s=>['Bengaluru','Hyderabad','Chennai','Pune'].includes(s));
  return {titles:terms(v.titles),skills:terms(v.skills),experienceMin:min,experienceMax:max,locations:locations.length?locations:defaultSearch.locations};
}
export function safeTracking(value: unknown): Record<string,unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const valid: Record<string,unknown> = {};
  for (const [key,item] of Object.entries(value).slice(0,5000)) {
    if (!item || typeof item !== 'object') continue;
    const t=item as Record<string,unknown>, j=t.job as Record<string,unknown>;
    if (!j || typeof j !== 'object') continue;
    if (!['title','company','normalized_location','skills','role_category','ats_provider','external_job_id','first_seen_at'].every(k=>typeof j[k]==='string')) continue;
    if (!['application_url','career_page_url'].every(k=>{try{return new URL(String(j[k])).protocol==='https:'}catch{return false}})) continue;
    if (key !== `${j.ats_provider}:${j.external_job_id}`) continue;
    const cleanJob={...j};
    for(const field of ['relevance_score','is_active','is_eligible','id'])cleanJob[field]=typeof j[field]==='number'&&Number.isFinite(j[field])?j[field]:0;
    for(const field of ['experience_min','experience_max','reported_age_hours'])cleanJob[field]=typeof j[field]==='number'&&Number.isFinite(j[field])?j[field]:null;
    for(const field of ['experience_label','posted_precision','eligibility_reason','last_seen_at'])cleanJob[field]=typeof j[field]==='string'?j[field]:'';
    for(const field of ['description','posted_at','posted_label','hiring_signal'])cleanJob[field]=typeof j[field]==='string'?j[field]:null;
    try{const skills=JSON.parse(String(j.skills));cleanJob.skills=JSON.stringify(Array.isArray(skills)?skills.filter(x=>typeof x==='string'):[])}catch{cleanJob.skills='[]'}
    valid[key]={...t,saved:t.saved===true,status:['New','Viewed','Applied','Interview','Offer','Rejected','Ignored'].includes(String(t.status))?t.status:'New',notes:typeof t.notes==='string'?t.notes.slice(0,10000):'',job:cleanJob};
  }
  return valid;
}
export function downloadText(name:string, content:string, type='text/plain') {
  const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
