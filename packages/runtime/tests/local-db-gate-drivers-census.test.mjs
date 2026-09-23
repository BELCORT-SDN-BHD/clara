// #1018 — the census AC3 asks for: "changing the shared module's allowed-database-name pattern
// once is sufficient for every driver to pick up the change, verified by a test that enumerates
// the driver files and confirms each imports the shared gate." This file IS that test. It reads
// each standalone runtime World e2e driver's own source text (never re-implements or re-derives
// the gate itself — that would be tautological) and checks, independently of any driver's actual
// behaviour, that:
//   1. the driver imports the shared module rather than defining its own copy;
//   2. the driver no longer declares a local `ALLOWED_DB` or `LOCAL_HOSTS` — the exact shape of
//      the pre-#1018 duplication — NOR the same thing under any other name (review SPEC-1018-02:
//      a renamed constant bound to an anchored `/^clara_.../` regex is the same second copy);
//   3. the driver actually calls the shared guard, so importing it isn't a dead import.
//
// THE ROSTER IS DERIVED, NOT TYPED (review SPEC-1018-02). `DRIVERS` is still written out, because
// the order the drivers were converted in is part of this ticket's record, but a cell below
// derives the same set from the directory listing and asserts the two agree. A `*-e2e.mjs` file
// added tomorrow therefore REDS this census on its first day instead of being silently out of
// scope: whoever adds it must either convert it or name it in `NON_GATE_E2ES` with a reason.
//
// `shutdown-e2e.mjs` and `world-e2e.mjs` are standalone e2es too but never carried this gate at
// all (they require DB env presence only, with no allowed-name list) — out of THIS ticket's scope,
// not missed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Grows in step with the driver conversions landing on #1018 (one small commit per group, per
// the work order's vertical-slice rule): this list names only the drivers ALREADY converted at
// each commit, so this cell is green at every commit boundary, never red-and-waiting. The full
// 23-file roster (every standalone World e2e that carried this gate on 2026-09-20) lands across
// the ticket's commits and is intact by the ticket's last one.
export const DRIVERS = Object.freeze([
  "intake-e2e.mjs",
  "intake-admission-e2e.mjs",
  "intake-batch-e2e.mjs",
  "work-knowledge-e2e.mjs",
  "accrual-e2e.mjs",
  "opening-ledger-source-e2e.mjs",
  "plan-occurrence-e2e.mjs",
  "prepayment-occurrence-e2e.mjs",
  "trade-invoice-e2e.mjs",
  "two-build-cutover-e2e.mjs",
  "work-cancel-e2e.mjs",
  "work-question-e2e.mjs",
  "chat-turn-v19-e2e.mjs",
  "chat-turn-v20-e2e.mjs",
  "chat-turn-v21-e2e.mjs",
  "fixed-asset-acquisition-e2e.mjs",
  "work-egress-e2e.mjs",
  "periodic-adjustment-e2e.mjs",
  "staff-expense-claim-e2e.mjs",
  "work-journal-e2e.mjs",
  "interview-e2e.mjs",
  "interview-kill-resume-e2e.mjs",
  "version-cutover-e2e.mjs",
]);

/** The standalone World e2es that never carried an allowed-database-name gate at all: both require
 *  only that DB env is present. Naming them here is what keeps the derived roster honest — the
 *  exclusion is a decision on the record, not an absence. */
export const NON_GATE_E2ES = Object.freeze(["shutdown-e2e.mjs", "world-e2e.mjs"]);

/** The OTHER file that spawns a real World and carries this same gate, and the reason it is not in
 *  `DRIVERS`: it is a `node --test` file, so its gate SKIPS with a printed reason instead of
 *  throwing (a thrown gate would fail the file rather than decline it). It therefore never calls
 *  `assertLocalDbGate` — it composes the same decision from the shared module's own checks — and
 *  the census asserts exactly that instead. Review SPEC-1018-01: before this, it was the 24th file
 *  carrying an independent copy of the identical gate, CI-wired as a World leg like the 23
 *  (`.github/actions/db-live-gates/action.yml`), and named nowhere in this file. */
export const SKIP_GATED_WORLD_TESTS = Object.freeze([
  { file: "body-census-guard-db.test.mjs", calls: Object.freeze(["isLoopbackHost", "dsnAgreesWithEnv"]) },
]);

/** The roster, derived from what is actually on disk rather than from what someone remembered to
 *  type. Everything `*-e2e.mjs` in this directory is a standalone World driver; the only way out
 *  is `NON_GATE_E2ES`. */
export function deriveDriverRoster(fileNames) {
  return fileNames.filter((f) => f.endsWith("-e2e.mjs") && !NON_GATE_E2ES.includes(f)).sort();
}

/** Pure text-level census of one file's source — no execution, no filesystem beyond the read
 * the caller already did. Returns every failing reason, not just the first, so one run names
 * everything wrong with a file instead of forcing 23 red/green/red cycles to find them all.
 * `calls` is which shared entry point(s) the file must actually invoke: the 23 drivers call the
 * combined `assertLocalDbGate`, while a skip-gated World `.test.mjs` composes the same decision
 * from the module's own checks and names those instead. */
