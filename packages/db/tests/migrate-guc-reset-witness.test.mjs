import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { connectionConfig, disposableDatabaseName, withDatabaseEnv } from "./migrate-harness.mjs";

const DBNAME = disposableDatabaseName("clara_migrate_guc_witness");
const MIGRATIONS_DIR = mkdtempSync(join(tmpdir(), "clara-migrate-guc-witness-"));
const NOTICE_MARKER = `guc-reset-notice-${randomUUID()}`;
const silent = () => {};
let admin;
let db;

before(async () => {
  admin = new pg.Client(connectionConfig());
  await admin.connect();
  await admin.query(`create database "${DBNAME}"`);
  db = new pg.Client(connectionConfig(DBNAME));
  await db.connect();
  assert.equal((await db.query("show transform_null_equals")).rows[0].transform_null_equals, "off");
});

after(async () => {
  if (db) await db.end();
  if (admin) {
    await admin.query(`drop database if exists "${DBNAME}" with (force)`).catch(() => {});
    await admin.end();
  }
  rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
});

test("migration session reset clears unlisted and custom GUCs before the next file", async () => {
  // Each migration records, from inside its own body, both the backend it ran on and the
  // SESSION-PIN NONCE its session carries — the server's own answer, not the runner's
  // claim about it. The nonce is the load-bearing one; the pid is observability.
  const poisonSql = `
    create table clara.guc_reset_witness(marker text primary key);
    create table clara.backend_pid_witness(version text primary key, pid int not null, nonce text);
    insert into clara.backend_pid_witness values('0001_poison', pg_catalog.pg_backend_pid(),
      pg_catalog.current_setting('clara.migration_session_nonce', true));
    set transform_null_equals=on;
    set client_min_messages=warning;
    set clara.probe='migration-0001';
  `;
  const witnessSql = `
    insert into clara.backend_pid_witness values('0002_witness', pg_catalog.pg_backend_pid(),
      pg_catalog.current_setting('clara.migration_session_nonce', true));
    insert into clara.guc_reset_witness(marker)
      select 'transform_null_equals_leaked' where null = null;
    insert into clara.guc_reset_witness(marker) values(current_setting('client_min_messages'));
    do $$begin
      raise notice '${NOTICE_MARKER}';
      if current_setting('clara.probe',true) is not null then
        raise exception 'custom GUC leaked';
      end if;
    end$$;
  `;
  writeFileSync(join(MIGRATIONS_DIR, "0001_poison.sql"), poisonSql, "utf8");
  writeFileSync(join(MIGRATIONS_DIR, "0002_witness.sql"), witnessSql, "utf8");

  const logs = [];
  assert.deepEqual(
    await withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: (line) => logs.push(line) })),
    { applied: 2, total: 2 },
  );
  assert.equal(logs.filter((line) => line.includes(NOTICE_MARKER)).length, 1);
  assert.ok(logs.some((line) => line === `  [notice] ${NOTICE_MARKER}`));
  assert.deepEqual((await db.query("select marker from clara.guc_reset_witness")).rows, [
    { marker: "notice" },
  ]);
  assert.deepEqual(
    (await db.query("select version from clara.schema_migrations order by version")).rows,
    [{ version: "0001_poison" }, { version: "0002_witness" }],
  );

  // THE LOAD-BEARING PROOF: each migration's body observed a session-pin nonce, and the
  // two are DIFFERENT — so each body ran on a session pinned freshly for it. This holds
  // whether or not the backend underneath was recycled, which is what makes it the
  // honest instrument for a pooled deployment.
  const witnessed = (await db.query("select version,pid,nonce from clara.backend_pid_witness order by version")).rows;
  assert.equal(witnessed.length, 2);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
  for (const { version, nonce } of witnessed) {
    assert.match(nonce ?? "", uuid, `${version} ran without a session-pin nonce`);
  }
  assert.notEqual(witnessed[0].nonce, witnessed[1].nonce,
    "both migrations carried the SAME session-pin nonce — the second ran on a session pinned for the first");

  // The runner's own per-migration line reports the pid the SERVER recorded, so the log
  // is evidence rather than decoration. Backend-pid DISTINCTNESS is asserted only here,
  // and only because this file connects DIRECTLY to a throwaway container: through a
  // session pooler a recycled backend is correct and expected, never a fault.
  for (const { version, pid } of witnessed) {
    assert.ok(logs.includes(`  applied ${version} · backend pid ${pid}`),
      `the runner logged no line matching '  applied ${version} · backend pid ${pid}' — saw ${JSON.stringify(logs)}`);
  }
  assert.notEqual(witnessed[0].pid, witnessed[1].pid,
    "DIRECT-CONNECTION ENVIRONMENT ONLY: a direct connection gives each client its own backend");
});

