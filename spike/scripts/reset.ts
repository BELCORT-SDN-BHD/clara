import "dotenv/config";
import { describeTarget, makeClient, requireDatabaseUrl } from "./util.js";

// DESTRUCTIVE (spike DB only): truncates domain tables + engine state +
// queue jobs for a clean test run. Keeps migration bookkeeping tables so
// setup does not need to be re-run. Requires --yes.
if (!process.argv.includes("--yes")) {
  console.error(`This TRUNCATES all spike/engine/queue tables on ${describeTarget(process.env.DATABASE_URL ?? "")}.`);
  console.error("Re-run with:  pnpm reset --yes");
  process.exit(1);
}

const client = makeClient();
try {
  await client.connect();
  const tables = await client.query<{ table_schema: string; table_name: string }>(
    `select table_schema, table_name
     from information_schema.tables
     where table_schema in ('spike', 'workflow', 'graphile_worker')
       and table_type = 'BASE TABLE'
       and table_name not ilike '%migration%'
       and table_name not ilike '%crontab%'
     order by table_schema, table_name`,
  );
  if (tables.rowCount === 0) {
    console.log("Nothing to reset (schemas not found - run pnpm setup first).");
    process.exit(0);
  }
  const qualified = tables.rows.map((t) => `"${t.table_schema}"."${t.table_name}"`);
  await client.query(`truncate table ${qualified.join(", ")} restart identity cascade`);
  console.log(`Truncated ${qualified.length} tables on ${describeTarget(requireDatabaseUrl())}:`);
  for (const q of qualified) console.log(`  - ${q}`);
} finally {
  await client.end();
}
