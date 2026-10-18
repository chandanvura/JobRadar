import {primeRequirements,requirementsFor,hasRequirements,type extractRequirements} from './job-requirements.ts';
import type {AnalysisJob} from './catalog-analysis-worker.ts';
type Requirements=ReturnType<typeof extractRequirements>;
// The fallback also yields between small slices, including on older browsers.
export async function prepareCooperatively(jobs:AnalysisJob[],signal?:AbortSignal) {
  let slice=performance.now();
  for(const job of jobs) {
    signal?.throwIfAborted();requirementsFor(job);
    if(performance.now()-slice>=6) {
      await new Promise<void>(resolve=>setTimeout(resolve,0));slice=performance.now();
    }
  }
}
export async function prepareCatalog(jobs:AnalysisJob[],signal?:AbortSignal):Promise<void> {
  signal?.throwIfAborted();if(!jobs.length||jobs.every(hasRequirements))return;
  try {
    await new Promise<void>((resolve,reject)=>{
      const worker=new Worker(new URL('./catalog-analysis-worker.ts',import.meta.url),{type:'module'});
      let settled=false,offset=0;
      const finish=(error?:unknown)=>{if(settled)return;settled=true;clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();if(error)reject(error);else resolve();};
      const abort=()=>finish(signal?.reason||new DOMException('Aborted','AbortError'));
      const timer=setTimeout(()=>finish(Error('Catalog analysis timed out')),30000);
      signal?.addEventListener('abort',abort,{once:true});
      worker.onerror=()=>finish(Error('Catalog analysis unavailable'));
      const send=()=>{
        try{worker.postMessage({jobs:jobs.slice(offset,offset+128).map(job=>({description:job.description,location:job.location,normalized_location:job.normalized_location}))});}
        catch(error){finish(error);}
      };
      worker.onmessage=event=>{
        if(settled||signal?.aborted)return;
        const results=event.data as Requirements[];
        if(!Array.isArray(results)||results.length!==Math.min(128,jobs.length-offset)){finish(Error('Invalid catalog analysis'));return;}
        for(let index=0;index<results.length;index++)primeRequirements(jobs[offset+index],results[index]);
        offset+=results.length;
        if(offset<jobs.length)send();else finish();
      };
      // Bound structured-clone memory and main-thread callback work, rather
      // than duplicating the entire catalog in a single worker message.
      send();
    });
  } catch {
    signal?.throwIfAborted();await prepareCooperatively(jobs,signal);
  }
}