test("a recycled backend pid is reported, never refused", async () => {
  // The pooler shape that refused a live migration. Real clients against a real database;
  // ONLY the server-observed pid is forced to repeat, exactly as Supavisor recycling a
  // backend across client connections presents. The run must SUCCEED and say so.
  const dbname = disposableDatabaseName("clara_migrate_pid_repeat");
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-pid-repeat-"));
  const REPEATED_PID = 424242;
  await admin.query(`create database "${dbname}"`);
  const observer = new pg.Client(connectionConfig(dbname));
  await observer.connect();
  try {
    writeFileSync(join(dir, "0001_first.sql"), "create table clara.pid_first(x pg_catalog.int4);", "utf8");
    writeFileSync(join(dir, "0002_second.sql"), "create table clara.pid_second(x pg_catalog.int4);", "utf8");
    const clientFactory = (config = {}) => {
      const client = new pg.Client({ ...connectionConfig(dbname), ...config });
      const query = client.query.bind(client);
      client.query = (sql, params) =>
        typeof sql === "string" && sql.includes("pg_backend_pid")
          ? Promise.resolve({ rows: [{ pid: REPEATED_PID }], rowCount: 1 })
          : query(sql, params);
      return client;
    };

    const logs = [];
    assert.deepEqual(
      await withDatabaseEnv(dbname, () => migrate({ dir, log: (line) => logs.push(line), clientFactory })),
      { applied: 2, total: 2 },
      "a recycled backend is correct through a pooler and must not fail the run",
    );
    assert.ok(logs.some((line) => line.includes(`backend pid ${REPEATED_PID} also served 0001_first`)),
      `the repeat must be REPORTED — saw ${JSON.stringify(logs)}`);
    assert.deepEqual(
      (await observer.query("select version from clara.schema_migrations order by version")).rows,
      [{ version: "0001_first" }, { version: "0002_second" }],
    );
  } finally {
    await observer.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a session whose pin nonce does not match refuses the body", async () => {
  // Live, through the real runner: the pin's set_config for the nonce is intercepted so
  // the SERVER ends up holding a different value than the runner recorded. That is the
  // shape of a lost pin, a swapped session, or transaction-mode pooling.
  const dbname = disposableDatabaseName("clara_migrate_nonce_tamper");
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-nonce-"));
  await admin.query(`create database "${dbname}"`);
  const observer = new pg.Client(connectionConfig(dbname));
  await observer.connect();
  try {
    writeFileSync(join(dir, "0001_tampered.sql"), "create table clara.nonce_tampered(x pg_catalog.int4);", "utf8");
    const clientFactory = (config = {}) => {
      const client = new pg.Client({ ...connectionConfig(dbname), ...config });
      const query = client.query.bind(client);
      client.query = (sql, params) => {
        if (typeof sql === "string" && sql.includes("set_config($1") &&
            params?.[0] === "clara.migration_session_nonce") {
          return query(sql, [params[0], "a-nonce-the-runner-never-issued"]);
        }
        return query(sql, params);
      };
      return client;
    };

    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent, clientFactory })),
      /session-pin nonce mismatch: the session reports "a-nonce-the-runner-never-issued"/u,
    );
    assert.equal((await observer.query("select to_regclass('clara.nonce_tampered') is null absent")).rows[0].absent,
      true, "the body must not have run");
    assert.equal((await observer.query(
      "select to_regclass('clara.schema_migrations') is null or (select count(*) from clara.schema_migrations)=0 clean"
    )).rows[0].clean, true, "and nothing may reach the ledger");
  } finally {
    await observer.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
