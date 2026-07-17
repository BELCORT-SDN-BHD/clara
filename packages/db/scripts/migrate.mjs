// Minimal, dependency-light migration runner (node-postgres).
//
// - Applies migrations/NNNN_*.sql in numeric order, each in its own transaction.
// - Records version + sha256 in clara.schema_migrations (created here).
// - Idempotent: already-applied migrations are skipped; a checksum mismatch on
//   an applied migration ABORTS (migrations are immutable — add a new file).
//
// Connection comes from the environment only (see lib/pg.mjs). Never a DSN in argv.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { makeClient, targetLabel, isMain } from "../lib/pg.mjs";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

function sha256(text) {
  return createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");
}

export async function migrate({ log = console.log } = {}) {
  const client = makeClient();
  await client.connect();
  try {
    await client.query("create schema if not exists clara;");
    await client.query(`
      create table if not exists clara.schema_migrations (
        version    text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      );
    `);

    const files = readdirSync(MIGRATIONS_DIR)
      .filter((f) => /^\d+.*\.sql$/.test(f))
      .sort();

    const appliedRows = (await client.query("select version, checksum from clara.schema_migrations")).rows;
    const applied = new Map(appliedRows.map((r) => [r.version, r.checksum]));

    let count = 0;
    for (const file of files) {
      const version = file.replace(/\.sql$/, "");
      const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
      const checksum = sha256(sql);

      if (applied.has(version)) {
        if (applied.get(version) !== checksum) {
          throw new Error(
            `migration ${version} was modified after being applied (checksum drift). Migrations are immutable — add a new migration file instead.`,
          );
        }
        continue;
      }

      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into clara.schema_migrations (version, checksum) values ($1, $2)", [version, checksum]);
        await client.query("commit");
      } catch (err) {
        await client.query("rollback");
        throw new Error(`migration ${version} failed and was rolled back: ${err.message}`);
      }
      log(`  applied ${version}`);
      count++;
    }

    log(`migrate: ${count} new migration(s) applied · ${files.length} total · target ${targetLabel()}`);
    return { applied: count, total: files.length };
  } finally {
    await client.end();
  }
}

if (isMain(import.meta.url)) {
  migrate().catch((err) => {
    console.error("migrate: FAIL —", err.message);
    process.exit(1);
  });
}
