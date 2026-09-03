// Guards on packages/db/tests/migrate-harness.mjs's two destructive helpers --
// createDisposableDatabase() and cloneAmbientDatabase() -- both call
// assertDestructiveAllowed() (packages/db/lib/guard.mjs:52) as their FIRST
// statement, the same gate reset.mjs/seed.mjs/restore.mjs/restore-full.mjs/
// dr-selftest.mjs already enforce for every other destructive data-plane
// operation (PR #498 fold, 2026-09-02 -- packages/runtime/tests/relay-
// taxonomy.test.mjs and fs7-v17-chatturn-db.test.mjs both call through these
// two helpers now instead of their own unguarded local reimplementations).
//
// This file proves the wall is LIVE, not merely present in the source: with
// CLARA_ALLOW_DESTRUCTIVE unset, both calls must refuse with the guard's own
// named error -- and createDisposableDatabase() must refuse BEFORE the target
// database exists at all (a positive read against pg_database, not an absence
// claim -- law 2: only what a read SAW counts as evidence).
//
// A one-line mutant deleting either assertDestructiveAllowed() call must RED
// this file: without the guard, CREATE DATABASE would actually run (turning
// the "must not exist" read into a genuine failure) and cloneAmbientDatabase()
// would proceed straight to pg_dump instead of throwing.
//
// rev-498 M2 correction: a bare `assert.throws(...)` on the error MESSAGE is a
// law-3 spelling check, not proof pg_dump never ran -- a `pg_dump` that merely
// FAILED to start (wrong binary, PATH miss) throws a DIFFERENT message but
// still passes a loose "did it throw" assertion. So the cell ALSO snapshots
// the `clara-clone-*` scratch-directory family under `tmpdir()` (the one
// `mkdtempSync()` creates strictly AFTER the guard check) before and after the
// guarded call, asserting the set is unchanged.
//
// rev-498 SECOND ROUND MINOR-1 correction (the prior version of this comment
// overclaimed): that snapshot is a LEAK DETECTOR, not a structural "never
// spawned" proof -- `cloneAmbientDatabase()`'s own `finally { rmSync(dumpDir) }`
// removes the scratch dir on EVERY path, including one where `pg_dump`
// genuinely ran to completion, so an unchanged snapshot would ALSO be what a
// real (non-refused) clone leaves behind once its own cleanup runs. Real
// value: it catches the refusal path failing to clean up after itself, and
// (endorsed by the reviewer as the right instrument for THAT purpose) it is
// good enough as a same-process sanity check here. It reads the SHARED
// `tmpdir()` by name PREFIX, not a process-scoped path, so a sibling lane's
// own clone landing inside this exact snapshot window could in principle
// pollute it -- a local multi-lane-host risk, not a CI one (each CI job runs
// in its own single-tenant VM).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import pg from "pg";
import { connectionConfig, disposableDatabaseName, createDisposableDatabase, cloneAmbientDatabase } from "./migrate-harness.mjs";
import { childEnvForExternalTools } from "../lib/pg.mjs";

/** The `clara-clone-*` scratch directories cloneAmbientDatabase() would create. */
function cloneScratchDirs() {
  return new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("clara-clone-")));
}

// Captured at module load, before either cell touches the flag -- the second cell's
// own restore-verified-correctly check compares against THIS, not a guess.
const ambientClaraAllowDestructive = process.env.CLARA_ALLOW_DESTRUCTIVE;

test("migrate-harness destructive guard: CLARA_ALLOW_DESTRUCTIVE unset -> createDisposableDatabase() and cloneAmbientDatabase() both refuse with the named guard error, before touching the cluster", async () => {
  const savedFlag = process.env.CLARA_ALLOW_DESTRUCTIVE;
  delete process.env.CLARA_ALLOW_DESTRUCTIVE; // the RED-before precondition: authorization absent
  const probeDb = disposableDatabaseName("clara_guard_probe");
  const admin = new pg.Client(connectionConfig());
  await admin.connect();
  try {
    await assert.rejects(
      () => createDisposableDatabase(admin, probeDb),
      /is destructive and REFUSED/,
      "createDisposableDatabase() must refuse without CLARA_ALLOW_DESTRUCTIVE=1 (the exact error assertDestructiveAllowed() throws)",
    );
    // Positive read, not an absence claim about the CALL -- proves the refusal
    // happened BEFORE the CREATE DATABASE statement ever reached the server.
    const found = await admin.query("select 1 from pg_database where datname = $1", [probeDb]);
    assert.equal(found.rows.length, 0, "the refused CREATE DATABASE never created anything");

    const sourceEnv = childEnvForExternalTools();
    const scratchBefore = cloneScratchDirs();
    assert.throws(
      () => cloneAmbientDatabase(sourceEnv, probeDb),
      /is destructive and REFUSED/,
      "cloneAmbientDatabase() must refuse without CLARA_ALLOW_DESTRUCTIVE=1, before pg_dump ever starts (a sync throw, not a rejection -- this helper is not async)",
    );
    // THE load-bearing assertion (rev-498 M2): a leak-detector check, not a
    // message-string match -- see the file header note for what this does and
    // does not prove.
    assert.deepEqual(cloneScratchDirs(), scratchBefore, "cloneAmbientDatabase() must refuse BEFORE creating its pg_dump scratch directory -- the dump pipeline must never start");
  } finally {
    // Defensive: only fires if a mutant (or a future regression) let CREATE DATABASE
    // through despite the missing authorization above.
    await admin.query(`drop database if exists "${probeDb}" with (force)`).catch(() => {});
    await admin.end().catch(() => {});
    if (savedFlag === undefined) delete process.env.CLARA_ALLOW_DESTRUCTIVE;
    else process.env.CLARA_ALLOW_DESTRUCTIVE = savedFlag;
  }
});

test("migrate-harness destructive guard: buffer restored -- CLARA_ALLOW_DESTRUCTIVE is exactly what it was before the probe above", () => {
  // The prior cell's own try/finally already restores it; this cell exists so a
  // regression in that restore (e.g. an early return before the finally, or a
  // finally that restores the WRONG value) fails LOUD in the very next cell
  // rather than silently poisoning every test that runs after this file.
  assert.equal(
    process.env.CLARA_ALLOW_DESTRUCTIVE,
    ambientClaraAllowDestructive,
    "CLARA_ALLOW_DESTRUCTIVE must be back to its pre-probe value",
  );
});
