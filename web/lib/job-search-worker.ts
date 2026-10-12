import {createJobSearchIndex,type SearchableJob} from './job-search.ts';
export type SearchMessage={type:'index';jobs:SearchableJob[]}|{type:'query';id:number;query:string};
export function createSearchProcessor(){
  let jobs:SearchableJob[]=[],index:ReturnType<typeof createJobSearchIndex<SearchableJob>>|null=null;
  return (message:SearchMessage)=>{
    if(message.type==='index'){jobs=message.jobs;index=createJobSearchIndex(jobs);return null;}
    if(!index)throw Error('Search catalog is not initialized');
    const ids=new Map(jobs.map((job,id)=>[job,id]));
    return {id:message.id,results:[...index.search(message.query)].map(([job,score])=>[ids.get(job)!,score])};
  };
}
if(typeof self!=='undefined'){
  const scope=self as unknown as {onmessage:(event:MessageEvent<SearchMessage>)=>void;postMessage:(result:unknown)=>void};
  const process=createSearchProcessor();
  scope.onmessage=event=>{const result=process(event.data);if(result)scope.postMessage(result);};
}
