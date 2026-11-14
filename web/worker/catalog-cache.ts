export type PublicCache = {
  match(request:Request):Promise<Response|undefined>;
  put(request:Request,response:Response):Promise<unknown>;
  delete?(request:Request):Promise<boolean>;
};
export type Context = {waitUntil(promise:Promise<unknown>):void};
export const CATALOG_CACHE_PREFIX = '/__catalog_cache_v4';
const TTL_MS=300000;

export async function purgeCatalogCache(origin:string,cache:PublicCache,extraPaths:string[]=[]):Promise<void>{
  if(typeof cache?.delete!=='function')return;
  const paths=[
    `${CATALOG_CACHE_PREFIX}/api/dashboard`,
    `${CATALOG_CACHE_PREFIX}/api/jobs?after=0&limit=100`,
    `${CATALOG_CACHE_PREFIX}/api/jobs?after=0&limit=500`,
    ...extraPaths
  ];
  try{
    await Promise.allSettled(paths.map(path=>cache.delete!(new Request(new URL(path,origin)))));
  }catch{/* Cache purge failure must not fail the ingestion write */}
}

// Only public catalog reads. Health, tracking, ingestion and alerts stay live.
export async function cachedCatalog(request:Request,read:()=>Promise<Response>,cache:PublicCache,ctx:Context):Promise<Response>{
  const url=new URL(request.url);
  const cacheControl=request.headers.get('Cache-Control')?.toLowerCase()||'';
  const pragma=request.headers.get('Pragma')?.toLowerCase()||'';
  const bypassCache=cacheControl.includes('no-cache')||cacheControl.includes('no-store')||cacheControl.includes('max-age=0')||pragma.includes('no-cache');
  if(request.method!=='GET'||!['/api/dashboard','/api/jobs'].includes(url.pathname)||url.searchParams.get('source')==='backup'||request.headers.has('Authorization')||request.headers.has('Cookie')||bypassCache)return read();
  const keyUrl=new URL(`${CATALOG_CACHE_PREFIX}${url.pathname}`,url.origin);
  if(url.pathname==='/api/jobs'){
    const through=url.searchParams.get('through');
    if(through!==null&&(!Number.isSafeInteger(Number(through))||Number(through)<=Number(url.searchParams.get('after')||'0')))return read();
    const after=Number(url.searchParams.get('after')||'0'),limit=Number(url.searchParams.get('limit')||'100');
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>500)return read();
    if(through!==null)keyUrl.searchParams.set('through',String(Number(through)));
    keyUrl.searchParams.set('after',String(after));keyUrl.searchParams.set('limit',String(limit));
  }
  const key=new Request(keyUrl);
  try{
    const hit=await cache.match(key),until=Number(hit?.headers.get('X-JobRadar-Cache-Until'));
    if(hit&&until>Date.now()&&until<=Date.now()+TTL_MS){
      const headers=new Headers(hit.headers);headers.set('Cache-Control','no-store');headers.set('X-JobRadar-Catalog-Cache','hit');headers.set('X-JobRadar-D1-Rows-Read','0');headers.set('Server-Timing','edge-cache;desc=hit');headers.delete('X-JobRadar-Cache-Until');
      return new Response(hit.body,{status:hit.status,headers});
    }
    void hit?.body?.cancel().catch(()=>undefined);
  }catch{/* A cache fault must not block the live read or static recovery. */}
  const response=await read();
  if(response.status===200&&response.headers.get('Content-Type')?.includes('application/json')&&!response.headers.has('Set-Cookie')&&response.headers.get('Vary')!=='*'&&response.headers.get('X-JobRadar-Data-Mode')!=='backup'){
    const stored=response.clone(),headers=new Headers(stored.headers);
    headers.set('Cache-Control','public, max-age=300');headers.set('X-JobRadar-Cache-Until',String(Date.now()+TTL_MS));
    ctx.waitUntil(Promise.resolve().then(()=>cache.put(key,new Response(stored.body,{status:200,headers}))).catch(()=>undefined));
  }
  return response;
}
