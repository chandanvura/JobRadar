import {extractRequirements} from './job-requirements.ts';
export type AnalysisJob={description?:string|null;location?:string;normalized_location?:string};
export function analyzeRequirements(jobs:AnalysisJob[]) {
  return jobs.map(job=>extractRequirements(job.description||'',job.location||job.normalized_location||''));
}
if(typeof self!=='undefined') {
  const scope=self as unknown as {onmessage:(event:MessageEvent<{jobs:AnalysisJob[]}>)=>void;postMessage:(value:unknown)=>void};
  scope.onmessage=event=>scope.postMessage(analyzeRequirements(event.data.jobs));
}
