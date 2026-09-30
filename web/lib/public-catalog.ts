type Catalog = {jobs:{id:number}[];companies:unknown[];data_mode?:'backup'};
type Fetcher = typeof fetch;
export async function loadPublicCatalog<T extends Catalog>(onInitial:(catalog:T)=>void, fetcher:Fetcher=fetch, signal?:AbortSignal):Promise<T> {
  const read = async (path:string) => {
    signal?.throwIfAborted();
    const response=await fetcher(path,{cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(20000)]):AbortSignal.timeout(20000)});
    if(!response.ok) throw Error(`Catalog request returned ${response.status}`);
    return response.json();
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
  signal?.throwIfAborted();onInitial(payload);
  if(payload.data_mode==='backup' || payload.jobs.length<100)return payload;
  const collected=new Map(payload.jobs.map(job=>[job.id,job]));let cursor=0;
  try {
    for(let pages=0;pages<200;pages++){
      const batch=await read(`/api/jobs?after=${cursor}`);
      if(batch.data_mode==='backup')return backup();
      if(!Array.isArray(batch.jobs) || batch.jobs.some((job:{id:number})=>!job || !Number.isSafeInteger(job.id) || job.id<=cursor))throw Error('Invalid job page');
      for(const job of batch.jobs)collected.set(job.id,job);
      if(batch.next_cursor===null){signal?.throwIfAborted();return {...payload,jobs:[...collected.values()]};}
      if(!Number.isSafeInteger(batch.next_cursor) || batch.next_cursor<=cursor)throw Error('Invalid job pagination cursor');
      cursor=batch.next_cursor;
    }
    throw Error('Catalog pagination exceeded safety limit');
  }catch{return backup();}
}
