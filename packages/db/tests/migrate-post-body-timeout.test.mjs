import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { connectionConfig, disposableDatabaseName, withDatabaseEnv } from "./migrate-harness.mjs";

const DBNAME = disposableDatabaseName("clara_migrate_timeout");
const MIGRATIONS_DIR = mkdtempSync(join(tmpdir(), "clara-migrate-timeout-"));
const silent = () => {};
let admin;
let db;

before(async () => {
  admin = new pg.Client(connectionConfig()); await admin.connect(); await admin.query(`create database "${DBNAME}"`);
  db = new pg.Client(connectionConfig(DBNAME)); await db.connect();
});

after(async () => {
  if (db) await db.end();
  if (admin) { await admin.query(`drop database if exists "${DBNAME}" with (force)`).catch(() => {}); await admin.end(); }
  rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
});

test("a legal non-canonical timeout spelling is accepted", async () => {
  // '1200s' is a spelling PostgreSQL accepts and then DISPLAYS as '20min'. Comparing the
  // file's raw literal against current_setting's normalized form aborted the migration
  // AFTER its body had already run — the worst place to discover a formatting opinion.
  const dbname = disposableDatabaseName("clara_migrate_timeout_units");
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-timeout-units-"));
  await admin.query(`create database "${dbname}"`);
  const witness = new pg.Client(connectionConfig(dbname));
  await witness.connect();
  try {
    writeFileSync(join(dir, "0001_non_canonical_units.sql"), `set local statement_timeout = '1200s';
      create table clara.non_canonical_units(seen pg_catalog.text primary key);
      insert into clara.non_canonical_units values(pg_catalog.current_setting('statement_timeout'));`, "utf8");
    assert.deepEqual(await withDatabaseEnv(dbname, () => migrate({ dir, log: silent })), { applied: 1, total: 1 });
    assert.deepEqual((await witness.query("select seen from clara.non_canonical_units")).rows, [{ seen: "20min" }],
      "the server normalized the spelling, and the runner accepted its own armed value");
    // That the normalization did NOT make the comparison vacuous is proven two ways: the
    // 25ms cell below shows the armed timeout is genuinely enforced, and the mock pair in
    // migrate-runner-unit.test.mjs drives the real assertion to red on a true difference.
  } finally {
    await witness.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});

test("migration timeout remains armed for post-body receipt work", async () => {
  writeFileSync(join(MIGRATIONS_DIR, "0001_baseline.sql"), "create table clara.timeout_baseline(marker text primary key);", "utf8");
  await withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent }));
  await db.query(`create function clara._slow_receipt() returns trigger language plpgsql as
    $$begin if new.version='0002_post_body_timeout' then perform pg_catalog.pg_sleep(0.2); end if; return new; end$$;
    create trigger _slow_receipt before insert on clara.schema_migrations for each row execute function clara._slow_receipt()`);
  writeFileSync(join(MIGRATIONS_DIR, "0002_post_body_timeout.sql"), "set local statement_timeout = '25ms'; create table clara.timeout_body_marker(id int);", "utf8");
  await assert.rejects(withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent })),
    (error) => error.cause?.code === "57014");
  assert.deepEqual((await db.query("select version from clara.schema_migrations order by version")).rows,
    [{ version: "0001_baseline" }]);
  assert.equal((await db.query("select to_regclass('clara.timeout_body_marker') is null absent")).rows[0].absent, true);
});
