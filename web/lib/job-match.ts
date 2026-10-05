import { RANKING_CONFIG as config } from "./ranking-config.ts";
export type MatchJob = {
  title: string; role_category: string; skills: string; experience_min: number | null;
  experience_max: number | null; is_eligible: number; relevance_score: number;
  posted_at: string | null; posted_label: string | null; reported_age_hours: number | null;
  last_seen_at?: string; first_seen_at?: string; posted_precision?: string;
  normalized_location?: string; ats_provider?: string; application_url?: string; is_active?: number;
};
export type MatchPreferences = {titles: string[]; skills: string[]; experienceMin: number; experienceMax: number; locations?: string[]};
export type LearningRecord = {saved?: boolean; status?: string; job: MatchJob};
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const stop = new Set(['engineer', 'engineering', 'developer', 'software', 'the', 'and', 'for']);
const words = (value: string) => [...new Set(value.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(/\s+/).filter(x => x.length > 1 && !stop.has(x)))];
const aliases: Record<string, string> = {'k8s':'kubernetes', 'amazon web services':'aws', 'springboot':'spring boot', 'postgres':'postgresql', 'gha':'github actions', 'golang':'go', 'nodejs':'node.js', 'node js':'node.js', 'ci cd':'ci/cd'};
export const normalizeSkill = (value: string) => aliases[value.toLowerCase().trim()] || value.toLowerCase().trim();
const parsedSkills = (value: string) => {try {const v: unknown = JSON.parse(value); return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(normalizeSkill))] : [];} catch {return [];}};
const overlap = (a: string[], b: string[]) => a.filter(x => b.includes(x));
export function roleFamily(title: string) {
  if (/\b(dev\s*ops|devsecops|build.{0,5}release)\b/i.test(title)) return 'DevOps';
  if (/\b(sre|site reliability|production engineer)\b/i.test(title)) return 'SRE';
  if (/\bcloud\b/i.test(title)) return 'Cloud';
  if (/\bplatform\b/i.test(title)) return 'Platform';
  if (/\b(java|backend|back.end|spring)\b/i.test(title)) return 'Java / Backend';
  if (/\b(software|sde|swe|full.stack|frontend)\b/i.test(title)) return 'Software Engineering';
  return 'Other';
}
export const experienceCompatible = (job: MatchJob, p: MatchPreferences) => job.experience_min === null && job.experience_max === null ? null : (job.experience_min ?? 0) <= p.experienceMax && (job.experience_max ?? Infinity) >= p.experienceMin;
// Relevance is independent of source, age and alert eligibility. Preferences are
// a desired experience range, not a claim about the candidate's actual experience.
export function personalMatch(job: MatchJob, p: MatchPreferences) {
  const titleWords = words(job.title), preferredWords = words(p.titles.join(' '));
  const titleHits = overlap(preferredWords, titleWords);
  const exactTitle = p.titles.some(x => job.title.toLowerCase() === x.toLowerCase().trim());
  const family = p.titles.some(x => roleFamily(x) !== 'Other' && roleFamily(x) === job.role_category);
  const titleFit = !p.titles.length ? 75 : exactTitle ? 100 : Math.max(family ? 85 : 0, preferredWords.length ? titleHits.length / preferredWords.length * 100 : 0);
  const jobSkills = parsedSkills(job.skills), userSkills = new Set(p.skills.map(normalizeSkill));
  const matchedSkills = jobSkills.filter(x => userSkills.has(x));
  const missingSkills = jobSkills.filter(x => !userSkills.has(x));
  // The feed contains extracted skills, not a verified must-have/preferred split.
  const skillFit = !p.skills.length || !jobSkills.length ? 50 : matchedSkills.length / jobSkills.length * 100;
  const exp = experienceCompatible(job, p);
  const gap = Math.max(0, (job.experience_min ?? 0) - p.experienceMax, p.experienceMin - (job.experience_max ?? Infinity));
  const experienceFit = exp === null ? 40 : exp ? 100 : Math.max(0, 40 - gap * 20);
  const locationFit = !p.locations?.length ? 75 : !job.normalized_location ? 40 : p.locations.some(city => job.normalized_location!.toLowerCase().includes(city.toLowerCase())) ? 100 : 0;
  const components = {title: titleFit, skills: skillFit, experience: experienceFit, location: locationFit};
  const score = Math.round(clamp(titleFit * config.match.title + skillFit * config.match.skills + experienceFit * config.match.experience + locationFit * config.match.location));
  const reasons = [exactTitle ? 'preferred title' : family ? 'preferred role family' : titleHits.length ? 'title terms overlap' : 'title to review',
    jobSkills.length && p.skills.length ? `${matchedSkills.length}/${jobSkills.length} extracted skills match` : 'skills not specified',
    exp === null ? 'experience to verify' : exp ? 'experience overlaps' : 'experience outside preference',
    ...(/\bsenior\b/i.test(job.title) && job.experience_min !== null && job.experience_min <= 3 ? ['seniority and experience conflict — verify'] : []),
    ...(p.locations?.length ? [locationFit === 100 ? 'preferred location' : 'location to verify'] : [])];
  return {score, reasons, components, matchedSkills, missingSkills, titleMatch: exactTitle || family || titleHits.length > 0, skillMatch: matchedSkills.length > 0, experienceMatch: exp};
}
export function freshnessScore(job: MatchJob, now = Date.now(), decayHours = config.decayHours) {
  const age = (value?: string | null) => {const n = value ? (now - Date.parse(value)) / 3600000 : NaN; return Number.isFinite(n) && n >= 0 ? n : null;};
  let hours = age(job.posted_at), basis = 'posted';
  if (job.reported_age_hours !== null) {
    const elapsed = age(job.last_seen_at);
    hours = elapsed !== null && Number.isFinite(job.reported_age_hours) && job.reported_age_hours >= 0 ? job.reported_age_hours + elapsed : null;
  }
  if (hours === null) {hours = age(job.first_seen_at); basis = 'discovered';}
  // Unknown posting dates receive a conservative discovery priority. Never
  // turn first-seen time or an imprecise employer day label into posting proof.
  return {score: hours === null ? 0 : 100 * Math.exp(-hours / Math.max(1, decayHours)) * (basis === 'discovered' ? config.unknownDateDiscount : 1), basis};
}
export function opportunityPriority(job: MatchJob, p: MatchPreferences, now = Date.now(), match = personalMatch(job, p)) {
  const freshness = freshnessScore(job, now);
  const sourceQuality = config.sourceQuality[job.ats_provider || ''] ?? config.defaultSourceQuality;
  const jobQuality = (job.title ? 25 : 0) + (job.normalized_location ? 25 : 0) + (job.application_url?.startsWith('https://') ? 25 : 0) + (job.experience_min !== null ? 25 : 0);
  const applicationEase = job.application_url?.startsWith('https://') ? 100 : 0;
  const score = job.is_active === 0 ? 0 : Math.round(clamp(match.score * config.opportunity.match + freshness.score * config.opportunity.freshness + sourceQuality * config.opportunity.source + jobQuality * config.opportunity.quality + applicationEase * config.opportunity.ease - (/\b(staff|principal|lead|manager|director|architect)\b/i.test(job.title) ? config.leadershipTitlePenalty : 0)));
  return {score, freshness, sourceQuality, jobQuality};
}
// Bounded category feedback cannot overwhelm relevance; rejected applications
// are deliberately excluded because they do not explain why rejection happened.
export function feedbackBoost(job: MatchJob, history: LearningRecord[]) {
  let boost = 0;
  for (const record of history) {
    const positive = record.saved || ['Applied','Interview','Offer'].includes(record.status || '');
    if (!positive && record.status !== 'Ignored') continue;
    if (record.job.role_category === job.role_category) boost += positive ? 1 : -1;
  }
  return Math.max(-config.feedbackLimit, Math.min(config.feedbackLimit, boost));
}
export function feedbackByFamily(history: LearningRecord[]) {
  const scores = new Map<string, number>();
  for (const record of history) {
    const positive = record.saved || ['Applied','Interview','Offer'].includes(record.status || '');
    if (positive || record.status === 'Ignored') scores.set(record.job.role_category, (scores.get(record.job.role_category) || 0) + (positive ? 1 : -1));
  }
  return new Map([...scores].map(([family, score]) => [family, Math.max(-config.feedbackLimit, Math.min(config.feedbackLimit, score))]));
}
