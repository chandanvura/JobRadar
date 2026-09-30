export function quotaExceeded(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /exceeded D1's free tier daily row (?:read|write) limit/i.test(message);
}
export function apiFailure(error: unknown, path: string, headers: Record<string,string>, now = Date.now()) {
  const quota = quotaExceeded(error);
  const reset = new Date(now);reset.setUTCHours(24,0,0,0);
  const retry = Math.max(1, Math.ceil((reset.getTime()-now)/1000));
  const body = path === '/api/health'
    ? {ok:false,quota_exhausted:quota,latest_run:null,...(quota?{retry_at:reset.toISOString()}:{}),error:quota?'D1 daily quota exhausted':'Health temporarily unavailable'}
    : {error:quota?'D1 daily quota exhausted':'JobRadar API request failed',...(quota?{quota_exhausted:true,retry_at:reset.toISOString()}:{})};
  return Response.json(body,{status:quota || path==='/api/health'?503:500,headers:{...headers,'Cache-Control':'no-store',...(quota?{'Retry-After':String(retry)}:{})}});
}
