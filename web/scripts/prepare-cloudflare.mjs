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
  output.name="jobradar";
  output.d1_databases=migrationConfig.d1_databases;
  output.observability={enabled:true};
  await writeFile(path,JSON.stringify(output,null,2));
}
