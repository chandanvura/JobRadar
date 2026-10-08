type Assets = { fetch(request: Request): Promise<Response> };

export async function publicRead(request: Request, assets: Assets, live: () => Promise<Response>, headers: Record<string, string>): Promise<Response> {
  const url = new URL(request.url);
  // Writes and health checks never receive a stale success response.
  if (request.method !== 'GET' || !['/api/dashboard', '/api/jobs'].includes(url.pathname)) return live();
  try {
    if (url.searchParams.get('source') !== 'backup') {
      const response = await live();
      if (response.status < 500) return response;
      // An explicit server failure has the same fallback behavior as a rejected read.
      await response.body?.cancel();
    }
  } catch {
    // The packaged catalog survives cold starts and does not query D1.
  }
  const response = await assets.fetch(new Request(new URL('/backup/catalog.json', url.origin)));
  if (!response.ok || !response.headers.get('Content-Type')?.includes('application/json')) throw Error('Backup unavailable');
  const resultHeaders = { ...headers, 'Cache-Control': 'no-store', 'Content-Type': 'application/json', 'X-JobRadar-Data-Mode': 'backup' };
  if (url.pathname === '/api/dashboard') {
    // Stream bytes: do not parse a multi-MB catalog under the free Worker CPU limit.
    return new Response(response.body, { headers: resultHeaders });
  }
  await response.body?.cancel();
  const after = Number(url.searchParams.get('after') || '0');
  if (!Number.isSafeInteger(after) || after < 0) return Response.json({ error: 'Invalid cursor' }, { status: 400, headers: resultHeaders });
  // The client switches the entire catalog together instead of mixing live/stale pages.
  return Response.json({ jobs: [], next_cursor: null, data_mode: 'backup' }, { headers: resultHeaders });
}
