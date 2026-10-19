// Read-only production verification. Print counts and metadata, never job rows.
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const source=await readFile(new URL('../worker/index.ts',import.meta.url),'utf8');
const columns=/const PUBLIC_JOB_COLUMNS="([^"]+)";/.exec(source)?.[1];
const dashboard=source.split('async function dashboard(env:Env){')[1]?.split('async function ingest(')[0];
if(!columns||!dashboard)throw Error('Dashboard source was not found');
const queries=[...dashboard.matchAll(/env\.DB\.prepare\((`[^`]+`|"[^"\n]+")\)\.all\(\)/g)].map(match=>match[1].startsWith('`')?match[1].slice(1,-1).replace('${PUBLIC_JOB_COLUMNS}',columns):JSON.parse(match[1]));
if(queries.length!==4||queries.some(sql=>!sql.startsWith('SELECT ')||sql.includes('${')))throw Error('Dashboard query verification must cover all four reads');
for(const [index,sql] of queries.entries()){
  let raw;
  try{
    raw=execFileSync('npx',['wrangler','d1','execute','jobradar-db','--remote','--config','wrangler.migrations.json','--command',sql,'--json'],{encoding:'utf8',timeout:60000,maxBuffer:12_000_000});
  }catch(error){
    const output=String(error.stdout||'')+String(error.stderr||'');
    // The preceding migration step has already checked the deployed schema.
    // Preserve the existing static-recovery release during a daily quota outage.
    if(output.includes('7500')&&output.includes("exceeded D1's free tier daily row")){
      console.warn('Daily D1 quota prevents live read verification; static recovery remains available.');
      break;
    }
    throw error;
  }
  const result=JSON.parse(raw);
  if(!Array.isArray(result)||!result.length||result.some(batch=>!batch.success))throw Error(`Dashboard read ${index+1} failed`);
  console.log(JSON.stringify({read:index+1,rows:result.reduce((total,batch)=>total+(batch.results?.length||0),0),metadata:result.map(batch=>batch.meta)}));
}
