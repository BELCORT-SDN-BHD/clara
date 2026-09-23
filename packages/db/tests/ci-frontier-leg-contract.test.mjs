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
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const TESTS_DIR = fileURLToPath(new URL(".", import.meta.url));
const DB_PKG = path.join(TESTS_DIR, "..");
const REPO_ROOT = path.join(DB_PKG, "..", "..");
const FRONTIER_ACTION = path.join(REPO_ROOT, ".github", "actions", "frontier-leg", "action.yml");

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
