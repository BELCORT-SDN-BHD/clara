// #806 — the pg_dump/psql skip DECISION, pinned in both directions. `fs7-v17-chatturn-db.
// test.mjs`, `relay-taxonomy.test.mjs` and `leader-state.test.mjs` all clone the ambient database
// through `cloneAmbientDatabase()` (pg_dump | psql); this file proves the shared skip verdict
// those three consume, on a host where BOTH conditions (present, absent) are reachable — no test
// here depends on this host actually lacking the binaries, mirroring eicar-fixture's own
// intake-unit.test.mjs cells for #693.

import { test } from "node:test";
import assert from "node:assert/strict";
import { PG_TOOLS_SKIP_REASON, pgToolsSkipReason, probePgTools, pgToolsSkipForThisHost } from "./pg-tools-fixture.mjs";

test("(#806) both binaries missing SKIPS with the exact shared reason", () => {
  assert.equal(
    pgToolsSkipReason({ pgDumpFound: false, psqlFound: false }),
    PG_TOOLS_SKIP_REASON,
    "neither binary resolvable must skip, and say why — not fail as though cloneAmbientDatabase() itself had regressed",
  );
});

test("(#806) either binary alone missing still SKIPS — the clone needs BOTH", () => {
  assert.equal(pgToolsSkipReason({ pgDumpFound: false, psqlFound: true }), PG_TOOLS_SKIP_REASON, "pg_dump alone missing skips");
  assert.equal(pgToolsSkipReason({ pgDumpFound: true, psqlFound: false }), PG_TOOLS_SKIP_REASON, "psql alone missing skips");
});

test("(#806) positive control: both binaries present RUNS the cell", () => {
  assert.equal(
    pgToolsSkipReason({ pgDumpFound: true, psqlFound: true }),
    false,
    "both binaries resolvable must run — the skip is conditional on the measurement, never unconditional",
  );
});

test("(#806) this host's OWN probe: pg_dump/psql are on PATH here (RIG-MAC.md's toolchain), so this rig runs, not skips", () => {
  const probe = probePgTools();
  assert.equal(probe.pgDumpFound, true, "this rig's PATH is prefixed with ~/.local/pg17/bin — pg_dump must resolve");
  assert.equal(probe.psqlFound, true, "this rig's PATH is prefixed with ~/.local/pg17/bin — psql must resolve");
  assert.equal(pgToolsSkipForThisHost(), false, "the host-level verdict on this rig is 'run', not skip");
});

test("(#806) the PG_DUMP/PSQL overrides are honoured — a bogus override reproduces the missing-binary skip on ANY host", () => {
  const prevDump = process.env.PG_DUMP;
  const prevPsql = process.env.PSQL;
  try {
    process.env.PG_DUMP = "/nonexistent/pg_dump";
    process.env.PSQL = "/nonexistent/psql";
    assert.equal(pgToolsSkipForThisHost(), PG_TOOLS_SKIP_REASON, "a PG_DUMP/PSQL override pointed at nothing must skip — resolved the SAME way cloneAmbientDatabase() resolves it");
  } finally {
    if (prevDump === undefined) delete process.env.PG_DUMP; else process.env.PG_DUMP = prevDump;
    if (prevPsql === undefined) delete process.env.PSQL; else process.env.PSQL = prevPsql;
  }
});
