// Heuristic points, not interview probabilities; tune against labeled vacancies.
export const RANKING_CONFIG = {
  match: {title: .25, skills: .40, experience: .25, location: .10},
  opportunity: {match: .60, freshness: .25, source: .08, quality: .04, ease: .03},
  decayHours: 24,
  unknownDateDiscount: .5,
  feedbackLimit: 5,
  experienceExcessPenalty: 15,
  experienceMinimumPenalty: 5,
  sourceQuality: {greenhouse:100, lever:100, ashby:100, workday:100, smartrecruiters:100, jobvite:100} as Record<string, number>,
  defaultSourceQuality: 70,
  leadershipTitlePenalty: 15,
} as const;
