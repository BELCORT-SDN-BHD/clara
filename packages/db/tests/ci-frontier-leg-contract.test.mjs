// #1041 — the db-slice-frontiers leg replays this package's CURRENT tests against a chain that
// stops at 0042/0043/0044/0045, and it must do so with the same PREINTEGRATION GATES the package's
// own `test` script preloads.
//
// THE DEFECT THIS CLOSES, measured (dispatch run 35893727271). `.github/actions/frontier-leg`
// ran the slice lists with a bare `node --test`, so every cell whose premise migration sits
// ABOVE the frontier on disk failed loudly instead of skipping — which is exactly what the
// estate's own gate modules exist to prevent, and what #927's refusal message already tells the
// reader to do:
//
//     #927 premise 0282_retire_adjustment_template_doors.sql is not applied … this is a FOCUSED
//     run and must fail loudly, not skip. Preload
//     ./tests/adjustment-template-doors-retired-preintegration-gate.mjs for an estate sweep
//     against a pre-#927 chain.
//
// A frontier leg IS an estate sweep against a pre-#927 chain. Four d-b2 cells and one d-b0 cell
// died on that sentence.
//
// THE CHAIN HAS ONE SOURCE OF TRUTH — `packages/db/package.json`'s `test` script — and the leg
// now reads it through `scripts/print-gate-chain.mjs` rather than carrying a second copy that
// would rot the first time a migration ships a gate. Cell A holds that script to DISK, which is
// independent of the script and of package.json both.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const DB_PKG = path.join(TESTS_DIR, "..");
const REPO_ROOT = path.join(DB_PKG, "..", "..");
const FRONTIER_ACTION = path.join(REPO_ROOT, ".github", "actions", "frontier-leg", "action.yml");
const TOTAL_ACTION = path.join(REPO_ROOT, ".github", "actions", "partition-total", "action.yml");

