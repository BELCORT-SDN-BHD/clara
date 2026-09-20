// #957 — the migration runner's guarded `redo` mode: re-apply one already-applied, unmerged
// migration as a measured operation instead of the hand procedure six wave-2026-09-18 tickets
// independently reinvented (#635, #651, #655, #656, #657, #660 — see the ticket's own Context).
//
// Every cell here uses its OWN disposable database and a SYNTHETIC migrations directory (never
// the real packages/db/migrations/), the same idiom migrate-session-reset.test.mjs and
// migrate-lock-serialization.test.mjs already use — `redo` deletes and re-inserts a ledger row,
// and proving that against the real 234-file estate would risk the shared rig's own frontier.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import pg from "pg";
import { migrate, migrationChecksum } from "../scripts/migrate.mjs";
import { connectionConfig, disposableDatabaseName, withDatabaseEnv } from "./migrate-harness.mjs";

const silent = () => {};

// #957's own destructive guard (lib/guard.mjs's assertDestructiveAllowed, reused — not a second
// gate) reads these from the environment. Saved and restored around every cell that touches them,
// matching rig-reset-guard.test.mjs's own idiom.
const GUARD_ENV_KEYS = ["CLARA_ALLOW_DESTRUCTIVE", "CLARA_DESTRUCTIVE_TARGET"];
const ambientGuardEnv = Object.fromEntries(GUARD_ENV_KEYS.map((k) => [k, process.env[k]]));
function restoreGuardEnv() {
  for (const k of GUARD_ENV_KEYS) {
    if (ambientGuardEnv[k] === undefined) delete process.env[k];
    else process.env[k] = ambientGuardEnv[k];
  }
}

let admin;

before(async () => {
  admin = new pg.Client(connectionConfig());
  await admin.connect();
});

after(async () => {
  restoreGuardEnv();
  if (admin) await admin.end();
});

/** The exact ledger row set for `dbname`, sorted by version — every cell's shared read shape. */
async function ledgerRows(dbname) {
  const c = new pg.Client(connectionConfig(dbname));
  await c.connect();
  try {
    return (await c.query("select version, checksum from clara.schema_migrations order by version")).rows;
  } finally {
    await c.end();
  }
}

// L05-STD-04 (fix round) — independent literals for AC1's checksum assertions below, computed
// OUTSIDE migrationChecksum (the function under test) via the system `sha256sum` (coreutils),
// cross-checked with a bare `crypto.createHash("sha256")` call in a separate node -e invocation:
//   printf '%s' "create table clara.redo_ac1_baseline(x pg_catalog.int4);" | sha256sum
//   printf '%s' "create or replace function clara.redo_ac1_fn() returns pg_catalog.int4 language sql as \$\$select 2\$\$;" | sha256sum
// Asserting against these literals (a known-good, independently-produced value, per tests.md)
// instead of `migrationChecksum(sameString)` means a `migrationChecksum` that always returned a
// constant could no longer make this half of the cell pass — only the genuine, correct hash can.
const AC1_BASELINE_SHA256 = "e8e9628e68a23a7f0c010f6977c0e8fbf5daa867ea303de03f58a2b529bd48ed";
const AC1_EDITED_FN_SHA256 = "01926b8c313468f7dad1816fbb69aa3bb584850de467835a56e5c8e914f2be60";

