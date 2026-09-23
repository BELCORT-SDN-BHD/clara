// #1018 — the census AC3 asks for: "changing the shared module's allowed-database-name pattern
// once is sufficient for every driver to pick up the change, verified by a test that enumerates
// the driver files and confirms each imports the shared gate." This file IS that test. It reads
// each standalone runtime World e2e driver's own source text (never re-implements or re-derives
// the gate itself — that would be tautological) and checks, independently of any driver's actual
// behaviour, that:
//   1. the driver imports the shared module rather than defining its own copy;
//   2. the driver no longer declares a local `ALLOWED_DB` or `LOCAL_HOSTS` (the exact shape of
//      the pre-#1018 duplication: a driver's own, independently hand-typed copy of the gate);
//   3. the driver actually calls the shared guard, so importing it isn't a dead import.
//
// DRIVERS is the enumerated set: every standalone `*-e2e.mjs` file under this directory that, on
// 2026-09-20, carried this exact loopback-host + allowed-database-name gate (`git grep
// ALLOWED_DB packages/runtime/tests` before this ticket). `shutdown-e2e.mjs` and `world-e2e.mjs`
// are standalone e2es too but never carried this gate at all (they require DB env presence only,
// with no allowed-name list) — out of THIS ticket's scope, not missed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

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

/** Pure text-level census of one driver's source — no execution, no filesystem beyond the read
 * the caller already did. Returns every failing reason, not just the first, so one run names
 * everything wrong with a file instead of forcing 23 red/green/red cycles to find them all. */
export function censusDriverSource(source) {
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
  if (!/assertLocalDbGate\(/.test(source)) {
    reasons.push("never calls assertLocalDbGate — the import would be dead");
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

test("1018: every enumerated standalone World e2e driver imports the shared gate and drops its own copy", () => {
  const failures = [];
  for (const file of DRIVERS) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    const { ok, reasons } = censusDriverSource(source);
    if (!ok) failures.push(`${file}: ${reasons.join("; ")}`);
  }
  assert.deepEqual(failures, [], `driver(s) not yet converted to the shared gate:\n${failures.join("\n")}`);
});
