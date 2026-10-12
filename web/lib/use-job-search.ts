"use client";
import {useEffect,useMemo,useRef,useState} from 'react';
import {requirementsFor} from './job-requirements.ts';
import type {SearchableJob} from './job-search';
export function useJobSearch<T extends SearchableJob & {application_url:string}>(jobs:T[],query:string){
  const empty=useMemo(()=>new Map<T,number>(),[]);
  const searching=Boolean(query.trim()),worker=useRef<Worker|null>(null),request=useRef(0);
  const [response,setResponse]=useState<{jobs:T[];query:string;scores:Map<T,number>;error?:string}|null>(null);
  useEffect(()=>{
    if(!searching)return;
    let next:Worker;
    try{
      next=new Worker(new URL('./job-search-worker.ts',import.meta.url),{type:'module'});
      worker.current=next;
      next.postMessage({type:'index',jobs:jobs.map(job=>({
        title:job.title,company:job.company,skills:job.skills,role_category:job.role_category,
        normalized_location:job.normalized_location,ats_provider:job.ats_provider,application_url:job.application_url,
        description:job.description?.slice(0,12000),
        requirement_skills:job.description?(()=>{const r=requirementsFor(job);return [...r.requiredSkills,...r.preferredSkills,...r.mentionedSkills].map(item=>item.value).join(' ');})():undefined,
      }))});
    }catch{worker.current=null;}
    return ()=>{next?.terminate();if(worker.current===next)worker.current=null;};
  },[jobs,searching]);
  useEffect(()=>{
    if(!searching)return;
    const current=worker.current,id=++request.current;
    const fail=()=>setResponse({jobs,query,scores:new Map(),error:'Search could not start. Clear the search to browse jobs, or refresh and try again.'});
    if(!current){fail();return;}
    const receive=(event:MessageEvent<{id:number;results:[number,number][]}>)=>{
      if(event.data.id!==id)return;
      setResponse({jobs,query,scores:new Map(event.data.results.filter(([index])=>index>=0&&index<jobs.length).map(([index,score])=>[jobs[index],score]))});
    };
    current.addEventListener('message',receive);current.addEventListener('error',fail);
    current.postMessage({type:'query',id,query});
    return ()=>{current.removeEventListener('message',receive);current.removeEventListener('error',fail);};
  },[jobs,query,searching]);
  const ready=response?.jobs===jobs&&response.query===query;
  return {scores:ready?response.scores:empty,pending:searching&&!ready,error:ready?response.error:undefined};
}
