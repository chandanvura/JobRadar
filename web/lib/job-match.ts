import {canonicalApplyUrl} from './job-feed.ts';
import {learningLabel} from './recommendation-feedback.ts';
import {requirementsFor, experienceUnverified} from './job-requirements.ts';
import { classifyRoleTitle } from "./role-taxonomy.ts";
import { RANKING_CONFIG as config } from "./ranking-config.ts";
export type MatchJob = {
  description?:string; experience_label?:string; title: string; role_category: string; skills: string; experience_min: number | null;
  experience_max: number | null; is_eligible: number; relevance_score: number;
  posted_at: string | null; posted_label: string | null; reported_age_hours: number | null;
  last_seen_at?: string; first_seen_at?: string; posted_precision?: string;
  normalized_location?: string; ats_provider?: string; application_url?: string; is_active?: number;
};
export type MatchPreferences = {titles: string[]; skills: string[]; experienceMin: number; experienceMax: number; locations?: string[]};
export type LearningRecord = {saved?: boolean; status?: string; feedback?:string;updated_at?:string;preference_at?:string;job: MatchJob};
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const stop = new Set(['engineer', 'engineering', 'developer', 'software', 'the', 'and', 'for']);
const words = (value: string) => [...new Set(value.toLowerCase().replace(/[^a-z0-9+#]+/g, ' ').split(/\s+/).filter(x => x.length > 1 && !stop.has(x)))];
const aliases: Record<string, string> = {'k8s':'kubernetes', 'amazon web services':'aws', 'springboot':'spring boot', 'postgres':'postgresql', 'gha':'github actions', 'golang':'go', 'nodejs':'node.js', 'node js':'node.js', 'ci cd':'ci/cd'};
export const normalizeSkill = (value: string) => aliases[value.toLowerCase().trim()] || value.toLowerCase().trim();
const parsedSkills = (value: string) => {try {const v: unknown = JSON.parse(value); return Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string').map(normalizeSkill))] : [];} catch {return [];}};
const overlap = (a: string[], b: string[]) => a.filter(x => b.includes(x));
export function roleFamily(title: string) { return classifyRoleTitle(title); }

export const experienceCompatible = (job: MatchJob, p: MatchPreferences) => experienceUnverified(job) || (job.experience_min === null && job.experience_max === null) ? null : (job.experience_min ?? 0) <= p.experienceMax && (job.experience_max ?? Infinity) >= p.experienceMin;
// Relevance is independent of source, age and alert eligibility. Preferences are
// a desired experience range, not a claim about the candidate's actual experience.
export function createPersonalMatcher(p:MatchPreferences) {
 const preferredWords=words(p.titles.join(' ')),titles=new Set(p.titles.map(x=>x.toLowerCase().trim()));
 const families=new Set(p.titles.map(roleFamily).filter(x=>x!=='Other'));
 const userSkills=new Set(p.skills.map(normalizeSkill));
 return (job:MatchJob)=>matchPrepared(job,p,preferredWords,titles,families,userSkills);
}
export function personalMatch(job:MatchJob,p:MatchPreferences) {return createPersonalMatcher(p)(job);}
function matchPrepared(job: MatchJob, p: MatchPreferences,preferredWords:string[],titles:Set<string>,families:Set<string>,userSkills:Set<string>) {
  const titleWords = words(job.title);
  const titleHits = overlap(preferredWords, titleWords);
  const exactTitle = titles.has(job.title.toLowerCase());
  const family = families.has(job.role_category);
  const titleFit = !p.titles.length ? 75 : exactTitle ? 100 : Math.max(family ? 85 : 0, preferredWords.length ? titleHits.length / preferredWords.length * 100 : 0);
  const requirements=requirementsFor(job);
  const structured=[...requirements.requiredSkills,...requirements.preferredSkills,...requirements.mentionedSkills];
  const jobSkills = job.description ? [...new Set(structured.map(item=>normalizeSkill(item.value)))] : parsedSkills(job.skills);
  const matchedSkills = jobSkills.filter(x => userSkills.has(x));
  const requiredSkills = requirements.requiredSkills.map(item=>normalizeSkill(item.value));
  const preferredSkills = requirements.preferredSkills.map(item=>normalizeSkill(item.value));
  const missingRequiredSkills = requiredSkills.filter(x=>!userSkills.has(x));
  const matchedPreferredSkills = preferredSkills.filter(x=>userSkills.has(x));
  const missingSkills = jobSkills.filter(x => !userSkills.has(x) && !preferredSkills.includes(x));
  // Optional requirements can add a small bonus, never lower essential-skill fit.
  // Unclassified mentions remain a review signal, never an eligibility gate.
  const optionalBonus = preferredSkills.length ? matchedPreferredSkills.length / preferredSkills.length * 10 : 0;
  const coreSkills = requiredSkills.length ? requiredSkills : jobSkills.filter(x=>!preferredSkills.includes(x));
  const skillFit = !p.skills.length || !jobSkills.length ? 50 : coreSkills.length
    ? Math.min(100, coreSkills.filter(x=>userSkills.has(x)).length / coreSkills.length * 100 + optionalBonus)
    : 50 + matchedPreferredSkills.length / Math.max(1,preferredSkills.length) * 50;
  const exp = experienceCompatible(job, p);
  const gap = Math.max(0, (job.experience_min ?? 0) - p.experienceMax, p.experienceMin - (job.experience_max ?? Infinity));
  const experienceFit = exp === null ? 40 : exp ? Math.max(40, 100 - Math.max(0, (job.experience_max ?? p.experienceMax) - p.experienceMax) * config.experienceExcessPenalty - Math.max(0, (job.experience_min ?? 0) - p.experienceMin) * config.experienceMinimumPenalty) : Math.max(0, 40 - gap * 20);
  const locationFit = !p.locations?.length ? 75 : !job.normalized_location ? 40 : p.locations.some(city => job.normalized_location!.toLowerCase().includes(city.toLowerCase())) ? 100 : 0;
  const components = {title: titleFit, skills: skillFit, experience: experienceFit, location: locationFit};
  const score = Math.round(clamp(titleFit * config.match.title + skillFit * config.match.skills + experienceFit * config.match.experience + locationFit * config.match.location));
  const reasons = [/\bsenior\b/i.test(job.title) && job.experience_min !== null && job.experience_min <= 3 ? 'seniority and experience conflict — verify' : !p.titles.length ? 'role preference not specified' : exactTitle ? 'preferred title' : family ? 'preferred role family' : titleHits.length ? 'title terms overlap' : 'title to review',
    !p.skills.length ? 'profile skills not specified' : jobSkills.length ? requiredSkills.length ? `${requiredSkills.length-missingRequiredSkills.length}/${requiredSkills.length} required skills match` : `${matchedSkills.length}/${jobSkills.length} extracted skills match` : 'job skills not specified',
    exp === null ? 'experience to verify' : exp ? (job.experience_max !== null && job.experience_max > p.experienceMax ? 'experience partly overlaps — verify' : 'experience overlaps') : 'experience outside preference',
    ...(p.locations?.length ? [locationFit === 100 ? 'preferred location' : 'location to verify'] : [])];
  return {score, reasons, components, matchedSkills, missingSkills, missingRequiredSkills, matchedPreferredSkills, titleMatch: exactTitle || family || titleHits.length > 0, skillMatch: matchedSkills.length > 0, experienceMatch: exp};
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
  const score = job.is_active === 0 ? 0 : Math.round(clamp(match.score * config.opportunity.match + freshness.score * config.opportunity.freshness + sourceQuality * config.opportunity.source + jobQuality * config.opportunity.quality + applicationEase * config.opportunity.ease - (/\b(staff|principal|lead|manager|director|architect)\b/i.test(job.title.replace(/member of technical staff/gi,"technical contributor")) ? config.leadershipTitlePenalty : 0)));
  return {score, freshness, sourceQuality, jobQuality};
}
// Bounded category feedback cannot overwhelm relevance; rejected applications
// are deliberately excluded because they do not explain why rejection happened.
export function feedbackByFamily(history:LearningRecord[]) {
 const scores=new Map<string,number>(),seen=new Set<string>();
 for(const record of [...history].reverse().sort((a,b)=>(Date.parse(b.preference_at||b.updated_at||'')||0)-(Date.parse(a.preference_at||a.updated_at||'')||0))) {
  const label=learningLabel(record);if(label===null||record.feedback==='skills')continue;
  const key=(record.job.application_url&&canonicalApplyUrl(record.job.application_url))||[record.job.title,record.job.role_category,record.job.skills].join('\u001f');
  if(seen.has(key))continue;seen.add(key);
  scores.set(record.job.role_category,(scores.get(record.job.role_category)||0)+(label?1:-1));
 }
 return new Map([...scores].map(([family,score])=>[family,Math.max(-config.feedbackLimit,Math.min(config.feedbackLimit,score))]));
}

export function recommendedPreferenceMatch(job:MatchJob,preferences:MatchPreferences,match=personalMatch(job,preferences)) {
 return match.score>=30&&(!preferences.titles.length||match.titleMatch);
}
