// Battery for migration 0296_payroll_summary_typed_facts.sql — #945: A PAYROLL SUMMARY IS READ
// THE WAY AN INVOICE IS READ, AND A DETERMINISTIC EVALUATOR DOES EVERY SUM.
//
// Spec of record: issue #945's Agent Brief (the body; its one comment, 2026-09-19, is a
// coordination note, not an owner ruling). Parent #926's owner ruling (2026-09-18, option G):
// "a payroll summary and a contract go down the same lane as any other accounting document,
// read and posted, not merely stored."
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief
// names, and no cell sits anywhere else):
//   S1. THE CANONICAL FIELD-PATH NAMESPACE — clara._field_path_conforms(text), the CHECK
//       constraint's own boolean sibling (0290) over clara._assert_field_path's roster (0191).
//       `payroll.*` conforms; an unregistered namespace is still refused by name.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, endPool } from "./rig-fixtures.mjs";

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const applied = (
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0296@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_SUMMARY_FACTS !== "1") {
      throw new Error(
        "payroll-summary-facts premise missing (migration 0296 is not applied) -- this is a FOCUSED " +
          "run and must fail loudly, not skip. Preload " +
          "./tests/payroll-summary-facts-preintegration-gate.mjs for an estate sweep against a chain " +
          "that predates 0296.",
      );
    }
    ready = false;
  }
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0296 is not applied");
    return true;
  }
  return false;
}

/** Drive the grammar through the SAME boolean the CHECK constraint evaluates (0290), so a cell
 *  that passes here is a cell a raw insert into clara.document_regions would also pass. */
async function conforms(path) {
  try {
    const r = await rootQuery("select clara._field_path_conforms($1) as ok", [path]);
    return { ok: r.rows[0].ok === true, reason: null };
  } catch (err) {
    let reason = null;
    try {
      reason = JSON.parse(err.detail ?? "{}").reason ?? null;
    } catch {
      reason = null;
    }
    return { ok: false, reason, code: err.code };
  }
}

// ---------------------------------------------------------------------------
// S1 — the canonical field-path namespace
// ---------------------------------------------------------------------------

test("S1 · the payroll namespace is registered, and an unregistered namespace is still refused by name", async (t) => {
  if (unready(t)) return;

  for (const path of [
    "payroll.run.period",
    "payroll.run.gross_pay",
    "payroll.run.epf_employee",
    "payroll.run.epf_employer",
    "payroll.run.socso_employee",
    "payroll.run.socso_employer",
    "payroll.run.eis_employee",
    "payroll.run.eis_employer",
    "payroll.run.pcb",
    "payroll.run.hrdf_levy",
    "payroll.run.net_pay",
  ]) {
    const v = await conforms(path);
    assert.equal(v.ok, true, `${path} must conform: the payroll namespace is registered by 0296`);
  }

  // The vocabulary is still CLOSED — widening it by one namespace admits exactly one namespace.
  const bad = await conforms("payrol.run.gross_pay");
  assert.equal(bad.ok, false, "a typo'd namespace must still be refused outright");
  assert.equal(bad.reason, "field_path_namespace", "…by name, with the grammar's own typed reason");
  assert.equal(bad.code, "CLR10", "…and the grammar's own errcode, never a generic 23514");
});
