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
  // Each migration also records the backend it ran on, from inside its own body — the
  // SERVER's answer to "which connection am I", not the runner's claim about it.
  const poisonSql = `
    create table clara.guc_reset_witness(marker text primary key);
    create table clara.backend_pid_witness(version text primary key, pid int not null);
    insert into clara.backend_pid_witness values('0001_poison', pg_catalog.pg_backend_pid());
    set transform_null_equals=on;
    set client_min_messages=warning;
    set clara.probe='migration-0001';
  `;
  const witnessSql = `
    insert into clara.backend_pid_witness values('0002_witness', pg_catalog.pg_backend_pid());
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

  // Two pending migrations, two DISTINCT server-observed backends — a fresh connection
  // per file is what keeps one migration's session state out of the next one.
  const witnessed = (await db.query("select version,pid from clara.backend_pid_witness order by version")).rows;
  assert.equal(witnessed.length, 2);
  assert.notEqual(witnessed[0].pid, witnessed[1].pid,
    `both migrations ran on backend pid ${witnessed[0].pid} — the runner reused a connection`);
  // ...and the runner's own per-migration line reports the pid the SERVER recorded, so
  // the log is evidence rather than decoration.
  for (const { version, pid } of witnessed) {
    assert.ok(logs.includes(`  applied ${version} · backend pid ${pid}`),
      `the runner logged no line matching '  applied ${version} · backend pid ${pid}' — saw ${JSON.stringify(logs)}`);
  }
});

test("a repeated server backend pid refuses the run", async () => {
  // Real clients against a real database; ONLY the server-observed pid is forced to
  // repeat, which is exactly the symptom a reused connection would present.
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

    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent, clientFactory })),
      new RegExp(`migration 0002_second landed on server backend pid ${REPEATED_PID}, ` +
        `the backend 0001_first already ran on`),
    );

    // The refusal lands BEFORE the second body opens its transaction: the first
    // migration stands, the second left nothing behind.
    assert.deepEqual(
      (await observer.query("select version from clara.schema_migrations order by version")).rows,
      [{ version: "0001_first" }],
    );
    assert.equal((await observer.query("select to_regclass('clara.pid_first') is not null present")).rows[0].present, true);
    assert.equal((await observer.query("select to_regclass('clara.pid_second') is null absent")).rows[0].absent, true);
  } finally {
    await observer.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
  }
});
