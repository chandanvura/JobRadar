import {boardAttribution} from './source-ownership.ts';
/** Presentation-only grouping: retain every source record and private tracking ID. */
export type FeedJob = {company: string; title: string; normalized_location: string; ats_provider: string; external_job_id: string; application_url: string; description?: string; is_eligible: number; is_active: number; role_category: string};
export function canonicalApplyUrl(value: string) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^utm_/i.test(key) || /^(ref|referrer|source|trackingId|gh_src|lever-source|lever-origin)$/i.test(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.toString();
  } catch {return null;}
}
const normalized = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const tokens = (text: string) => new Set(normalized(text).split(' ').filter(Boolean));
function similarity(a: string, b: string) {
  const left = tokens(a), right = tokens(b);
  const intersection = [...left].filter(x => right.has(x)).length;
  return intersection / Math.max(1, left.size + right.size - intersection);
}
export function groupDuplicateJobs<T extends FeedJob>(jobs: T[]) {
  const groups: {job: T; sources: T[]}[] = [];
  const ids = new Map<string, number>(), urls = new Map<string, number>(), fingerprints = new Map<string, number[]>();
  for (const job of jobs) {
    const company = normalized(boardAttribution(job).employer);
    // External IDs belong to an employer/provider namespace, never globally.
    const id = job.external_job_id ? `${company}\u001f${job.ats_provider}\u001f${job.external_job_id}` : null;
    const canonical = canonicalApplyUrl(job.application_url);
    const requisition = canonical && ((new URL(canonical).hostname === 'jobs.lever.co' && new URL(canonical).pathname.split('/').filter(Boolean).length >= 2) || /\/(?:job|jobs|position|positions)\/.+/i.test(new URL(canonical).pathname) || /(?:gh_jid|jobId|requisitionId)=/i.test(canonical));
    const url = canonical && requisition ? canonical : null;
    const fingerprint = `${company}\u001f${normalized(job.title)}\u001f${normalized(job.normalized_location.replace(/bangalore/gi, 'Bengaluru'))}`;
    let index = (id ? ids.get(id) : undefined) ?? (url ? urls.get(url) : undefined);
    if (index === undefined && job.description && job.description.length >= 200) {
      // Distinct IDs on one ATS may represent distinct requisitions or reposts.
      // Only cross-source, same-employer/title/location, near-identical JDs merge.
      index = (fingerprints.get(fingerprint) || []).slice(-25).find(i => {
        const candidate = groups[i].job;
        return candidate.ats_provider !== job.ats_provider && (candidate.description?.length || 0) >= 200 && similarity(candidate.description!, job.description!) >= .95;
      });
    }
    if (index === undefined) {
      index = groups.length; groups.push({job, sources: []});
      fingerprints.set(fingerprint, [...(fingerprints.get(fingerprint) || []), index]);
    }
    const group = groups[index]; group.sources.push(job);
    if (job.is_active > group.job.is_active || (job.is_active === group.job.is_active && (job.is_eligible > group.job.is_eligible || (job.is_eligible === group.job.is_eligible && job.company === boardAttribution(job).employer && group.job.company !== boardAttribution(group.job).employer)))) group.job = job;
    if (id) ids.set(id, index);
    if (url) urls.set(url, index);
  }
  return groups;
}
/** Interleave close scores only; no job can jump over a >5 point gap. */
export function diversifyFeed<T extends {company: string; role_category: string}>(sorted: T[], score: (job: T) => number, window = 5) {
  const result: T[] = [];
  let start = 0;
  while (start < sorted.length) {
    let end = start + 1;
    while (end < sorted.length && end - start < 25 && score(sorted[start]) - score(sorted[end]) <= window) end++;
    const pool = sorted.slice(start, end), companies = new Map<string, number>(), families = new Map<string, number>();
    while (pool.length) {
      let best = 0, penalty = Infinity;
      for (let i = 0; i < pool.length; i++) {
        const job = pool[i], value = (companies.get(job.company.toLowerCase()) || 0) * 2 + (families.get(job.role_category) || 0);
        if (value < penalty) {best = i; penalty = value; if (!value) break;}
      }
      const [job] = pool.splice(best, 1); result.push(job);
      companies.set(job.company.toLowerCase(), (companies.get(job.company.toLowerCase()) || 0) + 1);
      families.set(job.role_category, (families.get(job.role_category) || 0) + 1);
    }
    start = end;
  }
  return result;
}
