"use client";
import { useState } from 'react';
import { groupedAtsSearches, hiringSignalSearches, SEARCH_ROLES } from '@/lib/job-search-strategy';
export function JobSearchStrategy({titles}: {titles:string[]}) {
  const roles = [...new Set([...titles,...SEARCH_ROLES])];
  const [role,setRole] = useState(roles[0] || 'Software Engineer');
  const [city,setCity] = useState('Bengaluru');
  const [period,setPeriod] = useState('day');
  return <section className="space-y-4 rounded-3xl border bg-card p-5 md:p-6">
    <h3 className="text-xl font-black">Your upstream job-search loop</h3>
    <p className="text-sm text-muted-foreground">Search related role titles together on employer portals, verify the posting, then apply.</p>
    <div className="grid gap-3 md:grid-cols-3">
      <label className="text-sm font-bold">Role<select value={role} onChange={e=>setRole(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-card px-3 font-normal">{roles.map(r=><option key={r}>{r}</option>)}</select></label>
      <label className="text-sm font-bold">City<select value={city} onChange={e=>setCity(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-card px-3 font-normal"><option>Bengaluru</option><option>Hyderabad</option></select></label>
      <label className="text-sm font-bold">Google search window<select value={period} onChange={e=>setPeriod(e.target.value)} className="mt-2 h-11 w-full rounded-xl border bg-card px-3 font-normal"><option value="day">Past 24 hours</option><option value="week">Past week</option></select></label>
    </div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{groupedAtsSearches(role,city,period).map(link=><a key={link.name} href={link.url} target="_blank" rel="noreferrer" className="rounded-xl border p-3 text-sm font-bold text-success hover:border-primary">Search {link.name} ↗</a>)}</div>
    <p className="text-xs text-muted-foreground">Google’s date filter is not a verified employer posting date. Check the official date, experience requirements and application URL. Search results are not imported or labeled as fresh jobs.</p>
    <h4 className="font-bold">Research hiring signals</h4>
    <div className="flex flex-wrap gap-3">{hiringSignalSearches(role,city).map(link=><a key={link.name} href={link.url} target="_blank" rel="noreferrer" className="text-sm font-bold text-success underline">{link.name} ↗</a>)}</div>
    <p className="text-xs text-muted-foreground">Funding and leadership changes are leads to investigate, not confirmed vacancies. Verify openings and current team membership.</p>
    <h4 className="font-bold">Daily 100-minute plan</h4>
    <ol className="list-decimal space-y-2 pl-5 text-sm leading-6">
      <li><b>60 minutes:</b> choose 3–5 suitable roles, verify dates and requirements, tailor from your master resume, and apply through the official link.</li>
      <li><b>30 minutes:</b> find 2–3 relevant public professional contacts. After applying, aim to send a personalized three-sentence note within two hours. Use only true project evidence; review before sending.</li>
      <li><b>10 minutes:</b> update Applications, record outreach in private notes, check replies, and choose tomorrow’s priorities.</li>
    </ol>
    <p className="text-sm text-muted-foreground">Use Resume Studio for truthful tailoring, Applications for tracking, and Outreach for manager/referral drafts. Configure supported alerts on job boards yourself; JobRadar cannot enable them on your behalf.</p>
  </section>;
}
