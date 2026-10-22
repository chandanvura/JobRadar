import {spawnSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';

// Retry only the observed D1 service error, never SQL, quota or auth failures.
export function transientD1Error(log) {
  return /internal error; reference = [\w-]+ \[code: 7500\]/i.test(log)
    && !/SQLITE_ERROR|SQLITE_CONSTRAINT|unauthorized|forbidden|exceeded|quota/i.test(log);
}

export async function applyMigrations({run, sleep=delay, save, report=()=>{}}) {
  for (let attempt=0; attempt<3; attempt++) {
    const result=run();
    const log=(result.stdout || '')+(result.stderr || '');
    save(log); report(log);
    if (!result.error && result.status===0) return 0;
    if (result.error || result.signal || !transientD1Error(log) || attempt===2) return 1;
    report(`D1 internal service error; retrying tracked migrations after ${[5000,15000][attempt]/1000}s.\n`);
    await sleep([5000,15000][attempt]);
  }
  return 1;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  // Wrangler records applied migrations and rolls back a failed migration.
  // https://developers.cloudflare.com/workers/wrangler/commands/d1/
  process.exitCode=await applyMigrations({
    run:()=>spawnSync('npx',['--no-install','wrangler','d1','migrations','apply','jobradar-db','--remote','--config','wrangler.migrations.json'],{encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024}),
    save:log=>writeFileSync('migration-result.log',log),
    report:log=>process.stdout.write(log),
  });
}
