import taxonomy from '../../config/roles.json' with {type:'json'};
export const ROLE_FAMILIES = taxonomy.roles.map(role => role.family);
export const SUGGESTED_JOB_TITLES = [...new Set(taxonomy.roles.flatMap(role => role.titles))];
const rules = taxonomy.roles.map(role => ({family:role.family, patterns:role.patterns.map(pattern=>new RegExp(pattern,'i'))}));
export function classifyRoleTitle(title:string) {
  const clean=title.normalize('NFKC').toLowerCase().replace(/&/g,' and ').replace(/[^a-z0-9+#.]+/g,' ').trim();
  if(/\b(?:non technical|nontechnical|human resources|talent acquisition|marketing|tax|civil|mechanical|chemical|electrical maintenance|sales associate|financial advisor)\b/i.test(clean)) return 'Other';
  return rules.find(rule=>rule.patterns.some(pattern=>pattern.test(clean)))?.family || 'Other';
}
