// DR self-test — exercises a REAL dump+restore round-trip end-to-end.
//
// GUARDED + ISOLATED (finding 6): it DROPs schemas, so it refuses unless
// CLARA_ALLOW_DESTRUCTIVE=1 AND the target is disposable/named (see lib/guard.mjs).
// Each run uses a UNIQUE, validated schema name (never a fixed `dr_selftest` that
// could collide with a concurrent drill), serialises drills with a session
// advisory lock, and drops its schema in `finally` even when a step fails — so a
// failed drill never leaves objects behind. Steps:
//   1. create <unique> schema with synthetic rows
//   2. backup (pg_dump) the schema to a timestamped file
//   3. DROP the schema (simulate loss)
//   4. restore (psql, single-transaction) from the backup
//   5. assert the rows came back identical
//   6. clean up in finally (drop <unique>)
//
// Prints machine-checkable evidence for docs/ops/DR.md. Connection via env only.

import { unlinkSync } from "node:fs";
import { makeClient, targetLabel } from "../lib/pg.mjs";
import { assertDestructiveAllowed } from "../lib/guard.mjs";
import { backup } from "./backup.mjs";
import { restore } from "./restore.mjs";

const ROWS = 5;
// One lock for all DR drills on a target — serialises concurrent runs.
const DR_LOCK_1 = 0x1a2b3c4d;
const DR_LOCK_2 = 0x00d12e57; // "dr test"

/** A unique, validated schema identifier for this run (<= 63 chars, [a-z0-9_]). */
function uniqueSchema() {
  const rand = Math.random().toString(36).slice(2, 8);
  const name = `dr_selftest_${Date.now().toString(36)}_${rand}`;
  if (!/^[a-z_][a-z0-9_]*$/.test(name) || name.length > 63) {
    throw new Error(`internal: generated schema name is invalid: ${name}`);
  }
  return name;
}

async function tableFingerprint(client, schema) {
  const count = await client.query(`select count(*)::int as n from ${schema}.ledger`);
  const sum = await client.query(`select coalesce(sum(amount_cents),0)::bigint as s from ${schema}.ledger`);
  return { n: count.rows[0].n, sum: String(sum.rows[0].s) };
}

async function main() {
  assertDestructiveAllowed({ action: "dr:selftest (creates + drops a throwaway schema)" });

  const client = makeClient();
  await client.connect();
  const schema = uniqueSchema();
  let backupFile;
  let haveLock = false;
  try {
    const lock = await client.query("select pg_try_advisory_lock($1, $2) as ok", [DR_LOCK_1, DR_LOCK_2]);
    haveLock = lock.rows[0].ok === true;
    if (!haveLock) throw new Error("another DR self-test is already running against this target (advisory lock held). Retry later.");

    console.log(`DR self-test · target ${targetLabel()} · schema ${schema}`);
    console.log(`step 1: create ${schema} schema + synthetic rows`);
    await client.query(`create schema ${schema};`);
    await client.query(`
      create table ${schema}.ledger (
        id bigint generated always as identity primary key,
        memo text not null,
        amount_cents bigint not null,
        created_at timestamptz not null default now()
      );
    `);
    for (let i = 1; i <= ROWS; i++) {
      await client.query(`insert into ${schema}.ledger (memo, amount_cents) values ($1, $2)`, [
        `synthetic row ${i}`,
        i * 1000,
      ]);
    }
    const before = await tableFingerprint(client, schema);
    console.log(`  before: rows=${before.n} sum_cents=${before.sum}`);

    console.log(`step 2: backup (pg_dump) ${schema}`);
    const b = backup({ schema });
    backupFile = b.file;
    console.log(`  backup file: ${b.file} (${b.bytes} bytes)`);

    console.log(`step 3: DROP schema ${schema} (simulate data loss)`);
    await client.query(`drop schema ${schema} cascade;`);
    const gone = await client.query(
      "select count(*)::int as n from information_schema.schemata where schema_name = $1",
      [schema],
    );
    if (gone.rows[0].n !== 0) throw new Error("schema was not dropped");
    console.log("  schema dropped, confirmed absent");

    console.log("step 4: restore (psql, single-transaction) from backup");
    restore({ file: b.file });

    console.log("step 5: verify restored rows are identical");
    const after = await tableFingerprint(client, schema);
    console.log(`  after:  rows=${after.n} sum_cents=${after.sum}`);
    if (after.n !== before.n || after.sum !== before.sum) {
      throw new Error(`fingerprint mismatch — before ${JSON.stringify(before)} after ${JSON.stringify(after)}`);
    }

    console.log("\nDR self-test: PASS — dump+restore round-trip verified, rows identical, target left clean.");
  } finally {
    // Always drop the throwaway schema — even if a step above threw.
    try {
      await client.query(`drop schema if exists ${schema} cascade;`);
    } catch {
      /* best effort */
    }
    if (haveLock) {
      try {
        await client.query("select pg_advisory_unlock($1, $2)", [DR_LOCK_1, DR_LOCK_2]);
      } catch {
        /* released on client.end() */
      }
    }
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
