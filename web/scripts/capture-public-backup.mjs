import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function captureCatalog(origin, fetcher = fetch) {
  const read = async path => {
    const r = await fetcher(new URL(path, origin), { signal: AbortSignal.timeout(20000), headers: { Accept: 'application/json' } });
    if (!r.ok) throw Error(`Catalog read returned ${r.status}`);
    return r.json();
  };
  try {
    const dashboard = await read('/api/dashboard');
    if (dashboard.data_mode === 'backup') throw Error('Live data unavailable');
    const jobs = new Map();
    let cursor = 0;
    for (let page = 0; ; page++) {
      if (page >= 40) throw Error('Catalog exceeds snapshot page limit');
      const batch = await read(`/api/jobs?after=${cursor}`);
      if (batch.data_mode === 'backup' || !Array.isArray(batch.jobs)) throw Error('Catalog changed to backup during capture');
      for (const job of batch.jobs) {
        if (!Number.isSafeInteger(job.id) || job.id <= cursor || jobs.has(job.id)) throw Error('Invalid catalog job ID');
        jobs.set(job.id, job);
      }
      if (batch.next_cursor === null) break;
      if (!Number.isSafeInteger(batch.next_cursor) || batch.next_cursor <= cursor) throw Error('Invalid pagination cursor');
      cursor = batch.next_cursor;
    }
    if (!Array.isArray(dashboard.companies) || !jobs.size) throw Error('Empty or invalid live catalog; preserve prior backup');
    return { ...dashboard, jobs: [...jobs.values()], version: 1, data_mode: 'backup', snapshot_at: new Date().toISOString() };
  } catch {
    // Never replace an existing backup with an empty catalog during an outage.
    const prior = await read('/backup/catalog.json');
    if (prior.version !== 1 || !Number.isFinite(Date.parse(prior.snapshot_at)) || !Array.isArray(prior.jobs) || !prior.jobs.length || !Array.isArray(prior.companies)) throw Error('No valid public backup available');
    return prior;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const origin = process.env.JOBRADAR_BACKUP_ORIGIN;
  if (!origin || new URL(origin).protocol !== 'https:') throw Error('Set JOBRADAR_BACKUP_ORIGIN to the production HTTPS origin');
  const catalog = await captureCatalog(origin);
  const contents = JSON.stringify(catalog);
  if (Buffer.byteLength(contents) > 24_000_000) throw Error('Snapshot exceeds static asset size budget');
  await mkdir('public/backup', { recursive: true });
  await writeFile('public/backup/catalog.json', contents);
  console.log(`Public backup: ${catalog.jobs.length} jobs, saved ${catalog.snapshot_at}`);
}
