import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
// Schema successfully deployed by commit 667703e. Never bypass a new migration.
export const appliedMigrationHashes = {
  '0000_nice_greymalkin.sql':'d81dd0f52dc9ac72dd3052a568be58f91c403d5668790a5ca3ffd2613aa4ec57',
  '0001_smiling_iron_fist.sql':'7d805ce045316f70e6bad0cb95163e41f1dd85ecac1189f3ea5180d168bbc12e',
  '0002_production_integrity.sql':'fc571c2161e31505aadefa1e8a48816e17e6a05d193711613f61759f1c1851da',
};
export function verifyQuotaDeployment(log, hashes) {
  if (!log.includes('code: 7500') || !log.includes("exceeded D1's free tier daily row")) throw Error('Migration failed for a reason other than daily quota');
  if (JSON.stringify(Object.keys(hashes).sort()) !== JSON.stringify(Object.keys(appliedMigrationHashes).sort()) || Object.entries(appliedMigrationHashes).some(([path,sha])=>hashes[path]!==sha)) throw Error('Schema differs from the last verified deployment; migrations cannot be skipped');
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const hashes={};
  for(const path of (await readdir('drizzle')).filter(path=>path.endsWith('.sql'))) hashes[path]=createHash('sha256').update(await readFile(`drizzle/${path}`)).digest('hex');
  verifyQuotaDeployment(await readFile(process.argv[2],'utf8'), hashes);
  console.log('Daily D1 quota exhausted; deploying static fallback with unchanged, previously applied schema. Migration verification deferred until reset.');
}
