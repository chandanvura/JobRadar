type Catalog = {jobs:{id:number}[];companies:unknown[];data_mode?:'backup'};
type Fetcher = typeof fetch;
export async function loadPublicCatalog<T extends Catalog>(onInitial:(catalog:T)=>void|Promise<void>, fetcher:Fetcher=fetch, signal?:AbortSignal, limits={requestMs:10000,liveMs:45000}):Promise<T> {
  const liveSignal=AbortSignal.timeout(limits.liveMs);
  const read = async (path:string) => {
    signal?.throwIfAborted();
    const bounded=AbortSignal.any([...(signal?[signal]:[]),...(path.startsWith('/api/')?[liveSignal]:[]),AbortSignal.timeout(limits.requestMs)]);
    bounded.throwIfAborted();
    return new Promise<unknown>((resolve,reject)=>{
      const abort=()=>reject(bounded.reason);bounded.addEventListener('abort',abort,{once:true});
      void (async()=>{const response=await fetcher(path,{cache:'no-store',signal:bounded});if(!response.ok)throw Error(`Catalog request returned ${response.status}`);return response.json();})().then(resolve,reject).finally(()=>bounded.removeEventListener('abort',abort));
    });
  };
  const validate = (value:unknown):T => {
    const data=value as T;
    if(!data || !Array.isArray(data.jobs) || !Array.isArray(data.companies) || data.jobs.some(job=>!job || !Number.isSafeInteger(job.id) || job.id<=0))throw Error('Invalid job catalog');
    return data;
  };
  const backup = async () => {
    signal?.throwIfAborted();
    const saved=validate(await read('/backup/catalog.json'));
    if(saved.data_mode!=='backup')throw Error('Invalid backup catalog');
    return saved;
  };
  let payload:T;
  try {payload=validate(await read('/api/dashboard'));} catch {payload=await backup();}
  signal?.throwIfAborted();await onInitial(payload);
  if(payload.data_mode==='backup' || payload.jobs.length<100)return payload;
  const collected=new Map(payload.jobs.map(job=>[job.id,job]));let cursor=0;
  try {
    for(let pages=0;pages<200;pages++){
      const batch=await read(`/api/jobs?limit=500&after=${cursor}`);
      if(!batch || typeof batch!=="object")throw Error("Invalid job page");
      const page=batch as {jobs:{id:number}[];next_cursor:number|null;data_mode?:string};
      if(page.data_mode==='backup')return backup();
      if(!Array.isArray(page.jobs) || page.jobs.some((job:{id:number})=>!job || !Number.isSafeInteger(job.id) || job.id<=cursor))throw Error('Invalid job page');
      for(const job of page.jobs)collected.set(job.id,job);
      if(page.next_cursor===null){signal?.throwIfAborted();return {...payload,jobs:[...collected.values()]};}
      if(!Number.isSafeInteger(page.next_cursor) || page.next_cursor<=cursor)throw Error('Invalid job pagination cursor');
      cursor=page.next_cursor;
    }
    throw Error('Catalog pagination exceeded safety limit');
  }catch{return backup();}
}
