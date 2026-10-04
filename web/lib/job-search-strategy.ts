export const ATS_SOURCES = [
  {name: 'Greenhouse', domain: 'boards.greenhouse.io OR site:job-boards.greenhouse.io'},
  {name: 'Lever', domain: 'jobs.lever.co'},
  {name: 'Ashby', domain: 'jobs.ashbyhq.com'},
  {name: 'Workday', domain: 'myworkdayjobs.com'},
  {name: 'iCIMS', domain: 'icims.com'},
  {name: 'Jobvite', domain: 'jobs.jobvite.com'},
  {name: 'SmartRecruiters', domain: 'jobs.smartrecruiters.com'},
] as const;
export const SEARCH_ROLES = ['Software Engineer','Java Developer','Backend Engineer','DevOps Engineer','Site Reliability Engineer','Cloud Engineer','Platform Engineer','Graduate Engineer','Software Engineer Intern'];
const literal = (value: string) => `"${value.replace(/["\\\r\n]/g, ' ').trim().slice(0, 100)}"`;
export function atsSearches(role: string, city: string, period: string) {
  if (!role.trim() || !['Bengaluru','Hyderabad'].includes(city) || !['day','week'].includes(period)) return [];
  const location = city === 'Bengaluru' ? '("Bengaluru" OR "Bangalore")' : '"Hyderabad"';
  return ATS_SOURCES.map(source => ({name:source.name, url:`https://www.google.com/search?${new URLSearchParams({q:`(site:${source.domain}) ${literal(role)} ${location}`,tbs:period==='day'?'qdr:d':'qdr:w'})}`}));
}
export function hiringSignalSearches(role: string, city: string) {
  const queries = [
    {name:'Team hiring posts', q:`site:linkedin.com/posts ${literal(role)} ${literal(city)} ("hiring" OR "join my team")`},
    {name:'Funding announcements', q:`${literal(city)} ("funding" OR "Series A" OR "Series B") "hiring"`},
    {name:'New engineering leaders', q:`site:linkedin.com/posts ${literal(city)} ("engineering manager" OR "VP engineering") "joined"`},
  ];
  return queries.map(item=>({name:item.name,url:`https://www.google.com/search?${new URLSearchParams({q:item.q,tbs:'qdr:w'})}`}));
}
export function hiringManagerDraft(company: string, role: string, applicationUrl?: string) {
  return `Subject: ${role} — [Your name] / [Relevant specialty]\n\nHi [Name], I submitted an application for ${role} at ${company}${applicationUrl ? ` (${applicationUrl})` : ''}. My project work demonstrates [one relevant skill and a truthful, verifiable result].\n\nHere is [portfolio link] with [one concrete observation about the role's challenge].\n\nWould you be open to a brief conversation if this fits your team's priorities?`;
}
