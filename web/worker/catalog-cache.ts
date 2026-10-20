type PublicCache = {match(request:Request):Promise<Response|undefined>;put(request:Request,response:Response):Promise<unknown>};
type Context = {waitUntil(promise:Promise<unknown>):void};
const TTL_MS=60000;

// Only public catalog reads. Health, tracking, ingestion and alerts stay live.
export async function cachedCatalog(request:Request,read:()=>Promise<Response>,cache:PublicCache,ctx:Context):Promise<Response>{
  const url=new URL(request.url);
  if(request.method!=='GET'||!['/api/dashboard','/api/jobs'].includes(url.pathname)||url.searchParams.get('source')==='backup'||request.headers.has('Authorization')||request.headers.has('Cookie'))return read();
  const keyUrl=new URL(`/__catalog_cache_v2${url.pathname}`,url.origin);
  if(url.pathname==='/api/jobs'){
    const after=Number(url.searchParams.get('after')||'0'),limit=Number(url.searchParams.get('limit')||'100');
    if(!Number.isSafeInteger(after)||after<0||!Number.isSafeInteger(limit)||limit<1||limit>500)return read();
    keyUrl.searchParams.set('after',String(after));keyUrl.searchParams.set('limit',String(limit));
  }
  const key=new Request(keyUrl);
  try{
    const hit=await cache.match(key),until=Number(hit?.headers.get('X-JobRadar-Cache-Until'));
    if(hit&&until>Date.now()&&until<=Date.now()+TTL_MS){
      const headers=new Headers(hit.headers);headers.set('Cache-Control','no-store');headers.set('X-JobRadar-Catalog-Cache','hit');headers.delete('X-JobRadar-Cache-Until');
      return new Response(hit.body,{status:hit.status,headers});
    }
    void hit?.body?.cancel().catch(()=>undefined);
  }catch{/* A cache fault must not block the live read or static recovery. */}
  const response=await read();
  if(response.status===200&&response.headers.get('Content-Type')?.includes('application/json')&&!response.headers.has('Set-Cookie')&&response.headers.get('Vary')!=='*'&&response.headers.get('X-JobRadar-Data-Mode')!=='backup'){
    const stored=response.clone(),headers=new Headers(stored.headers);
    headers.set('Cache-Control','public, max-age=60');headers.set('X-JobRadar-Cache-Until',String(Date.now()+TTL_MS));
    ctx.waitUntil(Promise.resolve().then(()=>cache.put(key,new Response(stored.body,{status:200,headers}))).catch(()=>undefined));
  }
  return response;
}
