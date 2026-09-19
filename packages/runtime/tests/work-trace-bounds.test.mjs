// #847 — packages/runtime/lib/work-trace-bounds.mjs, the WRITER-SIDE mirror of the two shape
// bounds migration 0210 put at the DOOR.
//
// WHAT 0210 SAID IT WAS LEAVING OPEN, AND WHY. 0210's own header: "AT THE WRITER, ONE HALF REMAINS
// OPEN, DELIBERATELY. packages/runtime/lib/work-trace.mjs is inside claraWork_v3's FROZEN closure
// and hash-locked in frozen-workflows.json; a comment edit breaks that lock exactly as a code edit
// does. `traceRevisionOf` still returns ANY finite JS number, and `traceRunOf` is still never
// applied to the value `recordTrace` sends." That bound was recorded as a claraWork_v4
// requirement; v4 shipped without it (ARCHITECTURE:373-386), and #658 is the ticket that carries
// it to the v5 cut. `lib/work-trace.mjs` is NOT opened: this is a sibling module the v5 body
// imports.
//
// THE ONE RULE THESE CELLS EXIST FOR: THE WRITER'S CLAUSE STAYS NO TIGHTER THAN THE DOOR'S. A
// writer stricter than the door silently loses rows the database would have accepted, and
// `traceSafely` swallows the loss — which is the same "a diagnostic decided the accounting"
// failure mode in reverse.

import test from "node:test";
import assert from "node:assert/strict";

import {
  TRACE_NUMBER_MAX_ABS, TRACE_NUMBER_MAX_SCALE, boundedRevisionNumber, boundedRunId,
} from "../lib/work-trace-bounds.mjs";

// ---------------------------------------------------------------------------------------------
// The revision-number clause: abs(v) < 1e12 and scale(v) <= 6 (0210:51).
// ---------------------------------------------------------------------------------------------

test("wtb.01 the constants ARE 0210's, spelled once", () => {
  assert.equal(TRACE_NUMBER_MAX_ABS, 1e12);
  assert.equal(TRACE_NUMBER_MAX_SCALE, 6);
});

test("wtb.02 everything the DOOR admits, the writer admits — no tighter", () => {
  // Every shape 0210's own tail exercised by value, plus the counters this vocabulary carries.
  for (const v of [0, 1, 42, -1, 999999999999, -999999999999, 1.5, 0.000001, -0.000001,
    1e11, 123456.654321]) {
    assert.equal(boundedRevisionNumber(v), v, `the door admits ${v}; the writer must not drop it`);
  }
});

test("wtb.03 a 16-digit account run is REFUSED — the value 0210 was written for", () => {
  assert.equal(boundedRevisionNumber(5141882293107742), null);
  assert.equal(boundedRevisionNumber(1e30), null, "a magnitude payload");
  assert.equal(boundedRevisionNumber(-1e30), null);
  assert.equal(boundedRevisionNumber(1.5e-20), null, "the mirror image: a SCALE payload");
  assert.equal(boundedRevisionNumber(1e12), null, "the bound is strict: abs(v) < 1e12");
  assert.equal(boundedRevisionNumber(0.0000001), null, "seven fractional places is scale 7");
});

test("wtb.04 a non-number is not a number, and the answer is null rather than a coercion", () => {
  for (const v of [null, undefined, "42", NaN, Infinity, -Infinity, {}, [], true]) {
    assert.equal(boundedRevisionNumber(v), null, `input ${String(v)}`);
  }
});

// ---------------------------------------------------------------------------------------------
// The run-id clause: `^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$` or `!~ '[0-9]{13,}'` (0210:68).
// ---------------------------------------------------------------------------------------------

test("wtb.05 every run-id shape that EXISTS is admitted — the WDK's, the uuid one, the rig's", () => {
  for (const id of [
    "wrun_01M20WGD9ETKK6RWCBA8CWG1GE", // @workflow/core 4.8.4's ULID form
    "wrun_01M20WGD9E0000000000000GEX", // ...including one with a long digit run INSIDE the ULID
    "run_9f1f6a5c-2b7c-4a27-9a1b-6d3c8e5f0a11", // 0195:1163's shape
    "p658_run_a1b2c3d4", // the db battery's fixture tail
  ]) {
    assert.equal(boundedRunId(id), id, `the door admits ${id}; the writer must not drop it`);
  }
});

test("wtb.06 `run-<16 digits>` is refused — the exact shape that walked past the first grammar", () => {
  assert.equal(boundedRunId("run-5141882293107742"), null);
  assert.equal(boundedRunId("wrun_5141882293107742"), null,
    "a wrun_ PREFIX is not the wrun_ SHAPE: 16 digits is not 26 Crockford characters");
  assert.equal(boundedRunId("x".repeat(3) + "1234567890123"), null, "thirteen is the threshold");
  assert.equal(boundedRunId("x".repeat(3) + "123456789012"), "xxx123456789012", "twelve is not");
});

test("wtb.07 the Crockford alphabet is the real one — I, L, O and U are not in it", () => {
  assert.equal(boundedRunId("wrun_01M20WGD9ETKK6RWCBA8CWG1GE"), "wrun_01M20WGD9ETKK6RWCBA8CWG1GE");
  // A 26-character body containing an excluded letter falls to the SECOND arm, which admits it
  // (it has no long digit run) -- "no tighter than the door" means exactly that.
  assert.equal(boundedRunId("wrun_01M20WGD9ETKK6RWCBA8CWG1IE"), "wrun_01M20WGD9ETKK6RWCBA8CWG1IE");
});

test("wtb.08 a non-string run id is null, never a coercion", () => {
  for (const v of [null, undefined, 42, {}, [], true, ""]) {
    assert.equal(boundedRunId(v), null, `input ${String(v)}`);
  }
});

test("wtb.09 no module-level `node:` import — this module is destined for a frozen closure too", async () => {
  const fs = await import("node:fs/promises");
  const url = await import("node:url");
  const src = await fs.readFile(
    url.fileURLToPath(new URL("../lib/work-trace-bounds.mjs", import.meta.url)), "utf8");
  const moduleLevel = src.split("\n").filter((l) => /^\s*import\s[^(]*["']node:/.test(l));
  assert.deepEqual(moduleLevel, []);
});
