"use client";
import {useEffect,useRef,useState} from 'react';
export function PrivateNotes({value,onSave}:{value:string;onSave:(value:string)=>void}) {
  const [draft,setDraft]=useState(value);
  const pending=useRef<string|null>(null),timer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const save=useRef(onSave);
  useEffect(()=>{save.current=onSave;},[onSave]);
  useEffect(()=>{if(pending.current===null)setDraft(value);},[value]);
  const flush=()=>{
    if(timer.current!==null){clearTimeout(timer.current);timer.current=null;}
    if(pending.current!==null){const next=pending.current;pending.current=null;save.current(next);}
  };
  useEffect(()=>{
    const flushPending=()=>{
      if(timer.current!==null)clearTimeout(timer.current);
      if(pending.current!==null){const next=pending.current;pending.current=null;save.current(next);}
    };
    window.addEventListener('pagehide',flushPending);
    return ()=>{window.removeEventListener('pagehide',flushPending);flushPending();};
  },[]);
  return <textarea value={draft} onChange={event=>{
    const next=event.target.value;setDraft(next);pending.current=next;
    if(timer.current!==null)clearTimeout(timer.current);
    timer.current=setTimeout(flush,350);
  }} onBlur={flush} rows={3} className="mt-2 w-full resize-y rounded-xl border bg-card p-3 text-sm font-normal" placeholder="Recruiter, referral contact, interview date, follow-up…" />;
}
