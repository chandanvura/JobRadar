import {experienceWithinPolicy} from './job-experience.ts';
import {experienceUnverified} from './job-requirements.ts';
import {internshipRole} from './job-sections.ts';
import {shortlistLocation} from './location-policy.ts';

export type ViewJob = {
  title: string;
  is_active: number;
  is_eligible: number;
  experience_min: number | null;
  experience_max: number | null;
  experience_label?: string;
  employment_type?: string | null;
  eligibility_reason: string;
  city?: string | null;
  normalized_location?: string;
  role_category?: string;
  description?: string;
};

const senior = (title: string) =>
  /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect|experienced)\b|\b(?:engineer|scientist)\s+(?:III|IV|V)\b/i.test(
    title.replace(/member of technical staff/gi, 'technical contributor')
  );

const seniorOrLead = (title: string) =>
  /\b(?:senior|sr\.?|staff|principal|lead|manager|director|head|architect|experienced|vp|vice president)\b|\b(?:engineer|scientist)\s+(?:III|IV|V)\b/i.test(
    title.replace(/member of technical staff/gi, 'technical contributor')
  );

const hasSeniorRequirements = (desc?: string | null) =>
  desc
    ? /\b(?:senior|lead|staff|principal|architect)\s+(?:engineer|developer|sre|level|experience|qualifications?|yoe|role|position)\b/i.test(
        desc
      )
    : false;

const isEngineeringRole = (job: ViewJob) => {
  if (job.role_category && job.role_category !== 'Other') return true;
  return /\b(?:engineer|developer|sde|swe|mts|devops|cloud|sre|platform|infrastructure|backend|frontend|full[ -]?stack|data|qa|sdet|test|software|systems?|programmer|analyst|consultant|technologist|technical)\b/i.test(
    job.title
  );
};

const hasUnstatedOrEarlyCareer = (job: ViewJob) => {
  const unstated = job.experience_min === null && (job.experience_max === null || job.experience_max <= 3);
  const earlyLabel = /^(?:Entry-level title|0–2|Fresher|Unknown)/i.test(job.experience_label || '');
  const earlyReason = /^(?:Experience not stated|Entry-level title|Posting date not verified)/i.test(job.eligibility_reason || '');
  const jdEarlyCareer = Boolean(
    job.description &&
      /\b(?:202[4-9]|freshers?|fresh graduates?|new graduates?|entry.?level|early career|campus hire|university graduate|recent graduates?|intern(?:ship)? experience welcome)\b/i.test(
        job.description
      )
  );
  return unstated || earlyLabel || earlyReason || jdEarlyCareer;
};

export const verifiedView = (view: string) => ['Dashboard', 'Recommended', 'Ultra Fresh', 'Shortlist'].includes(view);
export const defaultFreshness = (view: string) => verifiedView(view) ? '24 hours' : 'Any date';

export function matchesCareerView(
  job: ViewJob,
  view: string,
  min: number,
  max: number,
  currentPosting: boolean,
  allowAnyDate: boolean = false
) {
  if (['Saved', 'Applications'].includes(view)) return true;
  if (!job.is_active) return false;
  if ((job.city || job.normalized_location) && !shortlistLocation(job)) return false;
  if (view === 'All Jobs') return !internshipRole(job);
  if (view === 'Internships') return internshipRole(job);
  if (internshipRole(job)) return false;

  const nonSeniorEng = isEngineeringRole(job) && !seniorOrLead(job.title) && !hasSeniorRequirements(job.description);
  const unstatedEarlyCareer = nonSeniorEng && hasUnstatedOrEarlyCareer(job);
  const invalidReason = /^(?:Outside shortlist|Outside target|Role outside|Leadership|Senior or leadership|Required minimum exceeds|Experience exceeds|Invalid scan|Experience differs|JD extract)/i.test(
    job.eligibility_reason || ''
  );

  const unlocked = (allowAnyDate || view === 'Shortlist') && unstatedEarlyCareer && !invalidReason;

  const eligible = Boolean(
    job.is_eligible ||
      unlocked ||
      (allowAnyDate &&
        (job.eligibility_reason === 'Posting date not verified within 24 hours' ||
          job.eligibility_reason === ''))
  );

  if (view === 'Needs Review') {
    return (
      senior(job.title) ||
      (!unlocked && experienceUnverified(job)) ||
      !eligible ||
      (!allowAnyDate && !currentPosting) ||
      (job.experience_min ?? 0) > max ||
      (job.experience_max !== null && job.experience_max < min)
    );
  }

  if (max <= 3 && view !== 'Needs Review' && senior(job.title)) return false;
  if (verifiedView(view) && typeof job.normalized_location === 'string' && !shortlistLocation(job)) return false;

  if (verifiedView(view)) {
    if (unlocked) {
      // Non-senior engineering role with unstated experience or early-career JD admitted
    } else {
      if (
        experienceUnverified(job) ||
        !eligible ||
        (!allowAnyDate && !currentPosting) ||
        !experienceWithinPolicy(job.experience_min, job.experience_max)
      ) {
        return false;
      }
    }
  }

  const known = !experienceUnverified(job) && (job.experience_min !== null || job.experience_max !== null);
  if (known && ((job.experience_min ?? 0) > max || (job.experience_max ?? Infinity) < min)) return false;
  if (!known && senior(job.title)) return false;
  if (view === 'Needs Review') return senior(job.title) || !eligible || (!allowAnyDate && !currentPosting);
  return true;
}
