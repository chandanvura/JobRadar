import { analyzeExperience, experienceWithinPolicy } from './job-experience.ts';
import { extractRequirements } from './job-requirements.ts';
import { currentPosting, postingAge } from './job-time.ts';
import { canonicalShortlistCity, enforceShortlistLocation } from './location-policy.ts';
import { classifyRoleTitle } from './role-taxonomy.ts';

export interface RawAtsJob {
  external_job_id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  ats_provider: string;
  source?: string;
  job_url: string;
  application_url: string;
  career_page_url: string;
  posted_at?: string | null;
  posted_label?: string | null;
  posted_precision?: 'exact' | 'day' | 'unknown';
  reported_age_hours?: number | null;
  employment_type?: string | null;
  hiring_signal?: string | null;
}

export interface NormalizedIngestJob {
  external_job_id: string;
  company: string;
  title: string;
  normalized_title: string;
  role_category: string;
  location: string;
  normalized_location: string;
  city: string | null;
  employment_type: string;
  experience_min: number | null;
  experience_max: number | null;
  experience_label: string;
  description: string;
  skills: string[];
  ats_provider: string;
  source: string;
  job_url: string;
  application_url: string;
  career_page_url: string;
  posted_at: string | null;
  posted_label: string | null;
  posted_precision: 'exact' | 'day' | 'unknown';
  reported_age_hours: number | null;
  first_seen_at: string;
  last_seen_at: string;
  is_eligible: boolean;
  eligibility_reason: string;
  relevance_score: number;
  freshness_score: number;
  priority_score: number;
  hiring_signal: string | null;
}

const LEADERSHIP_TITLE = /\b(?:architect|director|head|lead|manager|principal|staff|vice president|vp)\b/i;
const EXPLICIT_ENTRY_TITLE =
  /\b(?:associate|junior|graduate|trainee|fresher|new grad(?:uate)?|entry[- ]level|campus hire|university grad(?:uate)?)\b|\b(?:sde|swe|software engineer|software developer|qa engineer|qa analyst|sdet|test engineer|support engineer|technical support engineer|devops engineer|cloud engineer|platform engineer|sre|site reliability engineer|infrastructure engineer|systems engineer|backend engineer|frontend engineer|full[ -]?stack engineer|data engineer|ml engineer|machine learning engineer|security engineer|network engineer|observability engineer|monitoring engineer|ansible engineer)(?:[\s-]+(?:i|1)\b|1\b)/i;
const INTERN_TITLE = /\b(?:intern|internship|co[ -]?op|apprentice|apprenticeship)\b/i;
const INTERN_CORPUS =
  /\b(?:this is an?|join us as an?|seeking an?|hiring an?)\s+(?:[a-z]+\s+){0,3}(?:intern|internship|apprentice|apprenticeship)\b/i;

export function stripHtml(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/<\/?(?:p|div|li|ul|ol|h[1-6]|br|tr|section)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 20000);
}

export function normalizePostedInput(
  rawPosted: string | number | null | undefined,
  nowMs = Date.now(),
): {
  posted_at: string | null;
  posted_label: string | null;
  posted_precision: 'exact' | 'day' | 'unknown';
  reported_age_hours: number | null;
} {
  if (rawPosted === null || rawPosted === undefined || rawPosted === '') {
    return { posted_at: null, posted_label: null, posted_precision: 'unknown', reported_age_hours: null };
  }
  if (typeof rawPosted === 'number' && Number.isFinite(rawPosted)) {
    const ms = rawPosted > 1e12 ? rawPosted : rawPosted * 1000;
    if (ms > 0 && ms <= nowMs + 86_400_000) {
      return {
        posted_at: new Date(Math.min(ms, nowMs)).toISOString(),
        posted_label: null,
        posted_precision: 'exact',
        reported_age_hours: null,
      };
    }
  }
  const text = String(rawPosted).trim();
  if (!text) {
    return { posted_at: null, posted_label: null, posted_precision: 'unknown', reported_age_hours: null };
  }

  // Relative Workday / ATS strings like "Posted Today", "Posted Yesterday", "Posted 3 Days Ago", "Posted 2 Hours Ago"
  if (/^(?:posted\s+)?today$/i.test(text)) {
    return {
      posted_at: new Date(nowMs).toISOString(),
      posted_label: 'Posted Today',
      posted_precision: 'day',
      reported_age_hours: null,
    };
  }
  if (/^(?:posted\s+)?yesterday$/i.test(text)) {
    return {
      posted_at: new Date(nowMs - 24 * 3_600_000).toISOString(),
      posted_label: 'Posted Yesterday',
      posted_precision: 'day',
      reported_age_hours: null,
    };
  }
  const hoursMatch = text.match(/(?:posted\s+)?(\d+)\s+hours?\s+ago/i);
  if (hoursMatch) {
    const hrs = Number(hoursMatch[1]);
    return {
      posted_at: new Date(nowMs - hrs * 3_600_000).toISOString(),
      posted_label: text,
      posted_precision: 'exact',
      reported_age_hours: hrs,
    };
  }
  const daysMatch = text.match(/(?:posted\s+)?(\d+)\+?\s+days?\s+ago/i);
  if (daysMatch) {
    const days = Number(daysMatch[1]);
    return {
      posted_at: new Date(nowMs - days * 86_400_000).toISOString(),
      posted_label: text,
      posted_precision: 'day',
      reported_age_hours: days * 24,
    };
  }

  const parsed = Date.parse(text);
  if (Number.isFinite(parsed)) {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(text);
    return {
      posted_at: new Date(Math.min(parsed, nowMs)).toISOString(),
      posted_label: null,
      posted_precision: dateOnly ? 'day' : 'exact',
      reported_age_hours: null,
    };
  }

  return { posted_at: null, posted_label: text, posted_precision: 'unknown', reported_age_hours: null };
}

