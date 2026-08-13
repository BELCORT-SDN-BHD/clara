import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { MIGRATION_SESSION_BASELINE, TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM } from "../scripts/migration-atomicity.mjs";
import { connectionConfig, disposableDatabaseName, withDatabaseEnv } from "./migrate-harness.mjs";

const DBNAME = disposableDatabaseName("clara_migrate_session");
const MIGRATIONS_DIR = mkdtempSync(join(tmpdir(), "clara-migrate-session-"));
const silent = () => {};
let admin;
let db;

before(async () => {
  admin = new pg.Client(connectionConfig());
  await admin.connect();
  await admin.query(`create database "${DBNAME}"`);
  await admin.query(`alter database "${DBNAME}" set check_function_bodies=off`);
  db = new pg.Client(connectionConfig(DBNAME));
  await db.connect();
  assert.equal((await db.query("show check_function_bodies")).rows[0].check_function_bodies, "off");
});

after(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`drop database if exists "${DBNAME}" with (force)`).catch(() => {});
    await admin.end();
  }
  rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
});

test("migration session GUCs cannot weaken a later migration", async () => {
  // THE AMBIENT CASE — the pin's real job, and it stays green. The DATABASE default is
  // check_function_bodies=off (set in `before`, before the runner ever connects), and the
  // runner pins its own session to on.
  //
  // Proven BEHAVIOURALLY rather than by reading the GUC: a migration may no longer even
  // mention check_function_bodies, and an invalid function being REJECTED is stronger
  // evidence that validation ran than any value the body could report about itself.
  const poisonSql = `
    create table clara.guc_poison_committed(marker text primary key);
    insert into clara.guc_poison_committed values('0001 ran');
    set transform_null_equals=on;
    set clara.probe='migration-0001';
  `;
  writeFileSync(join(MIGRATIONS_DIR, "0001_guc_poison.sql"), poisonSql, "utf8");
  writeFileSync(join(MIGRATIONS_DIR, "0002_invalid_function.sql"), `
    do $$begin
      if null = null then raise exception 'transform_null_equals leaked'; end if;
      if current_setting('clara.probe',true) is not null then raise exception 'custom GUC leaked'; end if;
    end$$;
    create table clara.guc_later_semantics_started(marker text primary key);
    create function clara.invalid_under_clean_baseline() returns int language sql as
      $$select missing_column from clara.guc_missing_relation$$;
  `, "utf8");
  await assert.rejects(withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent })),
    /relation "clara\.guc_missing_relation" does not exist/,
    "the ambient database default is off, so this rejection IS the proof the session pin held");
  assert.deepEqual((await db.query("select version,checksum from clara.schema_migrations order by version")).rows,
    [{ version: "0001_guc_poison", checksum: createHash("sha256").update(poisonSql, "utf8").digest("hex") }]);
  assert.deepEqual((await db.query("select marker from clara.guc_poison_committed")).rows, [{ marker: "0001 ran" }]);
  assert.equal((await db.query("select to_regclass('clara.guc_later_semantics_started') is null absent")).rows[0].absent, true);
  assert.equal((await db.query("select to_regprocedure('clara.invalid_under_clean_baseline()') is null absent")).rows[0].absent, true);
});

test("session_replication_role is the only superuser-restricted baseline parameter", async () => {
  // THE NAMED CHECK behind SUPERUSER_ONLY_SETTINGS. Every other baseline parameter is
  // claimed to be USERSET; this asks pg_settings rather than trusting the claim, and it
  // keeps the claim honest — a future baseline addition with a restricted context reds
  // here instead of silently joining and aborting the next managed-cluster ceremony.
  const serverVersionNum = Number((await db.query("show server_version_num")).rows[0].server_version_num);
  const names = Object.keys(MIGRATION_SESSION_BASELINE)
    .filter((name) => name !== "transaction_timeout" || serverVersionNum >= TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM);
  const rows = (await db.query(
    "select name, context from pg_catalog.pg_settings where name = any($1::text[]) order by name", [names])).rows;

  assert.deepEqual(rows.map((row) => row.name).sort(), [...names].sort(),
    "every baseline parameter must exist on this server — a missing one would be pinned blind");
  assert.deepEqual(
    rows.filter((row) => row.context !== "user").map((row) => `${row.name}=${row.context}`),
    ["session_replication_role=superuser"],
    "exactly one baseline parameter may need the guarded pin; a new one must be added to SUPERUSER_ONLY_SETTINGS",
  );
});

test("a migration that touches check_function_bodies is refused outright", async () => {
  // THE IN-BODY CASE — no longer tolerated-and-restored. Disabling function-body
  // validation is owner-authorized only, and a body that turns it off has already
  // created unvalidated functions by the time anything could restore it, so the whole
  // migration is rejected and nothing commits. Its own database and directory, so the
  // refusals cannot be confused with the ambient cell's state.
  const dbname = disposableDatabaseName("clara_migrate_cfb_refusal");
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-cfb-"));
  await admin.query(`create database "${dbname}"`);
  const witness = new pg.Client(connectionConfig(dbname));
  await witness.connect();
  try {
    writeFileSync(join(dir, "0001_baseline.sql"), "create table clara.cfb_baseline(x pg_catalog.int4);", "utf8");
    await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));

    const pending = join(dir, "0002_disable_validation.sql");
    for (const [label, sql, expected] of [
      // Caught by the TEXT scan, before a single statement of the body runs.
      ["bare SET", "set check_function_bodies=off; create table clara.cfb_marker(x pg_catalog.int4);",
        /touches check_function_bodies/],
      ["set_config", "select set_config('check_function_bodies','off',false); create table clara.cfb_marker(x pg_catalog.int4);",
        /touches check_function_bodies/],
      ["ALTER DATABASE ... SET", `alter database "${dbname}" set check_function_bodies=off;`,
        /touches check_function_bodies/],
      ["quoted identifier", `set "check_function_bodies"=off;`, /touches check_function_bodies/],
      // Even a READ is refused: there is deliberately no allowlist to reason about.
      ["read-only mention", "select current_setting('check_function_bodies');", /touches check_function_bodies/],
      // INVISIBLE to the text scan (the lexer collapses a dollar-quoted block to its
      // tag), so this one must be caught server-side by the execution wrapper.
      ["dynamic, inside a dollar-quoted block",
        `do $dyn$begin perform set_config('check_function_bodies','off',false); end$dyn$;
         create function clara.cfb_invalid() returns int language sql as $body$select nope from nowhere$body$;`,
        /migration disabled check_function_bodies/],
    ]) {
      writeFileSync(pending, sql, "utf8");
      await assert.rejects(withDatabaseEnv(dbname, () => migrate({ dir, log: silent })), expected,
        `the ${label} spelling must be refused`);
    }

    assert.deepEqual((await witness.query("select version from clara.schema_migrations order by version")).rows,
      [{ version: "0001_baseline" }], "no refused migration may reach the ledger");
    assert.equal((await witness.query("select to_regclass('clara.cfb_marker') is null absent")).rows[0].absent, true);
    assert.equal((await witness.query("select to_regprocedure('clara.cfb_invalid()') is null absent")).rows[0].absent,
      true, "the function created under disabled validation must not survive");
    assert.equal((await witness.query("show check_function_bodies")).rows[0].check_function_bodies, "on",
      "and the refused ALTER DATABASE must not have moved the database default");
  } finally {
    await witness.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
