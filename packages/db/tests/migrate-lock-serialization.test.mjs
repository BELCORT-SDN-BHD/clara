import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate } from "../scripts/migrate.mjs";
import { connectionConfig, disposableDatabaseName, setDatabaseEnv } from "./migrate-harness.mjs";

const DBNAME = disposableDatabaseName("clara_migrate_lock");
const MIGRATIONS_DIR = mkdtempSync(join(tmpdir(), "clara-migrate-lock-"));
const MARKER = `clara-unlock-attack-${randomUUID()}`;
const silent = () => {};
let admin;
let observer;

async function markerSessions() {
  return Number((await observer.query(
    "select count(*)::int n from pg_catalog.pg_stat_activity where datname=$1 and application_name=$2",
    [DBNAME, MARKER],
  )).rows[0].n);
}

before(async () => {
  assert.match(DBNAME, /^[a-z0-9_]+$/);
  admin = new pg.Client(connectionConfig());
  await admin.connect();
  await admin.query(`create database "${DBNAME}"`);
  observer = new pg.Client(connectionConfig(DBNAME));
  await observer.connect();
});

after(async () => {
  if (observer) await observer.end();
  if (admin) {
    await admin.query(`drop database if exists "${DBNAME}" with (force)`).catch(() => {});
    await admin.end();
  }
  rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
});

test("migration SQL cannot release the runner serialization lock", async () => {
  writeFileSync(join(MIGRATIONS_DIR, "0001_unlock_attack.sql"), `
    select pg_catalog.pg_advisory_unlock_all();
    select pg_catalog.set_config('application_name','${MARKER}',false);
    select pg_catalog.pg_sleep(0.75);
    create table clara.lock_serialization_proof(id int primary key);
  `, "utf8");
  const restore = setDatabaseEnv(DBNAME);
  try {
    let firstError;
    const first = migrate({ dir: MIGRATIONS_DIR, log: silent });
    first.catch((error) => { firstError = error; });
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline && await markerSessions() !== 1) {
      if (firstError) throw firstError;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.equal(await markerSessions(), 1, "the first runner executed pg_advisory_unlock_all and is still inside its body");
    const second = migrate({ dir: MIGRATIONS_DIR, log: silent });
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(await markerSessions(), 1, "a second runner stays behind the lock held on the unexposed connection");
    const results = await Promise.all([first, second]);
    assert.deepEqual(results.map((result) => result.applied).sort(), [0, 1]);
  } finally {
    restore();
  }
  assert.equal((await observer.query("select count(*)::int n from clara.schema_migrations")).rows[0].n, 1);
});
