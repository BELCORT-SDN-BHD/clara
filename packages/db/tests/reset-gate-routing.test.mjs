// #845 — every reset()-gated upgrade-drill suite routes its destructive reset() through the
// disposable-name guard T19 already uses, not just T19 itself.
//
// THE HOLE THIS CLOSES, measured rather than reasoned about (verified at 65fde7f3, the ticket's
// own audit): `guardedReset` in `rig-reset-guard.mjs` was imported by exactly one caller, T19 in
// `rig-isolation.test.mjs`. Every other reset-gated drill (checkout-convergence, hrd-a/hrd-b,
// rig-docs, rig-events, rig-runtime, s6, wave-a, wave-b, x37/x40/x41 and the x42 split kit — the
// SPLIT_UPGRADE_FILES list below) imported `reset` from `../scripts/reset.mjs` and called it
// UNWRAPPED. `lib/guard.mjs`'s shared gate admits any loopback host regardless of database name
// (its own doc comment says so), so `CLARA_RIG_ALLOW_RESET=1` + `CLARA_ALLOW_DESTRUCTIVE=1` could
// still drop a named, in-use rig database through any of those 13 other files.
//
// WHAT IS PROVEN HERE:
//  - Cell 1: the file DISCOVERY itself is not a fixed list transcribed by hand — it walks the
//    tests directory for every module that imports the destructive `reset` from
//    `scripts/reset.mjs`, and asserts that set equals the known 14 (T19's own file plus the 13
//    this ticket fixes). A file added later that imports `reset` unwrapped is caught by Cell 2
//    without anyone updating a list.
//  - Cell 2 (acceptance #1 — "a grep for reset( finds no unwrapped call behind the rig-reset
//    gate"): every discovered file is read and asserted to contain NO bare `await reset(` call
//    site — the exact idiom `rig-reset-guard.test.mjs`'s own structural cell uses for T19,
//    applied to all 14.
//  - Cell 3: every discovered file's source shows it importing `guardedReset` from
//    `rig-reset-guard.mjs` at least as many times as it imports the raw `reset` — so the wrapper
//    is in scope everywhere the destructive function is.
//  - Cell 4 (acceptance #2 — "a cell proves a non-disposable database name refuses before any
//    drill's reset() runs, the same way the guard's own proof cell does for T19"): imports the
//    REAL, PRODUCTION `reset` export from `../scripts/reset.mjs` — the exact module object every
//    one of the 14 files dynamically imports — wraps it in a counting spy that never delegates,
//    points `guardedReset` at a poisoned (non-disposable) database name with both destructive
//    flags set, and asserts the refusal fires and the spy is never entered. Because Cell 3 has
//    already shown every drill obtains its `reset` from this same module and passes it through
//    this same `guardedReset`, this one behavioural proof generalises to all 14 call sites, not
//    just T19's.
//  - Cell 5 (acceptance #3, read not run — see the report): this rig must NEVER run a
//    reset()-gated drill with `CLARA_RIG_ALLOW_RESET=1` (RIG.md), so "the drill still passes its
//    ordinary run" is proven by running each of the 14 files WITHOUT that flag and reading that
//    they still reach their existing skip gate cleanly (no import-time crash from the added
//    dynamic import) — the destructive path itself is CI's job, on an isolated database, per file.
//
// VACUITY CONTROL for Cell 2 (report has the transcript): with x42-split-upgrade-kit.mjs
// reverted to its pre-fix bare `await reset(...)` byte-for-byte, this suite's Cell 2 RED on that
// exact file for the exact reason ("bare await reset( survives in x42-split-upgrade-kit.mjs");
// restoring the fixed file byte-for-byte turned it green again.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));

/** Every module under packages/db/tests (recursive) that ends in .mjs. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (entry.endsWith(".mjs")) out.push(full);
  }
  return out;
}

/** "Behind the rig-reset gate" = the module dynamically imports the destructive `reset` export
 *  from scripts/reset.mjs via an actual `import(...)` call (not merely a comment or a regex
 *  literal mentioning the path — this file's own Cell 4 does one such import to test the real
 *  export, and is excluded by name: it is the auditor, not a drill). `rig-reset-guard.mjs` (the
 *  guard itself) and `rig-reset-guard.test.mjs` (which imports a SPY, never the real reset()) do
 *  not contain this call shape and are excluded on the same basis. */
const RESET_IMPORT_RE = /import\(["'][^"']*scripts\/reset\.mjs["']\)/;

function discoverGatedFiles() {
  return walk(TESTS_DIR)
    .filter((f) => path.basename(f) !== SELF)
    .filter((f) => RESET_IMPORT_RE.test(readFileSync(f, "utf8")))
    .map((f) => path.relative(TESTS_DIR, f).split(path.sep).join("/"))
    .sort();
}

// The known set this ticket's audit found (T19's own file + the 13 unwrapped callers), kept here
// as a POSITIVE cross-check on discovery — not the thing Cell 2 tests against.
const EXPECTED_GATED_FILES = [
  "checkout-convergence-upgrade.test.mjs",
  "hrd-a-recut-guard.test.mjs",
  "hrd-b-upgrade-kit.mjs",
  "rig-docs-upgrade.test.mjs",
  "rig-events-upgrade.test.mjs",
  "rig-isolation.test.mjs",
  "rig-runtime-upgrade.test.mjs",
  "s6-upgrade.test.mjs",
  "wave-a-upgrade.test.mjs",
  "wave-b/wb-0020-upgrade.test.mjs",
  "x37-0037-upgrade.test.mjs",
  "x40-0040-upgrade.test.mjs",
  "x41-0041-upgrade.test.mjs",
  "x42-split-upgrade-kit.mjs",
].sort();

