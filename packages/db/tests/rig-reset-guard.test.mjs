// #773 — T19 can no longer destroy a shared rig just because CLARA_RIG_ALLOW_RESET=1 is set.
//
// WHAT IS PROVEN HERE, at migrate-harness-clone-guard.test.mjs's bar: the refusal is POSITIVE,
// not a message match. The guarded call is handed a SPY in place of `reset()` and the cell reads
// that the spy never ran, then reads that schema `clara` on the real rig database is still
// there — "reset() was never entered" AND "the schema survived", rather than "some error was
// thrown". A one-line mutant deleting `assertResetTargetDisposable()` from `guardedReset()`
// makes the spy run and REDs cell 1.
//
// THE FOOTGUN IS MEASURED, NOT ASSERTED. Cell 1 first checks that the SHARED gate —
// `assertDestructiveAllowed()`, which `reset()` actually calls — RETURNS CLEANLY for the same
// poisoned target. That is the hole #773 is about, read directly: without the name check, the
// DROP SCHEMA would have gone ahead. It is also why the shared guard is reused rather than
// hardened: `restore.mjs`, `restore-full.mjs`, `dr-selftest.mjs`, `seed.mjs`,
// `migrate-harness.mjs` and `rig-cluster-reset.mjs` all call that same gate.
//
// THE ENV IS BORROWED AND HANDED BACK. The cells mutate PGDATABASE / the destructive flags to
// point the RESOLVER at a poisoned target; every one of them is restored in a `finally`, and the
// last cell re-reads that the buffer is exactly what it was — migrate-harness-clone-guard's own
// second-cell idiom, so a regression in the restore fails loud here rather than poisoning every
// file that runs after this one.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assertDestructiveAllowed, EPHEMERAL_DB } from "../lib/guard.mjs";
import { assertResetTargetDisposable, resolvedDatabaseName, guardedReset } from "./rig-reset-guard.mjs";
import { rootQuery, endPool } from "./rig-fixtures.mjs";

/** A real rig name from the 2026-09-14 refresh wave — one of the databases three workers lost. */
const POISONED_DB = "clara_631";

// WORKFLOW_POSTGRES_URL IS IN THIS LIST BECAUSE lib/pg.mjs READS IT AS A DSN URL VAR. urlVar()
// resolves `env.DATABASE_URL || env.WORKFLOW_POSTGRES_URL` (lib/pg.mjs:40-42), so on a rig that
// exports it — which every World-bearing rig recipe in this repo now does — deleting the two vars
// below still leaves a URL target standing. assertDestructiveAllowed() then refuses on
// assertNoTargetSplit (PGDATABASE=clara_631 against the URL's own database) and cell 1's probe
// never reaches the NAME check it exists to measure: the cell reds on the wrong guard, and the
// hole #773 is about goes unread. Buffered and handed back like every other key here.
const ENV_KEYS = ["PGDATABASE", "DATABASE_URL", "POSTGRES_URL", "WORKFLOW_POSTGRES_URL", "CLARA_ALLOW_DESTRUCTIVE", "CLARA_RIG_ALLOW_RESET"];
const ambient = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

function restoreEnv() {
  for (const k of ENV_KEYS) {
    if (ambient[k] === undefined) delete process.env[k];
    else process.env[k] = ambient[k];
  }
}

// Bind the shared pool to the REAL rig BEFORE any cell repoints PGDATABASE, so the
// schema-survived read below cannot accidentally be answered by the poisoned target.
before(async () => { await rootQuery("select 1"); });
after(async () => { restoreEnv(); await endPool(); });

test("#773 T19's reset REFUSES a non-disposable database name on a loopback host with BOTH destructive flags set — reset() is never entered and schema clara survives", async () => {
  const spy = { entered: 0 };
  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.WORKFLOW_POSTGRES_URL;
    process.env.PGDATABASE = POISONED_DB;
    process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
    process.env.CLARA_RIG_ALLOW_RESET = "1";

    // THE HOLE, READ DIRECTLY: the gate reset() itself calls authorises this target. Loopback
    // host + CLARA_ALLOW_DESTRUCTIVE=1 is all targetIsEphemeral() asks for, whatever the
    // database is called — so without the name check the DROP SCHEMA proceeds.
    assert.doesNotThrow(
      () => assertDestructiveAllowed({ action: "probe: the shared gate's own verdict on a poisoned rig" }),
      "lib/guard.mjs's assertDestructiveAllowed() no longer authorises a loopback non-disposable name — "
      + "#773's premise has changed and this guard's placement should be re-derived",
    );

    await assert.rejects(
      () => guardedReset(async () => { spy.entered += 1; }, { log: () => {} }),
      /does not look disposable/,
      "the reset-target name check must refuse clara_631 even with both flags set",
    );
    // THE LOAD-BEARING ASSERTION: not that something threw, but that the thing that drops the
    // schema was never reached.
    assert.equal(spy.entered, 0, "reset() was ENTERED despite the refusal — the guard runs too late to protect anything");
  } finally {
    restoreEnv();
  }

  // And the positive read, against the real rig this process is connected to: the schema the
  // refused reset would have dropped is still on file.
  const r = await rootQuery("select 1 from pg_namespace where nspname = 'clara'");
  assert.equal(r.rows.length, 1, "schema clara is gone — the refusal did not actually prevent the drop");
});

