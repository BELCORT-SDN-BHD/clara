// Battery for migration 0344_payroll_fact_revision.sql — #1056: A PERSON CORRECTS A MISREAD
// PAYROLL FACT THROUGH THE DOCUMENT REVISE CONTROL.
//
// Spec of record: issue #1056's Agent Brief (the body; the issue carries no comment, so nothing
// later than the body binds). Parent #945 shipped the payroll READING (migration 0296) and #946
// the unattended POST (0297); this closes the one thing neither gave a person — a way to correct
// a figure the reader took wrong.
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief
// names, and no cell sits anywhere else):
//   S1. THE CLOSED PREDICATE — clara._revisable_fact_lane(text). The brief's own first key
//       interface: "the closed predicate that decides which field paths are revisable … or a
//       sibling predicate needs to exist". It is the SIBLING arm: it answers WHICH LANE a path
//       belongs to, asking clara._revisable_invoice_field for the invoice arm rather than
//       widening it, so neither closed set learns the other's members.
//   S2. THE HUMAN DOOR — clara.revise_document_fact(uuid,text,jsonb,int,text,text), driven as a
//       bookkeeper through humanQuery. A payroll run question is admitted, lands in the PAYROLL
//       facts chain (never the invoice one), and carries the other ten questions forward.
//   S3. THE POSTING VERDICT — clara._payroll_posting_verdict(uuid), the brief's own second key
//       interface. It is STABLE and derived, so what a correction does to it is measured by
//       asking it before and after.
//   S4. THE LINEAGE READ — clara.list_source_revisions(uuid), the read the document surface takes
//       its facts version from. A payroll document's version is the PAYROLL chain's.
//   S5. THE AUDIT TRAIL — clara.document_fact_revisions, read as COMMITTED rows (AC3: who
//       revised, when, what the prior value was).
//
// Serial discipline: --test-concurrency=1 (shared rig convention).
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, endPool } from "./rig-helpers.mjs";
import { buildWorld, upsertAccount } from "./rig-fixtures.mjs";

const STEM = "payroll_fact_revision$";

let live = false;
let world = null;

before(async () => {
  const applied = (await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM])).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_PAYROLL_FACT_REVISION === "1") {
      console.warn("SKIP payroll-fact-revision: the 0344 cohort is not applied (explicit pre-integration run).");
      return;
    }
    assert.fail(
      "payroll-fact-revision is required for a focused run: apply "
      + "0344_payroll_fact_revision.sql. Preload ./tests/payroll-fact-revision-preintegration-gate.mjs "
      + "for an estate sweep against a chain that predates it.");
  }
  live = true;
  world = await buildWorld();
});

after(async () => { await endPool(); });

function gate(t) {
  if (live) return false;
  t.skip("payroll-fact-revision cohort absent -- explicit pre-integration run");
  return true;
}

// ---------------------------------------------------------------------------------------------
// S1 — the closed predicate
// ---------------------------------------------------------------------------------------------

const lane = async (path) =>
  (await rootQuery("select clara._revisable_fact_lane($1) as lane", [path])).rows[0].lane;

test("S1 · the lane predicate names the payroll lane, the invoice lane, and refuses everything else", async (t) => {
  if (gate(t)) return;

  // The ELEVEN run-level questions clara.persist_payroll_facts writes a region for (0296's own
  // clara._payroll_answers_ok vocabulary), transcribed from that migration rather than read back
  // out of the predicate under test.
  for (const f of [
    "payroll.run.period", "payroll.run.gross_pay",
    "payroll.run.epf_employee", "payroll.run.epf_employer",
    "payroll.run.socso_employee", "payroll.run.socso_employer",
    "payroll.run.eis_employee", "payroll.run.eis_employer",
    "payroll.run.pcb", "payroll.run.hrdf_levy", "payroll.run.net_pay",
  ]) {
    assert.equal(await lane(f), "payroll", `${f} is a payroll-lane fact`);
  }

  // The invoice lane's own closed set still answers `invoice`, unwidened.
  assert.equal(await lane("invoice.total"), "invoice");
  assert.equal(await lane("invoice.tax_breakdown"), "invoice");

  // NOTHING BELOW THE RUN LEVEL. The per-employee quotes are summed and discarded by
  // clara.persist_payroll_facts (0296 step 7), so no region carries them and no human can revise
  // one — admitting the path would offer a control over a figure that is not on file.
  assert.equal(await lane("payroll.row.gross_pay"), null);
  // A canonical path from another lane, and a layout fragment.
  assert.equal(await lane("statement.closing_balance"), null);
  assert.equal(await lane("pages.1.lines.0"), null);
  // A path that is not canonical at all is still just "no lane" here: the grammar wall
  // (clara._assert_field_path) is what refuses it, and it runs FIRST inside the door.
  assert.equal(await lane("payroll.run.bonus"), null);
  assert.equal(await lane(null), null);
});