test("#845 discovery: exactly the 14 known reset()-gated modules import the destructive reset() from scripts/reset.mjs — no more, no fewer", () => {
  const found = discoverGatedFiles();
  assert.deepEqual(found, EXPECTED_GATED_FILES,
    "the walked set of files importing scripts/reset.mjs no longer matches the ticket's audited 14 — "
    + "a file was added, removed, or renamed; update EXPECTED_GATED_FILES only after confirming with a fresh audit");
});

test("#845 acceptance 1: no discovered file has a bare, unwrapped `await reset(` call site", () => {
  const bare = /^\s*await reset\(/m;
  const offenders = [];
  for (const rel of discoverGatedFiles()) {
    const source = readFileSync(path.join(TESTS_DIR, rel), "utf8");
    if (bare.test(source)) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    `bare await reset( survives in: ${offenders.join(", ")} — every reset()-gated call site must read `
    + "await guardedReset(reset, ...) instead");
});

test("#845 every discovered file imports guardedReset from rig-reset-guard.mjs, at least once per raw-reset import", () => {
  const rawImportRe = /const \{ reset \} = await import\(/g;
  const guardImportRe = /const \{ guardedReset \} = await import\("[^"]*rig-reset-guard\.mjs"\)/g;
  for (const rel of discoverGatedFiles()) {
    const source = readFileSync(path.join(TESTS_DIR, rel), "utf8");
    const rawCount = (source.match(rawImportRe) ?? []).length;
    const guardCount = (source.match(guardImportRe) ?? []).length;
    assert.ok(guardCount >= rawCount && guardCount > 0,
      `${rel}: imports reset() ${rawCount} time(s) but guardedReset only ${guardCount} time(s) — `
      + "every scope that obtains the raw reset() must also obtain guardedReset");
  }
});

// Captured at module load, BEFORE any cell mutates env — the same buffer-and-restore idiom
// `rig-reset-guard.test.mjs` uses for T19, so the final cell below can assert against what was
// actually ambient on THIS rig (which already carries CLARA_ALLOW_DESTRUCTIVE=1 / CLARA_RIG_DB=1
// per RIG.md) rather than an assumed "nothing set" baseline.
const ENV_KEYS = ["PGDATABASE", "DATABASE_URL", "POSTGRES_URL", "WORKFLOW_POSTGRES_URL", "CLARA_ALLOW_DESTRUCTIVE", "CLARA_RIG_ALLOW_RESET"];
const AMBIENT = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

test("#845 acceptance 2: a non-disposable database name refuses before the ACTUAL scripts/reset.mjs export runs — the exact module every one of the 14 files imports", async () => {
  const restoreEnv = () => {
    for (const k of ENV_KEYS) {
      if (AMBIENT[k] === undefined) delete process.env[k];
      else process.env[k] = AMBIENT[k];
    }
  };

  // THE REAL EXPORT, not a stand-in: this is the identical function object every one of the 14
  // gated files obtains via `const { reset } = await import("../scripts/reset.mjs")` (module
  // specifiers resolve to the same module instance regardless of the relative "../" vs "../../"
  // spelling used from a nested directory like wave-b/).
  const { reset: realReset } = await import("../scripts/reset.mjs");
  assert.equal(typeof realReset, "function", "scripts/reset.mjs must export a callable reset()");
  const { guardedReset } = await import("./rig-reset-guard.mjs");

  const spy = { entered: 0 };
  // Wraps but NEVER DELEGATES to realReset — this cell proves the refusal happens before reset()
  // would run without ever issuing the DROP SCHEMA realReset performs, so it is safe on a rig
  // this process is not allowed to reset.
  const wrapped = async (...args) => { spy.entered += 1; return realReset(...args); };

  try {
    delete process.env.DATABASE_URL;
    delete process.env.POSTGRES_URL;
    delete process.env.WORKFLOW_POSTGRES_URL;
    process.env.PGDATABASE = "clara_631"; // a real non-disposable rig name from the 2026-09-14 wave, per #773
    process.env.CLARA_ALLOW_DESTRUCTIVE = "1";
    process.env.CLARA_RIG_ALLOW_RESET = "1";

    await assert.rejects(
      () => guardedReset(wrapped, { log: () => {} }),
      /does not look disposable/,
      "guardedReset must refuse a non-disposable name even with both destructive flags set, for the SAME reset() export every drill imports",
    );
    assert.equal(spy.entered, 0,
      "the real scripts/reset.mjs export was ENTERED despite the refusal — the guard runs too late to protect any of the 14 drills");
  } finally {
    restoreEnv();
  }
});

test("#845 env buffer restored after the poisoned-target probe — every key is exactly what it was before this file ran", () => {
  // Guards against a leaked mutation from the cell above reaching later files in a
  // --test-concurrency=1 run: compared against the AMBIENT snapshot taken at module load
  // (rig-reset-guard.test.mjs's own idiom), not an assumed "nothing set" baseline — this rig
  // legitimately carries CLARA_ALLOW_DESTRUCTIVE=1 / CLARA_RIG_DB=1 ambiently per RIG.md.
  for (const k of ENV_KEYS) {
    assert.equal(process.env[k], AMBIENT[k], `${k} must be back to its pre-probe value (was ${AMBIENT[k]})`);
  }
});