test("p1041.gates.script scripts/print-gate-chain.mjs prints exactly the preintegration gates that are ON DISK, one --import each", () => {
  const printed = execFileSync(process.execPath, [path.join(DB_PKG, "scripts", "print-gate-chain.mjs")],
    { cwd: DB_PKG, encoding: "utf8" }).trim();
  const flags = printed.split(/\s+/).filter(Boolean);
  assert.equal(flags.length % 2, 0, `the script must print "--import <file>" pairs, got: ${printed.slice(0, 120)}`);
  const named = [];
  for (let i = 0; i < flags.length; i += 2) {
    assert.equal(flags[i], "--import", `every flag pair starts with --import (pair ${i / 2} is ${flags[i]})`);
    named.push(flags[i + 1].replace(/^\.\/tests\//, ""));
  }
  const onDisk = readdirSync(TESTS_DIR).filter((f) => f.endsWith("-preintegration-gate.mjs")).sort();
  assert.deepEqual([...named].sort(), onDisk,
    "the printed chain and the gate modules on disk are not the same set — a gate that ships without joining "
    + "packages/db/package.json's test script is a gate no sweep preloads, and a chain entry with no file "
    + "kills every run that preloads it");
  assert.equal(new Set(named).size, named.length, "a gate is printed twice");
});

test("p1041.gates.action every node --test the frontier leg runs preloads that chain, and the leg derives it rather than carrying a copy", () => {
  const yaml = readFileSync(FRONTIER_ACTION, "utf8");
  assert.match(yaml, /node scripts\/print-gate-chain\.mjs/,
    "the frontier leg must DERIVE its preload chain from packages/db's own test script — a second copy of "
    + "the 106 flags in this YAML rots the first time a migration ships a gate");
  const invocations = yaml.split("\n").filter((l) => l.includes("node --test"));
  assert.ok(invocations.length >= 3,
    `the leg runs the slice list, the contract roster and the slice's own drill — found ${invocations.length} node --test lines`);
  for (const line of invocations) {
    assert.match(line, /\$GATES/,
      `a node --test in .github/actions/frontier-leg runs with NO preintegration gates: ${line.trim()} — `
      + "every cell whose premise migration is above the frontier on disk then fails loudly instead of "
      + "skipping, which is what killed d-b2 on dispatch 35893727271");
  }
});

// THE CELL FLOOR, AND WHY IT COUNTS CELLS RATHER THAN PASSES [#1041].
//
// The totality gate (`.github/actions/partition-total`) is FILE-granular, so each slice list
// declares a floor the leg enforces: that is the only thing standing between a cell DELETED
// inside a still-listed file and a green leg. It compared PASSES, which conflated two different
// questions — "is the cell still there" and "does it still assert here" — and only the first is
// a deletion. Once the gates above are preloaded, a cell whose premise migration is above the
// frontier SKIPS, lawfully, and a pass-floor reads that as a deleted cell.
//
// The floor is therefore the number of CELLS the list RUNS (pass + skip, and `fail = 0` is
// asserted on its own line), and the skip side gets its own bound: `#!skips-max:`. Both numbers
// were MEASURED at each slice's own frontier on the lane-07 cluster, 2026-09-24, with the gate
// chain preloaded and `--test-concurrency=1`. Every floor went UP against the pass-floor it
// replaces (149→153, 76→82, 168→169, 70→74) — nothing was lowered to go green — and the skip
// bound is new coverage: a cell that silently stops asserting now breaches it.

test("p1041.floor.declared every slice list declares BOTH halves of the floor, as integers", () => {
  const dir = path.join(TESTS_DIR, "split-lists");
  const lists = readdirSync(dir).filter((f) => /^test-list-d-b\d\.txt$/.test(f)).sort();
  assert.equal(lists.length, 4, `the Wave D-b split has four slice lists, found ${lists.length}`);
  for (const f of lists) {
    const text = readFileSync(path.join(dir, f), "utf8");
    const floor = /^#!cells-floor:\s*(\d+)\s*$/m.exec(text);
    const skips = /^#!skips-max:\s*(\d+)\s*$/m.exec(text);
    assert.ok(floor, `${f} declares no '#!cells-floor:' — the file-granular totality gate cannot see a deleted cell`);
    assert.ok(skips, `${f} declares no '#!skips-max:' — without it a cell that silently stops asserting looks like a lawful frontier skip`);
    assert.ok(Number(skips[1]) < Number(floor[1]),
      `${f} allows ${skips[1]} skips out of a ${floor[1]}-cell floor — a bound that admits the whole list bounds nothing`);
  }
});

test("p1041.floor.action the frontier leg reads both halves and counts SKIPPED cells, not only passing ones", () => {
  const yaml = readFileSync(FRONTIER_ACTION, "utf8");
  assert.match(yaml, /#!cells-floor:/, "the leg must read the declared cell floor");
  assert.match(yaml, /#!skips-max:/,
    "the leg must read the declared skip bound — a pass-only floor reads a lawfully gated cell as a deleted one, "
    + "which is what a preloaded gate chain produces at a frontier");
  assert.match(yaml, /# skipped /,
    "the leg must read the run's OWN skipped count off the TAP summary to compare either of them");
});

// THE TWO STEPS THE FLOOR DID NOT REACH [#1041, review SPEC-1041-B].
//
// The gate chain above is preloaded into THREE `node --test` invocations, and only the first —
// the slice list — carried a floor and a skip bound. The other two ran on nothing but `fail = 0`
// (the roster) and node's own exit code (the isolated drill), so a gate module that stood one of
// their cells down would have made them green with less measured: exactly the silent rot the
// floor exists to close, in the two steps the gates newly reach.
//
// WHERE EACH BOUND IS DECLARED. Never in the file it bounds — a floor a deletion can edit in the
// same hunk bounds nothing. The roster's own file carries its floor, and each slice list carries
// its drill's, which is the slice's own declaration file and is already the thing
// `partition-total` holds every slice to.
//
// THE ROSTER'S SKIP BOUND IS PER-FRONTIER, and that is the whole point: a contract's arms go live
// as the frontier rises, so ONE number would be the lowest frontier's and would bound nothing at
// the other three. MEASURED on the lane-07 cluster, 2026-09-24, one throwaway database per
// frontier (0001..0042/0043/0044/0045, gate chain preloaded, --test-concurrency=1):
//   d-b0 (0042): 12 cells · 4 pass · 8 skip      d-b3 (0044): 12 cells · 8 pass · 4 skip
//   d-b1 (0043): 12 cells · 6 pass · 6 skip      d-b2 (0045): 12 cells · 8 pass · 4 skip
// Twelve cells at EVERY frontier — which is why a cell FLOOR is one number while the skip bound
// is four. (The roster's own header used to say a floor "would be a lie at three frontiers out of
// four": true of the PASS count it was written about, and the same conflation #1041 took out of
// the slice lists.)

const SLICES = ["d-b0", "d-b1", "d-b3", "d-b2"];

test("p1041.roster.floor the cross-slice contract roster declares a cell floor and its own PER-FRONTIER skip bound", () => {
  const text = readFileSync(path.join(TESTS_DIR, "split-lists", "test-list-contracts.txt"), "utf8");
  const floor = /^#!cells-floor:\s*(\d+)\s*$/m.exec(text);
  assert.ok(floor, "test-list-contracts.txt declares no '#!cells-floor:' — the roster step asserted only fail=0, so "
    + "a contract cell that a preloaded gate stands down left the step green with less measured");
  for (const slice of SLICES) {
    const bound = new RegExp(String.raw`^#!skips-max-${slice}:\s*(\d+)\s*$`, "m").exec(text);
    assert.ok(bound, `test-list-contracts.txt declares no '#!skips-max-${slice}:' — every frontier leg runs this `
      + "roster, so every frontier needs its own measured bound");
    assert.ok(Number(bound[1]) < Number(floor[1]),
      `the ${slice} bound admits ${bound[1]} of a ${floor[1]}-cell floor — a bound that admits the whole roster bounds nothing`);
  }
});

/** One step's own `run:` block, cut out of the composite action by the step's `- name:` line, so a
 *  cell about the ROSTER step cannot be satisfied by what the SLICE LIST step does. */
function stepBlock(yaml, nameFragment) {
  const start = yaml.indexOf(`- name: ${nameFragment}`);
  assert.ok(start > 0, `.github/actions/frontier-leg has no step named ${nameFragment}`);
  const next = yaml.indexOf("\n    - name: ", start + 1);
  return yaml.slice(start, next === -1 ? yaml.length : next);
}

test("p1041.roster.action the roster step enforces its OWN floor, its own slice's skip bound and fail=0", () => {
  const yaml = readFileSync(FRONTIER_ACTION, "utf8");
  const step = stepBlock(yaml, "Run the cross-slice contract roster");
  assert.match(step, /#!cells-floor:/,
    "the roster step runs the whole roster with the gate chain preloaded and asserted only fail=0 — a cell a gate "
    + "stands down was invisible to it");
  assert.match(step, /#!skips-max-\$\{\{ inputs\.slice \}\}:/,
    "the roster's skip bound is PER-FRONTIER, so the step must read the bound for ITS OWN slice, not a shared one");
  assert.match(step, /# skipped /, "…which it can only compare against the run's own skipped count");
  assert.match(step, /CELL FLOOR BREACHED|SKIP BOUND BREACHED/, "and it must refuse by name when either bound is breached");
});

// THE ISOLATED DRILL'S OWN BOUND [#1041, review SPEC-1041-B]. Step (4) runs the slice's deploy
// drill ALONE, in its own throwaway database, with the reset gate GRANTED — and asserted nothing
// beyond node's exit code. The drill is excluded from the file-granular totality gate by design
// (`partition-total`: "each runs ALONE in the frontier job, never in a list"), so a deleted drill
// cell was invisible to every gate this repo has, and since #1041 the step also preloads the gate
// chain, which can stand a cell DOWN rather than red.
//
// THE BOUND LIVES IN THE SLICE'S LIST, not in the drill: a floor a deletion can edit in the same
// hunk bounds nothing. MEASURED on the lane-07 cluster, 2026-09-24, each drill run at its own
// frontier with the gate chain preloaded and the reset gate WITHHELD — which is the state in which
// every cell reports and skips, so the run's own `# tests` line is the cell count:
//   x42-0042-b0-upgrade: 3 cells      x42-0044-b3-upgrade: 2 cells
//   x42-0043-b1-upgrade: 1 cell       x42-0045-b2-upgrade: 1 cell
// `#!drill-skips-max:` is 0 for all four, and that is not a guess: the ONLY skip any of these four
// files carries is `skipUnlessReset` (x42-split-upgrade-kit.mjs — the census below holds them to
// it), and step (4) is the one place that gate is granted. A drill cell that skips THERE is a cell
// that stopped asserting.

const DRILL_FLOORS = { "d-b0": 3, "d-b1": 1, "d-b3": 2, "d-b2": 1 };

test("p1041.drill.floor every slice list declares its drill's cell floor and skip bound, and the floor is the drill's own cell count", () => {
  const dir = path.join(TESTS_DIR, "split-lists");
  for (const slice of SLICES) {
    const text = readFileSync(path.join(dir, `test-list-${slice}.txt`), "utf8");
    const floor = /^#!drill-cells-floor:\s*(\d+)\s*$/m.exec(text);
    const skips = /^#!drill-skips-max:\s*(\d+)\s*$/m.exec(text);
    assert.ok(floor, `test-list-${slice}.txt declares no '#!drill-cells-floor:' — the isolated drill step asserted `
      + "nothing but an exit code, and no other gate in this repo can see a cell deleted inside a drill");
    assert.ok(skips, `test-list-${slice}.txt declares no '#!drill-skips-max:'`);
    // The drill is found the way the leg finds it: by dbtag, number-agnostic (a merge-time renumber
    // renames the file).
    const dbtag = slice.replace(/^d-/, "");
    const drills = readdirSync(TESTS_DIR)
      .filter((f) => new RegExp(String.raw`^x42-\d{4}-${dbtag}-upgrade\.test\.mjs$`).test(f));
    assert.equal(drills.length, 1, `the ${slice} slice must have exactly one upgrade drill on disk, found ${drills.length}`);
    const cells = (readFileSync(path.join(TESTS_DIR, drills[0]), "utf8").match(/^test\(/gm) ?? []).length;
    assert.equal(Number(floor[1]), cells,
      `test-list-${slice}.txt declares a drill floor of ${floor[1]} while ${drills[0]} carries ${cells} cell(s) — `
      + "the floor is declared in the LIST precisely so a deleted cell breaches it; raise it in the same PR that adds one");
    assert.equal(Number(floor[1]), DRILL_FLOORS[slice], `${slice}'s drill floor moved away from the measured ${DRILL_FLOORS[slice]}`);
  }
});

test("p1041.drill.only-skip the only cell-standing-down in any upgrade drill is the reset gate the isolated step grants", () => {
  const drills = readdirSync(TESTS_DIR).filter((f) => /^x42-\d{4}-b\d-upgrade\.test\.mjs$/.test(f));
  assert.equal(drills.length, 4, `the Wave D-b split has four deploy drills, found ${drills.length}`);
  for (const f of drills) {
    const src = readFileSync(path.join(TESTS_DIR, f), "utf8");
    const skipSites = (src.match(/\bt\.skip\(|\bskip:\s|\bskipUnlessReset\(/g) ?? []);
    assert.ok(skipSites.length > 0, `${f} has no skip at all — it must still stand down in the concurrent sweep`);
    for (const site of skipSites) {
      assert.match(site, /skipUnlessReset\(/,
        `${f} stands a cell down by something other than skipUnlessReset (${site.trim()}) — step (4) declares `
        + "'#!drill-skips-max: 0' on the strength of that being the only one, so a new skip needs a measured bound");
    }
  }
});

test("p1041.drill.action the isolated drill step reads that bound and refuses a run that meets neither half", () => {
  const yaml = readFileSync(FRONTIER_ACTION, "utf8");
  const step = stepBlock(yaml, "${{ inputs.slice }} upgrade drill (isolated DB)");
  assert.match(step, /#!drill-cells-floor:/, "the drill step must read its slice's declared drill floor");
  assert.match(step, /#!drill-skips-max:/, "…and its declared skip bound");
  assert.match(step, /# skipped /, "…which it can only compare against the run's own TAP summary");
  assert.match(step, /DRILL FLOOR BREACHED|DRILL SKIP BOUND BREACHED/, "and refuse by name when either is breached");
  assert.match(step, /set -o pipefail/,
    "the drill's output is piped to tee to be read, so the step must fail on the RUN's status, not tee's");
});

// EVERY DECLARATION IS ALSO CHECKED ON THE PR ITSELF [#1041, review SPEC-1041-B]. The frontier legs
// are dispatch-only; `partition-total` runs on every PR that touches the database. It already
// refuses a slice list that declares no cell floor and no skip bound, for that reason. The three
// declarations added for the roster and the drills join it there, so a missing one is caught by the
// gate that actually runs, days before anyone dispatches the legs.

test("p1041.total.declared the PR-time totality gate refuses a missing declaration, roster and drill included", () => {
  const yaml = readFileSync(TOTAL_ACTION, "utf8");
  for (const directive of ["#!cells-floor:", "#!skips-max:", "#!drill-cells-floor:", "#!drill-skips-max:", "#!skips-max-"]) {
    assert.ok(yaml.includes(directive),
      `.github/actions/partition-total does not check for '${directive}' — the frontier legs are dispatch-only, `
      + "so a declaration missing from a list or from the roster would not be noticed until someone dispatched them");
  }
});

// #1126 — a DECLARED floor is a number someone typed into a comment; nothing on this branch
// checked it against a MEASURED source of truth, so a corpus retarget or a census widening could
// move the true cell count without moving the declared one, and the `-ge` floor check in
// `.github/actions/frontier-leg` (never `=`) stays satisfied either way. That happened twice,
// unnoticed for a stretch, per this ticket's own Agent Brief (follow-up 2 of
// wave4-lane07-ticket1041.md, originating ticket #1041).
//
// THE MEASURED SOURCE OF TRUTH IS ALREADY ESTABLISHED, by `p1041.drill.floor` above: every file in
// this corpus is a FLAT battery of top-level `test(...)` calls (no file nests a subtest inside
// another), so `#!drill-cells-floor:` already equals a static count of `^test\(` lines in the
// drill file it bounds, no database and no test run required. The SAME re-derivation, summed
// across a whole list's files rather than one drill file, is exactly what the Agent Brief asks
// for ("the same way the gate chain is already derived rather than hand-copied" — `#!cells-floor:`
// is now derived the same way `scripts/print-gate-chain.mjs` derives the gate chain: from what is
// literally on disk, not from a number someone typed and never rechecked).

function listedFiles(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));
}

function staticCellCount(file) {
  return (readFileSync(path.join(TESTS_DIR, file), "utf8").match(/^test\(/gm) ?? []).length;
}

test("p1126.floor.corpus each slice list's declared #!cells-floor: equals the static test( count summed across its own listed files", () => {
  for (const slice of SLICES) {
    const listPath = path.join(TESTS_DIR, "split-lists", `test-list-${slice}.txt`);
    const text = readFileSync(listPath, "utf8");
    const floor = /^#!cells-floor:\s*(\d+)\s*$/m.exec(text);
    assert.ok(floor, `test-list-${slice}.txt declares no '#!cells-floor:'`);
    const files = listedFiles(text);
    assert.ok(files.length > 0, `test-list-${slice}.txt lists no files`);
    let total = 0;
    for (const f of files) {
      assert.ok(existsSync(path.join(TESTS_DIR, f)),
        `test-list-${slice}.txt names a file that does not exist on disk: ${f}`);
      total += staticCellCount(f);
    }
    assert.equal(total, Number(floor[1]),
      `test-list-${slice}.txt declares a floor of ${floor[1]} while its own listed files carry ${total} top-level `
      + "test( cell(s) on disk right now — the corpus moved (a cell was added or removed inside a listed file, or "
      + "a file joined or left the list) without the declared floor moving with it; raise or lower #!cells-floor: "
      + "in the SAME PR that changes the corpus, never separately (#1126)");
  }
});

test("p1126.floor.roster the cross-slice contract roster's declared #!cells-floor: equals the static test( count summed across its own files", () => {
  const rosterPath = path.join(TESTS_DIR, "split-lists", "test-list-contracts.txt");
  const text = readFileSync(rosterPath, "utf8");
  const floor = /^#!cells-floor:\s*(\d+)\s*$/m.exec(text);
  assert.ok(floor, "test-list-contracts.txt declares no '#!cells-floor:'");
  const files = listedFiles(text);
  assert.ok(files.length > 0, "test-list-contracts.txt lists no files");
  let total = 0;
  for (const f of files) {
    assert.ok(existsSync(path.join(TESTS_DIR, f)),
      `test-list-contracts.txt names a file that does not exist on disk: ${f}`);
    total += staticCellCount(f);
  }
  assert.equal(total, Number(floor[1]),
    `test-list-contracts.txt declares a floor of ${floor[1]} while its own listed files carry ${total} top-level `
    + `test( cell(s) on disk right now (#1126)`);
});