test("#773 the allowlist ADMITS the *_ci / *_test shapes T19's passing path runs against, and refuses the rig names this wave lost", () => {
  for (const db of ["clara_ci", "clara_test", "clara_rt_test", "clara_w7_ci", "scratch", "clara-tmp", "clara.temp"]) {
    assert.equal(assertResetTargetDisposable(`127.0.0.1:5432/${db}`), db, `${db} must stay resettable`);
  }
  for (const db of ["clara_631", "clara_643", "clara", "clara_production_copy", "clara_citrus"]) {
    assert.throws(
      () => assertResetTargetDisposable(`127.0.0.1:5432/${db}`),
      /does not look disposable/,
      `${db} must be refused`,
    );
  }
  assert.equal(resolvedDatabaseName("127.0.0.1:5432/clara_ci"), "clara_ci");
  assert.equal(resolvedDatabaseName("no-slash-here"), "", "an unparseable label resolves to no database name, which is refused");
});

test("#773 the pattern is the guard module's own EPHEMERAL_DB, reused by import and never re-spelled", () => {
  assert.ok(EPHEMERAL_DB instanceof RegExp, "EPHEMERAL_DB is the exported pattern");
  const source = readFileSync(fileURLToPath(new URL("./rig-reset-guard.mjs", import.meta.url)), "utf8");
  assert.match(source, /import \{ EPHEMERAL_DB \} from "\.\.\/lib\/guard\.mjs"/, "the guard imports the pattern");
  // A SPELLING check, and labelled as one: it cannot prove semantics, only that no second copy
  // of the pattern was written here — which is the failure mode #773 names ("the pattern is not
  // re-spelled, copied, or widened in T19").
  assert.equal(source.match(/ephemeral\$?\/i/g), null, "the EPHEMERAL_DB pattern was copied into this module instead of imported");
});

test("#773 T19 routes its reset through the guard, and the shared guard module is untouched", () => {
  // Structural, and labelled as such: it reads T19's own source for the call site, because a
  // mutant that reverted T19 to a bare `reset()` would otherwise leave every behavioural cell
  // above green while the hole was reopened.
  const t19 = readFileSync(fileURLToPath(new URL("./rig-isolation.test.mjs", import.meta.url)), "utf8");
  assert.match(t19, /await guardedReset\(reset, \{ log: \(\) => \{\} \}\)/, "T19 must reset through guardedReset()");
  assert.equal(t19.match(/^\s*await reset\(/m), null, "T19 still calls reset() directly somewhere — the guard can be walked around");
  assert.match(t19, /CLARA_RIG_ALLOW_RESET !== "1"/, "T19 keeps its existing flag-unset skip gate");

  // The shared guard keeps EXACTLY the surface every other destructive caller depends on.
  const guard = readFileSync(fileURLToPath(new URL("../lib/guard.mjs", import.meta.url)), "utf8");
  assert.match(guard, /export const EPHEMERAL_DB = \/\(\^\|\[\._-\]\)\(ci\|test\|tmp\|temp\|scratch\|ephemeral\)\$\/i;/,
    "lib/guard.mjs's EPHEMERAL_DB pattern must be unchanged by this work");
  assert.match(guard, /export function targetIsEphemeral\(/, "targetIsEphemeral is untouched");
  assert.match(guard, /export function assertDestructiveAllowed\(/, "assertDestructiveAllowed is untouched");
});

test("#773 env buffer restored — PGDATABASE and both destructive flags are exactly what they were before the probes", () => {
  for (const k of ENV_KEYS) {
    assert.equal(process.env[k], ambient[k], `${k} must be back to its pre-probe value`);
  }
});
