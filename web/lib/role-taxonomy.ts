import taxonomy from '../../config/roles.json' with {type:'json'};
export const ROLE_FAMILIES = taxonomy.roles.map(role => role.family);
export const SUGGESTED_JOB_TITLES = [...new Set([...taxonomy.roles.flatMap(role => role.titles), ...taxonomy.review_titles])];
const rules = taxonomy.roles.map(role => ({family:role.family, patterns:role.patterns.map(pattern=>new RegExp(pattern,'i'))}));
export function classifyRoleTitle(title:string) {
  const clean=title.normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9+#.]+/g,' ').trim();
  if(/\b(?:non technical|nontechnical|human resources|talent acquisition|marketing|tax|civil|mechanical|chemical|electrical maintenance|sales associate|financial advisor)\b/i.test(clean)) return 'Other';
  return rules.find(rule=>rule.patterns.some(pattern=>pattern.test(clean)))?.family || 'Other';
}

// Broad discovery vocabulary does not prove JD experience or eligibility.
export const DEFAULT_SEARCH_TITLES = ['Software Engineer','Java Developer','DevOps Engineer','Site Reliability Engineer','Cloud Engineer','Platform Engineer','Infrastructure Engineer'];
export const ROLE_TITLE_GROUPS = taxonomy.roles.filter(role=>['Software Engineering','Java / Backend','DevOps','SRE','Cloud','Platform','Infrastructure / Operations'].includes(role.family)).map(role=>({family:role.family,titles:role.titles}));
