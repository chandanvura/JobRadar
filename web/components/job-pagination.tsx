"use client";
import {useEffect, useRef, useState, type ReactNode} from 'react';

export const JOB_PAGE_SIZE = 30;
export function JobPagination<T>({jobs,resetKey,renderJob}:{jobs:T[];resetKey:string;renderJob:(job:T)=>ReactNode}) {
  const [position,setPosition]=useState({key:resetKey,page:0});
  const heading=useRef<HTMLParagraphElement>(null), moved=useRef(false);
  const pages=Math.max(1,Math.ceil(jobs.length/JOB_PAGE_SIZE));
  // A new filter starts on page one; saves, notes and clock updates keep the page.
  const page=Math.min(position.key===resetKey?position.page:0,pages-1);
  const start=page*JOB_PAGE_SIZE,end=Math.min(start+JOB_PAGE_SIZE,jobs.length);
  useEffect(()=>{
    if(!moved.current)return;
    moved.current=false;
    heading.current?.scrollIntoView?.({block:'start',behavior:'auto'});
    heading.current?.focus({preventScroll:true});
  },[position]);
  const move=(next:number)=>{moved.current=true;setPosition({key:resetKey,page:Math.max(0,Math.min(next,pages-1))});};
  return <section className="space-y-4" aria-label="Job results">
    <p ref={heading} tabIndex={-1} aria-live="polite" className="scroll-mt-24 rounded-lg text-sm text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
      Showing {jobs.length?start+1:0}–{end} of {jobs.length} jobs · Page {page+1} of {pages}
    </p>
    {jobs.slice(start,end).map(renderJob)}
    {pages>1 && <nav aria-label="Job results pages" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
      <button type="button" disabled={page===0} onClick={()=>move(page-1)} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">Previous jobs</button>
      <label className="text-sm">Page <select aria-label="Job results page" value={page} onChange={event=>move(Number(event.target.value))} className="ml-2 rounded-lg border bg-card px-3 py-2">
        {Array.from({length:pages},(_,index)=><option key={index} value={index}>{index+1}</option>)}
      </select> of {pages}</label>
      <button type="button" disabled={page===pages-1} onClick={()=>move(page+1)} className="rounded-lg border px-4 py-2 font-semibold disabled:opacity-50">Show more jobs{end<jobs.length?` (${jobs.length-end} remaining)`:''}</button>
    </nav>}
  </section>;
}
