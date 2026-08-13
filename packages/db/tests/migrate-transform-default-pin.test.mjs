import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM } from "../scripts/migration-atomicity.mjs";
import { connectionConfig, disposableDatabaseName, withDatabaseEnv } from "./migrate-harness.mjs";

const DBNAME = disposableDatabaseName("clara_migrate_transform_pin");
const MIGRATIONS_DIR = mkdtempSync(join(tmpdir(), "clara-migrate-transform-pin-"));
const silent = () => {};
let admin;
let observer;
let serverVersionNum;

before(async () => {
  admin = new pg.Client(connectionConfig());
  await admin.connect();
  await admin.query(`create database "${DBNAME}"`);
  await admin.query(`alter database "${DBNAME}" set transform_null_equals=on`);
  observer = new pg.Client(connectionConfig(DBNAME));
  await observer.connect();
  assert.equal((await observer.query("show transform_null_equals")).rows[0].transform_null_equals, "on");
  serverVersionNum = Number((await observer.query("show server_version_num")).rows[0].server_version_num);
});

after(async () => {
  if (observer) await observer.end();
  if (admin) {
    await admin.query(`drop database if exists "${DBNAME}" with (force)`).catch(() => {});
    await admin.end();
  }
  rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
});

test("migration runner pins transform_null_equals off over a poisoned database default", async () => {
  writeFileSync(join(MIGRATIONS_DIR, "0001_witness.sql"), `
    create table clara.transform_default_witness(marker text primary key);
    insert into clara.transform_default_witness(marker)
      select 'transform_null_equals_leaked' where null = null;
    insert into clara.transform_default_witness(marker)
      values (current_setting('transform_null_equals'));
  `, "utf8");

  assert.deepEqual(await withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent })), {
    applied: 1,
    total: 1,
  });
  assert.deepEqual((await observer.query("select marker from clara.transform_default_witness order by marker")).rows, [
    { marker: "off" },
  ]);
  assert.equal((await observer.query("show transform_null_equals")).rows[0].transform_null_equals, "on");
});

test("migration runner survives a poisoned database transaction_timeout default", async () => {
  // transaction_timeout (PostgreSQL 17+) terminates the SESSION when it fires, and a
  // migration's runner-owned transaction is precisely the long transaction it would
  // kill. Two windows have to be closed and this cell exercises both:
  //   1. the session pin, proven by a body that sleeps well past the poisoned default;
  //   2. the re-pin the server-side wrapper issues after its RESET ALL — measured on
  //      17.10, setting the parameter part-way through an open transaction arms a FRESH
  //      window from that instant, so RESET ALL would hand the runner's post-body
  //      verification work straight back to the poisoned value. A deliberately slow
  //      receipt trigger makes that post-body stretch outrun the timeout.
  // Below 17 the parameter does not exist; the run must still succeed and SAY that it
  // skipped the pin, so the branch is asserted rather than skipped.
  const dbname = disposableDatabaseName("clara_migrate_txn_timeout");
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-txn-timeout-"));
  const hasTransactionTimeout = serverVersionNum >= TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM;
  await admin.query(`create database "${dbname}"`);
  const witness = new pg.Client(connectionConfig(dbname));
  await witness.connect();
  try {
    if (hasTransactionTimeout) await admin.query(`alter database "${dbname}" set transaction_timeout='150ms'`);
    writeFileSync(join(dir, "0001_baseline.sql"), "create table clara.txn_timeout_baseline(x pg_catalog.int4);", "utf8");
    const firstLogs = [];
    await withDatabaseEnv(dbname, () => migrate({ dir, log: (line) => firstLogs.push(line) }));

    // A receipt trigger that sleeps 400ms: the post-body stretch, inside the runner's
    // transaction and after the wrapper's RESET ALL, now far outruns the 150ms default.
    await witness.query(`create function clara._slow_receipt() returns trigger language plpgsql as
      $$begin if new.version='0002_txn_timeout' then perform pg_catalog.pg_sleep(0.4); end if; return new; end$$;
      create trigger _slow_receipt before insert on clara.schema_migrations
        for each row execute function clara._slow_receipt()`);
    writeFileSync(join(dir, "0002_txn_timeout.sql"), `
      create table clara.txn_timeout_witness(marker pg_catalog.text primary key);
      insert into clara.txn_timeout_witness
        values(coalesce(pg_catalog.current_setting('transaction_timeout',true),'(absent)'));
      select pg_catalog.pg_sleep(0.35);
    `, "utf8");

    const logs = [];
    assert.deepEqual(await withDatabaseEnv(dbname, () => migrate({ dir, log: (line) => logs.push(line) })),
      { applied: 1, total: 2 });
    assert.equal((await witness.query("select marker from clara.txn_timeout_witness")).rows[0].marker,
      hasTransactionTimeout ? "0" : "(absent)");
    assert.deepEqual((await witness.query("select version from clara.schema_migrations order by version")).rows,
      [{ version: "0001_baseline" }, { version: "0002_txn_timeout" }]);

    const skipNote = [...firstLogs, ...logs].filter((line) => line.includes("transaction_timeout pin skipped"));
    if (hasTransactionTimeout) {
      assert.deepEqual(skipNote, [], "a server that HAS the parameter must not report skipping it");
      // Read the STORED database default, not a live session's value: the sessions in
      // this cell were opened before the ALTER and would report a stale 0 either way.
      assert.deepEqual(
        (await admin.query(`select s.setconfig from pg_catalog.pg_db_role_setting s
            join pg_catalog.pg_database d on d.oid OPERATOR(pg_catalog.=) s.setdatabase
           where d.datname OPERATOR(pg_catalog.=) $1 and s.setrole OPERATOR(pg_catalog.=) 0`, [dbname])).rows,
        [{ setconfig: ["transaction_timeout=150ms"] }],
        "the poisoned database default must still stand — the runner pins its own session, never the database",
      );
    } else {
      assert.equal(skipNote.length, 2, "each run must say out loud that the version gate skipped the pin");
      assert.match(skipNote[0], /predates PostgreSQL 17/u);
    }
  } finally {
    await witness.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