test("#957 AC1: redoing the highest applied version after editing its file succeeds, and an immediately following normal run reports nothing pending and no drift", async () => {
  process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
  delete process.env.CLARA_DESTRUCTIVE_TARGET;
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-ac1-"));
  const dbname = disposableDatabaseName("clara_migrate_redo_ac1");
  await admin.query(`create database "${dbname}"`);
  const witness = new pg.Client(connectionConfig(dbname));
  await witness.connect();
  try {
    // A REALISTIC redo target: `create or replace function`, exactly the "one-line correction to
    // a function body" shape #656's own A9 (the ticket's cited example) described giving up on.
    // Redo re-runs the WHOLE file from scratch (never a diff against what is already there), so
    // the file itself must tolerate that — the operational norm this ticket's Context describes
    // (revert-then-reapply by hand) for anything that is not naturally idempotent DDL like this.
    const original0002 = "create or replace function clara.redo_ac1_fn() returns pg_catalog.int4 language sql as $$select 1$$;";
    writeFileSync(join(dir, "0001_baseline.sql"), "create table clara.redo_ac1_baseline(x pg_catalog.int4);", "utf8");
    writeFileSync(join(dir, "0002_editable.sql"), original0002, "utf8");
    const first = await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));
    assert.deepEqual(first, { applied: 2, total: 2 });
    assert.equal((await witness.query("select clara.redo_ac1_fn() as v")).rows[0].v, 1);

    // The edit a fix-round author would actually make: the one-line correction.
    const editedSql = "create or replace function clara.redo_ac1_fn() returns pg_catalog.int4 language sql as $$select 2$$;";
    writeFileSync(join(dir, "0002_editable.sql"), editedSql, "utf8");

    const redoResult = await withDatabaseEnv(dbname, () => migrate({ dir, log: silent, redo: "0002_editable" }));
    assert.equal(redoResult.redone, "0002_editable");
    assert.equal(redoResult.checksum, AC1_EDITED_FN_SHA256);

    const rows = await witness.query("select version, checksum from clara.schema_migrations order by version");
    assert.deepEqual(rows.rows, [
      { version: "0001_baseline", checksum: AC1_BASELINE_SHA256 },
      { version: "0002_editable", checksum: AC1_EDITED_FN_SHA256 },
    ]);
    // The re-applied BODY actually ran under the edited bytes — not merely a checksum bookkeeping
    // update: the function now returns the corrected value.
    assert.equal((await witness.query("select clara.redo_ac1_fn() as v")).rows[0].v, 2,
      "the edited migration body must have actually re-run");

    // AC1's second half: immediately after, an ORDINARY run (no redo) sees nothing pending and,
    // critically, does NOT throw on drift — the ledger now agrees with disk.
    const second = await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));
    assert.deepEqual(second, { applied: 0, total: 2 });
  } finally {
    await witness.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

test("#957 AC2: redo refuses when the destructive guard is not satisfied, and changes nothing", async () => {
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-guard-"));
  const dbname = disposableDatabaseName("clara_migrate_redo_guard");
  await admin.query(`create database "${dbname}"`);
  try {
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_guard_marker(x pg_catalog.int4);", "utf8");
    process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
    delete process.env.CLARA_DESTRUCTIVE_TARGET;
    const applied = await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));
    assert.deepEqual(applied, { applied: 1, total: 1 });
    const before = await ledgerRows(dbname);

    delete process.env.CLARA_ALLOW_DESTRUCTIVE;
    // Edit the file too, so a bug that skipped the guard check would be caught by the drift/body
    // change rather than silently no-opping on an unedited file.
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_guard_marker(x pg_catalog.int4, y pg_catalog.int4);", "utf8");
    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent, redo: "0001_only" })),
      /destructive|CLARA_ALLOW_DESTRUCTIVE/i,
      "redo must refuse via the SAME destructive guard reset()/restore()/etc. already use",
    );

    assert.deepEqual(await ledgerRows(dbname), before, "the ledger must be byte-for-byte unchanged after a guard refusal");
  } finally {
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

// L05-S04 (fix round): AC2 above only exercises the FIRST half of assertDestructiveAllowed (the
// CLARA_ALLOW_DESTRUCTIVE=1 check) — every cell in this file connects to 127.0.0.1, which
// targetIsEphemeral() accepts regardless of database name, so the guard's SECOND limb (refusing a
// non-ephemeral target with no CLARA_DESTRUCTIVE_TARGET confirmation) is never reached on the redo
// path, even though the lane brief named it explicitly ("refuse on a non-rig target"). This cell
// proves it directly and stays connection-free (clientFactory throws if ever called), the same
// idiom the "no migration file on disk" cell below uses: `assertNoTargetSplit()` then
// `assertDestructiveAllowed()` both run before `byVersion.has(redo)` is even checked, so a fake,
// unreachable, non-loopback host is enough — nothing here needs a real second Postgres.
test("#957: redo refuses on a NON-RIG (non-ephemeral) target even with CLARA_ALLOW_DESTRUCTIVE=1, opening no connection", async () => {
  const TARGET_ENV_KEYS = ["DATABASE_URL", "WORKFLOW_POSTGRES_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER"];
  const saved = Object.fromEntries(TARGET_ENV_KEYS.map((k) => [k, process.env[k]]));
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-nonrig-"));
  try {
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_nonrig_marker(x pg_catalog.int4);", "utf8");
    delete process.env.DATABASE_URL;
    delete process.env.WORKFLOW_POSTGRES_URL;
    process.env.PGHOST = "prod-pooler.example-clara.internal"; // NOT loopback -> not ephemeral by host
    process.env.PGPORT = "5432";
    process.env.PGDATABASE = "clara_live"; // does not end in _ci/_test/_tmp/_temp/_scratch/_ephemeral
    process.env.PGUSER = "postgres";
    process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
    delete process.env.CLARA_DESTRUCTIVE_TARGET;

    await assert.rejects(
      migrate({
        dir,
        log: silent,
        redo: "0001_only",
        clientFactory() {
          throw new Error("must never connect — the non-ephemeral refusal must fire before any connection opens");
        },
      }),
      /REFUSED for non-ephemeral target/,
      "the lane brief named this explicitly: redo must refuse on a non-rig target even with the destructive flag set, unless CLARA_DESTRUCTIVE_TARGET names it exactly",
    );
  } finally {
    for (const k of TARGET_ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

test("#957 AC3: redo refuses a version that is not the highest applied version, and changes nothing", async () => {
  process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
  delete process.env.CLARA_DESTRUCTIVE_TARGET;
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-notfrontier-"));
  const dbname = disposableDatabaseName("clara_migrate_redo_notfrontier");
  await admin.query(`create database "${dbname}"`);
  try {
    writeFileSync(join(dir, "0001_a.sql"), "create table clara.redo_nf_a(x pg_catalog.int4);", "utf8");
    writeFileSync(join(dir, "0002_b.sql"), "create table clara.redo_nf_b(x pg_catalog.int4);", "utf8");
    writeFileSync(join(dir, "0003_c.sql"), "create table clara.redo_nf_c(x pg_catalog.int4);", "utf8");
    await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));
    const before = await ledgerRows(dbname);

    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent, redo: "0002_b" })),
      /not the highest applied version/,
      "redoing anything below the frontier must be refused by name",
    );

    assert.deepEqual(await ledgerRows(dbname), before, "a non-frontier redo refusal must change nothing");
  } finally {
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

test("#957: redo refuses a version that was never applied at all, naming that it is not currently applied", async () => {
  process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
  delete process.env.CLARA_DESTRUCTIVE_TARGET;
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-neverapplied-"));
  const dbname = disposableDatabaseName("clara_migrate_redo_neverapplied");
  await admin.query(`create database "${dbname}"`);
  try {
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_na_marker(x pg_catalog.int4);", "utf8");
    await withDatabaseEnv(dbname, () => migrate({ dir, log: silent })); // applies 0001 only
    writeFileSync(join(dir, "0002_new.sql"), "create table clara.redo_na_second(x pg_catalog.int4);", "utf8"); // never applied
    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent, redo: "0002_new" })),
      /not currently applied/,
    );
  } finally {
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

test("#957: redo refuses a version with no migration file on disk at all, before opening a connection", async () => {
  process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
  delete process.env.CLARA_DESTRUCTIVE_TARGET;
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-nofile-"));
  try {
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_nofile_marker(x pg_catalog.int4);", "utf8");
    await assert.rejects(
      migrate({ dir, log: silent, redo: "9999_does_not_exist", clientFactory() { throw new Error("must never connect"); } }),
      /no migration file on disk/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

test("#957 AC4: a redo that fails mid-apply leaves the ledger row intact (never absent), names the version in the failure, and a SUBSEQUENT NORMAL RUN describes the resulting state with the ordinary checksum-drift refusal (never something it cannot describe)", async () => {
  process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
  delete process.env.CLARA_DESTRUCTIVE_TARGET;
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-midfail-"));
  const dbname = disposableDatabaseName("clara_migrate_redo_midfail");
  await admin.query(`create database "${dbname}"`);
  const witness = new pg.Client(connectionConfig(dbname));
  await witness.connect();
  try {
    const originalSql = "create table clara.redo_midfail_marker(x pg_catalog.int4);";
    writeFileSync(join(dir, "0001_only.sql"), originalSql, "utf8");
    await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));
    const originalChecksum = migrationChecksum(originalSql);

    // A DELIBERATELY BROKEN edit — a reference to a relation that does not exist, so the body
    // fails partway through its own transaction.
    const brokenSql = "insert into clara.does_not_exist_at_all values(1);";
    writeFileSync(join(dir, "0001_only.sql"), brokenSql, "utf8");

    // MUST fail because the BODY actually ran and hit the missing relation — never merely the
    // ordinary pre-flight checksum-drift refusal, which would prove redo's own apply was never
    // reached at all (a loose "matches /0001_only/" regex would pass on EITHER failure reason).
    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent, redo: "0001_only" })),
      (err) => {
        assert.match(err.message, /0001_only/, "the failure must name the version being redone");
        assert.match(err.message, /does_not_exist_at_all/, "the failure must come from the body actually executing, not the pre-flight drift refusal");
        assert.doesNotMatch(err.message, /checksum drift/, "a redo must never be short-circuited by the ordinary drift check on the version it is redoing");
        return true;
      },
    );

    // THE LEDGER ROW IS INTACT, not absent: the DELETE that opened the redo transaction rolled
    // back together with the failed body.
    const rows = await witness.query("select version, checksum from clara.schema_migrations order by version");
    assert.deepEqual(rows.rows, [{ version: "0001_only", checksum: originalChecksum }],
      "a failed redo must leave the ORIGINAL row exactly as it was — never deleted, never half-written");

    // A SUBSEQUENT NORMAL RUN must describe this state with the runner's own, pre-existing
    // vocabulary (checksum drift) rather than crash unrecognisably or silently do nothing wrong.
    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent })),
      /was MODIFIED after being applied \(checksum drift\)/,
      "the next normal run must describe the now-edited-on-disk-but-unapplied file with the ordinary drift message",
    );
  } finally {
    await witness.end().catch(() => {});
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});

test("#957 AC5 (regression): the ordinary apply path still aborts on checksum drift with its existing immutability message, with no `redo` option in play", async () => {
  process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
  delete process.env.CLARA_DESTRUCTIVE_TARGET;
  const dir = mkdtempSync(join(tmpdir(), "clara-migrate-redo-regression-"));
  const dbname = disposableDatabaseName("clara_migrate_redo_regression");
  await admin.query(`create database "${dbname}"`);
  try {
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_regress_marker(x pg_catalog.int4);", "utf8");
    await withDatabaseEnv(dbname, () => migrate({ dir, log: silent }));
    writeFileSync(join(dir, "0001_only.sql"), "create table clara.redo_regress_marker(x pg_catalog.int4, y pg_catalog.int4);", "utf8");
    await assert.rejects(
      withDatabaseEnv(dbname, () => migrate({ dir, log: silent })), // no redo option at all
      /0001_only was MODIFIED after being applied \(checksum drift\)\. Migrations are immutable — add a new migration file instead\./,
    );
  } finally {
    await admin.query(`drop database if exists "${dbname}" with (force)`).catch(() => {});
    rmSync(dir, { recursive: true, force: true });
    restoreGuardEnv();
  }
});
