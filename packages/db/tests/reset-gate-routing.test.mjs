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
//    `scripts/reset.mjs`, either dynamically or via a static `import … from` (code review
//    L03-CRS2 widened this from dynamic-only), and asserts that set is a SUPERSET of the known 14
//    (T19's own file plus the 13 this ticket fixes) — a missing known file fails, an extra file is
//    only reported (code review L03-CRS4: an exact match would go red for a correctly-wrapped
//    FUTURE file, a false red in the ordinary db battery). A file added later that imports `reset`
//    unwrapped is caught by Cell 2 without anyone updating a list.
//  - Cell 2 (acceptance #1 — "a grep for reset( finds no unwrapped call behind the rig-reset
//    gate"): every discovered file has its comments and string/template literals blanked out,
//    then is asserted to contain NO `reset(` call token — not only the `await reset(` spelling,
//    so `const r = await reset(...)`, `return reset(...)` and an extra space before the paren are
//    all caught too, the criterion's own shape rather than one hand-picked idiom.
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
//    ordinary run" is proven ONLY as "no import-time crash" by running each of the 14 files
//    WITHOUT that flag and reading that they still reach their existing skip gate cleanly — a skip
//    is not the drill's ordinary run, and 3 of the 14 have no CI leg anywhere to run the real thing
//    (code review L03-CRS3); the fix-round report states this criterion PARTIAL, not done.
//
// VACUITY CONTROL for Cell 2 (fix-round report has the transcript): with x42-split-upgrade-kit.mjs
// reverted to its pre-fix bare `await reset(...)` byte-for-byte, this suite's Cell 2 RED on that
// exact file for the exact reason ("an unwrapped reset( call site survives in
// x42-split-upgrade-kit.mjs"); restoring the fixed file byte-for-byte turned it green again. Also
// re-run with that same call site rewritten three adversarial ways — `const r = await reset(...)`,
// `return reset(...)`, and an extra space before the paren (the exact three shapes the fix-round
// review demonstrated walked past the file's original `^\s*await reset\(` predicate) — each RED
// for the same reason, then restored.
//
// VACUITY CONTROL for the code-review fix round (L03-CRS2/L03-CRS4, transcript in
// wave1-lane03-codereview-fix.md): a temporary probe module with a STATIC `import { reset } from
// "../scripts/reset.mjs"` and a bare `await reset(...)` call turned Cell 2 RED for the exact
// reason once discovery was widened (it stayed invisible and the suite stayed 5/5 green before the
// fix); a second temporary probe, a CORRECTLY wrapped future file, turned the pre-fix exact-match
// Cell 1 RED for the exact reason ("a file was added...") and the post-fix superset Cell 1 GREEN
// (reported, not failed). Both probes were deleted immediately after and never committed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { EPHEMERAL_DB } from "../lib/guard.mjs";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const SELF = path.basename(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(TESTS_DIR, "..", "..", "..");

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

/** "Behind the rig-reset gate" = the module imports the destructive `reset` export from
 *  scripts/reset.mjs, either dynamically (`await import("…/scripts/reset.mjs")`, every one of the
 *  14 audited files' own spelling) or via a static `import … from "…/scripts/reset.mjs"` (code
 *  review L03-CRS2 — the dynamic-only spelling this cell shipped with let a static-import caller
 *  with a bare `reset()` call keep the whole suite green; measured with a temporary probe module,
 *  see the fix-round report). Excludes a mere comment or a regex literal mentioning the path —
 *  this file's own Cell 4 does one dynamic import to test the real export, and is excluded by
 *  name: it is the auditor, not a drill. `rig-reset-guard.mjs` (the guard itself) and
 *  `rig-reset-guard.test.mjs` (which imports a SPY, never the real reset()) do not contain this
 *  call shape and are excluded on the same basis. */
const RESET_IMPORT_RE = /(?:import\(|(?:^|\s)from\s+)["'][^"']*scripts\/reset\.mjs["']/;

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

// SUPERSET check (code review L03-CRS4), not an exact match: this cell runs in the ordinary db
// battery (packages/db/package.json's "tests/**/*.test.mjs" glob), so an exact `deepEqual` here
// went RED for a future file that adds itself to the gate CORRECTLY on day one — a false red a
// later lane could misread as its own regression. Only a MISSING file (one of the audited 14 that
// stopped importing scripts/reset.mjs) is a hard failure; an EXTRA file is reported, not failed —
// the hard bar for an extra file's own call sites is cell 2 below, which needs no list at all.
test("#845 discovery: at least the 14 known reset()-gated modules import the destructive reset() from scripts/reset.mjs; a file beyond that set is reported, not failed", () => {
  const found = discoverGatedFiles();
  const missing = EXPECTED_GATED_FILES.filter((f) => !found.includes(f));
  assert.deepEqual(missing, [],
    "a previously-audited reset()-gated file no longer imports scripts/reset.mjs — confirm it still "
    + "routes through guardedReset (or was legitimately removed) before shrinking EXPECTED_GATED_FILES");
  const extra = found.filter((f) => !EXPECTED_GATED_FILES.includes(f));
  if (extra.length > 0) {
    console.log(`#845 discovery: ${extra.length} reset()-gated file(s) beyond the audited 14 (cell `
      + `2 below already enforces no-unwrapped-call( on them; add to EXPECTED_GATED_FILES when `
      + `convenient): ${extra.join(", ")}`);
  }
});

/** Best-effort comment/string stripper for this file set: block comments, then line comments,
 *  then string and template literal BODIES are blanked out (their delimiters stay, so an
 *  adjacent real call is never merged into one token). Good enough here, not a general JS
 *  parser: verified against all 14 discovered files, none of which puts `//` or `://` inside a
 *  string literal (checked by hand at review time) — a file that ever did would need this
 *  hardened, not the criterion loosened. */
function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/`(?:\\.|[^`\\])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