export function normalizeRawJob(
  raw: RawAtsJob,
  companyPriority = 3,
  nowMs = Date.now(),
): NormalizedIngestJob {
  const nowIso = new Date(nowMs).toISOString();
  const title = raw.title.replace(/\s+/g, ' ').trim();
  const description = raw.description.includes('<') ? stripHtml(raw.description) : raw.description.trim().slice(0, 20000);
  const location = raw.location.replace(/\s+/g, ' ').trim() || 'Not specified';
  const city = canonicalShortlistCity({ location, normalized_location: location });
  const hybridSuffix = /\bhybrid\b/i.test(location) ? ' · Hybrid' : '';
  const normalized_location = city ? `${city}${hybridSuffix}` : location;

  const role_category = classifyRoleTitle(title);
  const employment_type =
    raw.employment_type ||
    (INTERN_TITLE.test(title) || INTERN_CORPUS.test(`${title}\n${description}`) ? 'Internship' : 'Full-time');

  const exp = analyzeExperience(description);
  let experience_min = exp.min;
  const experience_max = exp.max;
  let experience_label = exp.label;

  if (experience_min === null && EXPLICIT_ENTRY_TITLE.test(title) && experience_label === 'Unknown') {
    experience_min = 0;
    experience_label = '0–2 (title)';
  }

  const req = extractRequirements(description, location);
  const skills = Array.from(
    new Set([
      ...req.requiredSkills.map((s) => s.value),
      ...req.preferredSkills.map((s) => s.value),
      ...req.mentionedSkills.map((s) => s.value),
    ]),
  );

  const posting = raw.posted_at || raw.posted_label
    ? {
        posted_at: raw.posted_at ?? null,
        posted_label: raw.posted_label ?? null,
        posted_precision: raw.posted_precision ?? ('unknown' as const),
        reported_age_hours: raw.reported_age_hours ?? null,
      }
    : normalizePostedInput(null, nowMs);

  const ageHrs = postingAge(
    {
      ...posting,
      last_seen_at: nowIso,
    },
    nowMs,
  );
  const isRecent = currentPosting({ ...posting, last_seen_at: nowIso }, nowMs);
  const leadership = LEADERSHIP_TITLE.test(title.replace(/\bmember of technical staff\b/gi, 'technical contributor'));
  const expOk = !leadership && experienceWithinPolicy(experience_min, experience_max);

  let is_eligible = false;
  let eligibility_reason = '';

  if (!city) {
    eligibility_reason = 'Outside shortlist cities — Bengaluru and Hyderabad only';
  } else if (role_category === 'Other') {
    eligibility_reason = 'Outside target engineering role families';
  } else if (leadership) {
    eligibility_reason = 'Senior or leadership title exceeds 0–2 YOE policy';
  } else if (experience_min === null && exp.status === 'unknown') {
    eligibility_reason = 'Experience not stated — verify';
  } else if (!expOk) {
    eligibility_reason = 'Experience exceeds 0–2 YOE policy';
  } else if (!isRecent) {
    eligibility_reason = 'Posting date not verified within 24 hours';
  } else {
    is_eligible = true;
    eligibility_reason = '';
  }

  const freshness_score =
    ageHrs === null ? 45 : ageHrs <= 3 ? 98 : ageHrs <= 6 ? 94 : ageHrs <= 12 ? 90 : ageHrs <= 24 ? 84 : 52;
  const roleBoost = role_category !== 'Other' ? 30 : 5;
  const expBoost = expOk ? 28 : experience_min === null ? 14 : 4;
  const skillBoost = Math.min(20, skills.length * 3);
  const relevance_score = Math.min(99, Math.max(25, roleBoost + expBoost + skillBoost + companyPriority * 3));
  const priority_score = Math.round(relevance_score * 0.6 + freshness_score * 0.4);

  const normalized = enforceShortlistLocation({
    external_job_id: raw.external_job_id,
    company: raw.company,
    title,
    normalized_title: title.toLowerCase(),
    role_category,
    location,
    normalized_location,
    city,
    employment_type,
    experience_min,
    experience_max,
    experience_label,
    description,
    skills,
    ats_provider: raw.ats_provider,
    source: raw.source || raw.ats_provider,
    job_url: raw.job_url,
    application_url: raw.application_url,
    career_page_url: raw.career_page_url,
    posted_at: posting.posted_at,
    posted_label: posting.posted_label,
    posted_precision: posting.posted_precision,
    reported_age_hours: posting.reported_age_hours,
    first_seen_at: nowIso,
    last_seen_at: nowIso,
    is_eligible,
    eligibility_reason,
    relevance_score,
    freshness_score,
    priority_score,
    hiring_signal: raw.hiring_signal ?? null,
  });

  return {
    ...normalized,
    is_eligible: Boolean(normalized.is_eligible),
  };
}
