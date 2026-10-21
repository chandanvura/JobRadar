import {build} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';

await build();
await build({configFile:false,build:{ssr:'worker/index.ts',target:'es2022',outDir:'dist/server',emptyOutDir:true,rollupOptions:{output:{entryFileNames:'index.js'}}}});
await mkdir('dist/server',{recursive:true});
await writeFile('dist/server/wrangler.json',JSON.stringify({
 name:'jobradar',main:'index.js',compatibility_date:'2026-07-30',
 assets:{directory:'../client',binding:'ASSETS',run_worker_first:true},
 d1_databases:[{binding:'DB',database_name:'jobradar-db',database_id:process.env.CLOUDFLARE_D1_DATABASE_ID||'00000000-0000-4000-8000-000000000000'}],
 observability:{enabled:true},
},null,2));
