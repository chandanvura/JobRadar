import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';

export function productionDatabase(databases) {
  if (!Array.isArray(databases)) throw Error('D1 inventory is not an array; deployment stopped.');
  const matches=databases.filter(row=>row?.name==='jobradar-db');
  if (matches.length!==1 || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(matches[0].uuid)) {
    throw Error('Expected exactly one existing jobradar-db with a valid UUID. Verify the account and restore/bootstrap explicitly; deployment will not create a replacement database.');
  }
  return matches[0].uuid;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  console.log(productionDatabase(JSON.parse(readFileSync(0,'utf8'))));
}
