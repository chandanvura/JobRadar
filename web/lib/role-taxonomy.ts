import taxonomy from '../../config/roles.json' with {type:'json'};
export const ROLE_FAMILIES = taxonomy.roles.map(role => role.family);
export const SUGGESTED_JOB_TITLES = [...new Set([...taxonomy.roles.flatMap(role => role.titles), ...taxonomy.review_titles])];
const rules = taxonomy.roles.map(role => ({family:role.family, patterns:role.patterns.map(pattern=>new RegExp(pattern,'i'))}));
const NON_TECHNICAL =
  /\b(?:non technical|nontechnical|human resources|talent acquisition|marketing|tax|civil|mechanical|chemical|electrical maintenance|sales associate|financial advisor)\b/i;
const CROSS_DOMAIN_ENGINEERING_TITLES = new Set([
  'performance engineer',
  'database engineer',
  'qa engineer',
  'design engineer',
  'product engineer',
  'reliability engineer',
]);
const NON_SOFTWARE_DOMAIN =
  /\b(?:retail store|sales performance|merchandising|customer contacts|non[- ]technical operations|manufacturing quality|mechanical parts|factory inspection|physical product inspection)\b/i;
const SOFTWARE_DOMAIN =
  /\b(?:software|coding|programming|automation|automated tests?|selenium|playwright|sql|postgres(?:ql)?|mysql|oracle db|database infrastructure|performance testing|load testing|latency|backend|frontend|devops|kubernetes|python|java|sre|site reliability|ansible|prometheus|grafana|elk|elasticsearch|loki|observability|telemetry|(?:system|infrastructure|application|server|network|cloud)\s+monitoring|verilog|systemverilog|vhdl|asic|rtl|fpga|silicon|pcb|hardware|semiconductor|eda|cadence|synopsys)\b/i;

export function classifyRoleTitle(title: string, description = '') {
  const clean = title
    .normalize('NFKC')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .trim();
  if (NON_TECHNICAL.test(clean)) return 'Other';
  if (
    CROSS_DOMAIN_ENGINEERING_TITLES.has(clean) &&
    description &&
    NON_SOFTWARE_DOMAIN.test(description) &&
    !SOFTWARE_DOMAIN.test(description)
  ) {
    return 'Other';
  }
  return rules.find((rule) => rule.patterns.some((pattern) => pattern.test(clean)))?.family || 'Other';
}

// Broad discovery vocabulary does not prove JD experience or eligibility.
export const DEFAULT_SEARCH_TITLES = ['Software Engineer','Java Developer','DevOps Engineer','Site Reliability Engineer','Cloud Engineer','Platform Engineer','Infrastructure Engineer'];
export const ROLE_TITLE_GROUPS = taxonomy.roles.filter(role=>['Software Engineering','Java / Backend','DevOps','SRE','Cloud','Platform','Infrastructure / Operations'].includes(role.family)).map(role=>({family:role.family,titles:role.titles}));
