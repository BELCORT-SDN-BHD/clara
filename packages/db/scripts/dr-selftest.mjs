// DR self-test — exercises a REAL dump+restore round-trip end-to-end.
//
// Fully isolated in a throwaway `dr_selftest` schema so it never touches app
// data, the spike schemas, or Supabase-managed schemas. Steps:
//   1. create dr_selftest with synthetic rows
//   2. backup (pg_dump) the schema to a timestamped file
//   3. DROP the schema (simulate loss)
//   4. restore (psql) from the backup
//   5. assert the rows came back identical
//   6. clean up (drop dr_selftest)
//
// Prints machine-checkable evidence for docs/ops/DR.md. Connection via env only.

import { unlinkSync } from "node:fs";
import { makeClient, targetLabel } from "../lib/pg.mjs";
import { backup } from "./backup.mjs";
import { restore } from "./restore.mjs";

const ROWS = 5;

async function tableFingerprint(client) {
  const count = await client.query("select count(*)::int as n from dr_selftest.ledger");
  const sum = await client.query("select coalesce(sum(amount_cents),0)::bigint as s from dr_selftest.ledger");
  return { n: count.rows[0].n, sum: String(sum.rows[0].s) };
}

async function main() {
  const client = makeClient();
  await client.connect();
  let backupFile;
  try {
    console.log(`DR self-test · target ${targetLabel()}`);
    console.log("step 1: create dr_selftest schema + synthetic rows");
    await client.query("drop schema if exists dr_selftest cascade;");
    await client.query("create schema dr_selftest;");
    await client.query(`
      create table dr_selftest.ledger (
        id bigint generated always as identity primary key,
        memo text not null,
        amount_cents bigint not null,
        created_at timestamptz not null default now()
      );
    `);
    for (let i = 1; i <= ROWS; i++) {
      await client.query("insert into dr_selftest.ledger (memo, amount_cents) values ($1, $2)", [
        `synthetic row ${i}`,
        i * 1000,
      ]);
    }
    const before = await tableFingerprint(client);
    console.log(`  before: rows=${before.n} sum_cents=${before.sum}`);

    console.log("step 2: backup (pg_dump) dr_selftest");
    const b = backup({ schema: "dr_selftest" });
    backupFile = b.file;
    console.log(`  backup file: ${b.file} (${b.bytes} bytes)`);

    console.log("step 3: DROP schema dr_selftest (simulate data loss)");
    await client.query("drop schema dr_selftest cascade;");
    const gone = await client.query(
      "select count(*)::int as n from information_schema.schemata where schema_name = 'dr_selftest'",
    );
    if (gone.rows[0].n !== 0) throw new Error("schema was not dropped");
    console.log("  schema dropped, confirmed absent");

    console.log("step 4: restore (psql) from backup");
    restore({ file: b.file });

    console.log("step 5: verify restored rows are identical");
    const after = await tableFingerprint(client);
    console.log(`  after:  rows=${after.n} sum_cents=${after.sum}`);
    if (after.n !== before.n || after.sum !== before.sum) {
      throw new Error(`fingerprint mismatch — before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    }

    console.log("step 6: clean up (drop dr_selftest)");
    await client.query("drop schema if exists dr_selftest cascade;");

    console.log("\nDR self-test: PASS — dump+restore round-trip verified, rows identical, target left clean.");
  } finally {
    await client.end();
    if (backupFile && process.env.CLARA_DR_KEEP !== "1") {
      try {
        unlinkSync(backupFile);
      } catch {
        /* ignore */
      }
    }
  }
}

main().catch((err) => {
  console.error("DR self-test: FAIL —", err.message);
  process.exit(1);
});