// Any `reset(` call token, in actual code (comments and string literals already blanked out
// above), that is not part of a longer identifier (so `guardedReset(` — different case, "Reset"
// not "reset" — and any future `xReset(`/`reset2(` never match) and is not the bare
// `{ reset }`/`{ reset: alias }` import destructure (which has no `(` immediately after `reset`
// at all). This is the criterion's own shape — "a grep for reset( finds no unwrapped call" — not
// the narrower `^\s*await reset\(` this cell shipped with, which a `const r = await reset(...)`,
// a `return reset(...)`, or an extra space before the paren all walked straight past.
const UNWRAPPED_RESET_CALL_RE = /(?<![A-Za-z0-9_$.])reset\s*\(/;

test("#845 acceptance 1: no discovered file has an unwrapped `reset(` call site behind the rig-reset gate", () => {
  const offenders = [];
  for (const rel of discoverGatedFiles()) {
    const source = readFileSync(path.join(TESTS_DIR, rel), "utf8");
    if (UNWRAPPED_RESET_CALL_RE.test(stripCommentsAndStrings(source))) offenders.push(rel);
  }
  assert.deepEqual(offenders, [],
    `an unwrapped reset( call site survives in: ${offenders.join(", ")} — every reset()-gated call site must read `
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
  // this process is not allowed to reset. `realReset` is fetched above only to prove it is a real,
  // callable export from the exact module every one of the 14 files imports (see the assert.equal
  // just above) — it is deliberately never invoked from here, the same shape
  // rig-reset-guard.test.mjs's own spy uses for T19.
  const wrapped = async () => { spy.entered += 1; };

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

// #1023 — the CI-coverage gap #845's own comment above named plainly: "checkout-convergence-
// upgrade.test.mjs, rig-runtime-upgrade.test.mjs and wave-a-upgrade.test.mjs have no CI leg at
// all — their destructive path has never run anywhere but a worker's own machine, by hand". Each
// entry pairs a drill with the PGDATABASE name ITS OWN header comment already documents
// (checkout-convergence-upgrade.test.mjs:16, rig-runtime-upgrade.test.mjs:9,
// wave-a-upgrade.test.mjs:8) — the CI step must target the SAME name a worker running the file by
// hand would, not an invented one, so the two recipes are provably the same drill.
const CLOSED_WAVE_ACTION = path.join(REPO_ROOT, ".github", "actions", "closed-wave-upgrade-drills", "action.yml");

const NEWLY_COVERED = [
  { file: "checkout-convergence-upgrade.test.mjs", db: "clara_0186_upgrade_ci" },
];

/** The composite-action step (its `- name:` line through the next step's, or EOF) whose `run:`
 *  block invokes `tests/<file>` — the same step-splitting shape a human reading the YAML uses,
 *  never a full-file search that could match a comment or an unrelated step. Step boundaries in
 *  this file are always a 4-space-indented `- name:` (verified against the file's own steps). */
function stepInvoking(yamlText, file) {
  return yamlText
    .split(/\n(?=    - name:)/)
    .find((step) => step.includes(`tests/${file}`));
}

for (const { file, db } of NEWLY_COVERED) {
  test(`#1023 CI coverage: ${file} has a closed-wave-upgrade-drills step that runs its destructive path on a disposable database`, () => {
    const yamlText = readFileSync(CLOSED_WAVE_ACTION, "utf8");
    const step = stepInvoking(yamlText, file);
    assert.ok(step, `no step in .github/actions/closed-wave-upgrade-drills/action.yml invokes tests/${file} — `
      + "packages/db/tests/README.md's #845 section says this file has no CI leg; #1023 closes that gap");
    assert.match(step, /CLARA_RIG_ALLOW_RESET=1/,
      `${file}'s CI step must set CLARA_RIG_ALLOW_RESET=1 — the flag its own header recipe documents, without which it only skips`);
    assert.match(step, /CLARA_ALLOW_DESTRUCTIVE=1/,
      `${file}'s CI step must set CLARA_ALLOW_DESTRUCTIVE=1 — lib/guard.mjs's assertDestructiveAllowed requires it before reset() may run at all`);
    // Not the FIRST `PGDATABASE=` in the step — that one is `PGDATABASE=postgres` on the `create
    // database` line, the same admin connection every drill in this file provisions from. The
    // drill's own target is the `PGDATABASE=` immediately followed by `CLARA_RIG_ALLOW_RESET=1` on
    // the same line, the invocation line's own shape.
    const dbMatch = step.match(/PGDATABASE=(\S+)\s+CLARA_RIG_ALLOW_RESET=1/);
    assert.ok(dbMatch, `${file}'s CI step must create and target its own PGDATABASE, like every other drill in this action`);
    assert.equal(dbMatch[1], db,
      `${file}'s CI step should target ${db} — the exact name the file's own header recipe documents, so a worker running it by hand and CI running it exercise the identical target`);
    assert.match(dbMatch[1], EPHEMERAL_DB,
      `${dbMatch[1]} does not look disposable to the SAME guard rig-reset-guard.mjs's guardedReset enforces (imported here from lib/guard.mjs, never re-spelled) — `
      + "a CI leg whose own database name the guard itself would refuse proves nothing about the destructive path running safely");
    assert.match(yamlText, new RegExp(`rig-cluster-reset\\.mjs --drop-database=${db} --sweep-roles`),
      `no cluster-cleanup step drops ${db} — every closed-wave-upgrade-drills step must clean up its own throwaway database and any roles its chain minted (review-518 D1/D2), the same as the 11 drills already in this file`);
  });
}
