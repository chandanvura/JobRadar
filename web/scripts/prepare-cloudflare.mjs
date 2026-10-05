import { readFile, writeFile } from "node:fs/promises";

const databaseId=process.env.CLOUDFLARE_D1_DATABASE_ID;
if(!databaseId)throw new Error("CLOUDFLARE_D1_DATABASE_ID is required");

const migrationConfig={
  name:"jobradar",
  compatibility_date:"2026-05-15",
  d1_databases:[{
    binding:"DB",
    database_name:"jobradar-db",
    database_id:databaseId,
    migrations_dir:"drizzle",
  }],
};
await writeFile("wrangler.migrations.json",JSON.stringify(migrationConfig,null,2));

if(process.argv.includes("--patch-build")){
  const path="dist/server/wrangler.json";
  const output=JSON.parse(await readFile(path,"utf8"));
  // Wrangler 4.135+ removed service environments; the previous default now
  // matches the only supported behavior, so generated legacy_env must go.
  delete output.legacy_env;
  output.name="jobradar";
  const domain=(process.env.JOBRADAR_CUSTOM_DOMAIN || "").trim().toLowerCase();
  if(domain){
    if(domain.length>253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("JOBRADAR_CUSTOM_DOMAIN must be a hostname without scheme, path or wildcard");
    output.routes=[...(output.routes || []).filter(route => route.pattern!==domain),{pattern:domain,custom_domain:true}];
    output.workers_dev=true;
  }
  output.d1_databases=migrationConfig.d1_databases;
  output.observability={enabled:true};
  output.assets={...output.assets,binding:"ASSETS"};
  await writeFile(path,JSON.stringify(output,null,2));
}
