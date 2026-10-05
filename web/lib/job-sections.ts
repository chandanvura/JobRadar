export type SectionJob = {title: string; employment_type?: string | null; experience_min: number | null; experience_label?: string};
export const internshipRole = (job: SectionJob) => job.employment_type === 'Internship' || /\b(?:intern|internship|co[ -]?op|apprentice|apprenticeship)\b/i.test(job.title);
// A desired 0–3-year range does not make every matching job a fresher vacancy.
export function fresherRole(job: SectionJob) {
  if (internshipRole(job) || /\b(?:senior|staff|principal|lead|manager|director|architect)\b/i.test(job.title)) return false;
  if (job.experience_min !== null) return job.experience_min === 0;
  return /\b(?:freshers?|graduate|trainee|entry[ -]?level)\b/i.test(job.title);
}

export const technicalInternshipRole = (job: SectionJob) => internshipRole(job) && !/\b(?:non[ _-]?technical|talent acquisition|human resources|tax|marketing)\b/i.test(job.title);