export function censusDriverSource(source, { calls = ["assertLocalDbGate"] } = {}) {
  const reasons = [];
  if (!/from\s+["']\.\/local-db-gate\.mjs["']/.test(source)) {
    reasons.push("does not import ./local-db-gate.mjs");
  }
  if (/^\s*const\s+ALLOWED_DB\s*=/m.test(source)) {
    reasons.push("still declares its own local ALLOWED_DB");
  }
  if (/^\s*const\s+LOCAL_HOSTS\s*=\s*new Set/m.test(source)) {
    reasons.push("still declares its own local LOCAL_HOSTS");
  }
  // The same second copy under a DIFFERENT name: any local binding whose value is an anchored
  // `clara_` database-name regex. `ALLOWED_DB` is excluded here only because it already has its
  // own, more specific reason above — one defect, one reason.
  const renamed = /^\s*const\s+(?!ALLOWED_DB\b)(\w+)\s*=\s*\/\^clara_/m.exec(source);
  if (renamed) {
    reasons.push(`still declares its own anchored clara_ database-name regex, as ${renamed[1]}`);
  }
  for (const call of calls) {
    if (!new RegExp(`${call}\\(`).test(source)) {
      reasons.push(`never calls ${call} — the import would be dead`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

test("1018: censusDriverSource flags a driver that still hand-rolls its own gate", () => {
  const stillLocal = `
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_DB = /^clara_(rt_test)$/;
if (!LOCAL_HOSTS.has(process.env.PGHOST) || !ALLOWED_DB.test(process.env.PGDATABASE ?? "")) {
  throw new Error("nope");
}
`;
  const out = censusDriverSource(stillLocal);
  assert.equal(out.ok, false);
  assert.deepEqual(out.reasons, [
    "does not import ./local-db-gate.mjs",
    "still declares its own local ALLOWED_DB",
    "still declares its own local LOCAL_HOSTS",
    "never calls assertLocalDbGate — the import would be dead",
  ]);
});

test("1018: RENAMING the copy does not hide it — an anchored clara_ regex under any name is flagged", () => {
  // Review SPEC-1018-02: the census used to key on two exact identifier names, so the identical
  // second copy spelled `const ADMITTED = /^clara_.../` walked straight through it.
  const renamed = `
import { assertLocalDbGate } from "./local-db-gate.mjs";
const ADMITTED = /^clara_(rt_test|wave_b_ci)$/;
assertLocalDbGate({ label: "sneaky-e2e", pattern: { dbRegex: ADMITTED, dsnRegex: /x/, describe: () => "x" } });
`;
  const out = censusDriverSource(renamed);
  assert.equal(out.ok, false);
  assert.deepEqual(out.reasons, ["still declares its own anchored clara_ database-name regex, as ADMITTED"]);
});

test("1018: censusDriverSource allows a driver that imports and calls the shared gate only", () => {
  const converted = `
import { DB_NAME_SHAPE, allowedDbPattern, assertLocalDbGate } from "./local-db-gate.mjs";
assertLocalDbGate({
  label: "some-e2e",
  pattern: allowedDbPattern(DB_NAME_SHAPE.RT_TEST),
});
`;
  const out = censusDriverSource(converted);
  assert.equal(out.ok, true, out.reasons.join("; "));
});

test("1018: an import with no call is still flagged — the census checks USE, not just the import line", () => {
  const importOnly = `
import { assertLocalDbGate } from "./local-db-gate.mjs";
// (never actually called)
`;
  const out = censusDriverSource(importOnly);
  assert.deepEqual(out.reasons, ["never calls assertLocalDbGate — the import would be dead"]);
});

test("1018: a skip-gated file is censused on the checks it actually composes, not on assertLocalDbGate", () => {
  const skipGated = `
import { DB_NAME_SHAPE, allowedDbPattern, dsnAgreesWithEnv, isLoopbackHost } from "./local-db-gate.mjs";
const DB_PATTERN = allowedDbPattern(DB_NAME_SHAPE.RT_TEST);
function gateReason() {
  if (!isLoopbackHost(process.env.PGHOST) || !DB_PATTERN.dbRegex.test(process.env.PGDATABASE ?? "")) return "no";
  if (!dsnAgreesWithEnv(process.env.WORKFLOW_POSTGRES_URL, { port: process.env.PGPORT, database: process.env.PGDATABASE })) return "no";
  return null;
}
`;
  assert.equal(censusDriverSource(skipGated, { calls: ["isLoopbackHost", "dsnAgreesWithEnv"] }).ok, true);
  // …and the SAME source is still flagged under the default expectation, so the two rosters cannot
  // be swapped by accident.
  assert.deepEqual(
    censusDriverSource(skipGated).reasons,
    ["never calls assertLocalDbGate — the import would be dead"],
  );
});

test("1018: the driver roster is DERIVED from the directory, so a new World e2e cannot slip in unnoticed", () => {
  const dir = fileURLToPath(new URL(".", import.meta.url));
  const derived = deriveDriverRoster(readdirSync(dir));
  assert.deepEqual(
    derived, [...DRIVERS].sort(),
    "a *-e2e.mjs file in packages/runtime/tests is either converted to the shared gate and listed "
    + "in DRIVERS, or named in NON_GATE_E2ES with its reason — never neither",
  );
});

test("1018: every enumerated standalone World e2e driver imports the shared gate and drops its own copy", () => {
  const failures = [];
  for (const file of DRIVERS) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const { ok, reasons } = censusDriverSource(source);
    if (!ok) failures.push(`${file}: ${reasons.join("; ")}`);
  }
  assert.deepEqual(failures, [], `driver(s) not yet converted to the shared gate:\n${failures.join("\n")}`);
});

test("1018: the skip-gated World test file carries no second copy of the gate either", () => {
  const failures = [];
  for (const { file, calls } of SKIP_GATED_WORLD_TESTS) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const { ok, reasons } = censusDriverSource(source, { calls: [...calls] });
    if (!ok) failures.push(`${file}: ${reasons.join("; ")}`);
  }
  assert.deepEqual(failures, [], `World-spawning test file(s) still hand-rolling the gate:\n${failures.join("\n")}`);
});
