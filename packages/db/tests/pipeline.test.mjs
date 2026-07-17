// Slice-1 pipeline smoke test — proves the migration pipeline runs end-to-end
// against a REAL Postgres: migrate -> seed -> assert. Requires a reachable
// database via the environment (PG* vars or DATABASE_URL). In CI this is the
// throwaway `postgres:17` service container; locally it is the remote project's
// session-mode pooler (then `db:reset`). It never runs against a live project in CI.
//
// The real cross-firm isolation rig is Slice 2 (per REBUILD-PLAN.md); this only
// proves the plumbing works.

import test from "node:test";
import assert from "node:assert/strict";
import { migrate } from "../scripts/migrate.mjs";
import { seed } from "../scripts/seed.mjs";
import { makePool } from "../lib/pg.mjs";

const silent = () => {};

test("migration pipeline applies migrations, records versions, and seeds synthetic rows", async () => {
  await migrate({ log: silent });
  // Migrate again — must be a no-op (idempotency).
  const second = await migrate({ log: silent });
  assert.equal(second.applied, 0, "re-running migrate should apply zero new migrations");

  await seed({ log: silent });

  const pool = makePool();
  try {
    const version = await pool.query(
      "select checksum from clara.schema_migrations where version = $1",
      ["0001_smoke"],
    );
    assert.equal(version.rowCount, 1, "0001_smoke must be recorded in schema_migrations");

    const smoke = await pool.query("select count(*)::int as n from clara.slice1_smoke");
    assert.equal(smoke.rows[0].n, 3, "smoke seed must load exactly 3 synthetic rows");

    const balance = await pool.query("select coalesce(sum(amount_cents),0)::bigint as bal from clara.slice1_smoke");
    // 100000 + 45050 - 45050 = 100000 cents.
    assert.equal(String(balance.rows[0].bal), "100000", "synthetic ledger balance must reconcile");
  } finally {
    await pool.end();
  }
});
