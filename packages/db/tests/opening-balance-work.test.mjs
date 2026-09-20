// #984 -- THE OPENING LANE BECOMES A WORK. Approving an opening seed or an opening correction now
// mints ONE `clara.accounting_work` row and ONE `clara.operation_receipts` row under a FOURTH
// purpose, `opening_balance`, beside the dedicated `clara.opening_seed_approvals` receipt opening
// has always written. Migration 0239 widens the closed purpose vocabulary in the places that
// assert it independently, and adds a SIBLING admission path so opening never touches the
// model-run machinery `clara._admit_accounting_work_core` exists for.
//
// THE OWNER'S RULING (2026-09-20, on the ticket) reverses the ticket's own recommended Option B:
// #656's AC5 asked for the Work-and-receipt pair here and the wave recorded it as "descoped
// (authority)", which was an authority question rather than a finding that the Work model is
// wrong for opening.
//
// SEAMS (written down before the first test, work-order rule 4). The Agent Brief's "Key
// interfaces" names these, and this file tests at these only:
//
//   1. `clara._assert_adjustment_basis(text, jsonb)` -- the typed-particulars gate that owns the
//      `invalid_purpose` refusal. Called directly (it is an owner-only internal, reached here as
//      root) because that IS its shape: every caller reaches it the same way, from inside a
//      definer body.
//   2. `clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)` -- the human door, driven as
//      a real signed-in SERIALIZABLE session through the wave-B fixture, exactly as
//      `wb-k-approval.test.mjs` drives it. Everything behavioural is asserted there: which rows
//      appear, which rows do NOT, and what opening's own relations still say.
//   3. `clara.approve_opening_correction(uuid,jsonb,text,text)` -- the second human door, on the
//      same footing.
//   4. THE PURPOSE VOCABULARY ITSELF -- both column CHECKs, the two shape CHECKs that read the
//      purpose, and `clara._record_journal_entry_core`'s closed IN-list -- as a CATALOGUE census
//      rather than as a callable. A claim about "every place the vocabulary is closed" is
//      structural by nature, and work-order rule 4's "where this repo's own documented standard
//      asks for a structural cell, that standard wins" is what it rests on;
//      `p638.core.no_regression` in `staff-expense-claim.test.mjs` is the precedent and the cell
//      #984's AC6 re-derives.
//
// NOT A SEAM, and never asserted as one: the contents of `basis` / `effects` as a DOMAIN answer.
// They are read here only to prove the rows name the batch they came from.
//
// FAIL, NEVER SKIP, on a focused run. A sweep against a pre-0239 chain preloads
// `opening-balance-work-preintegration-gate.mjs`; a focused run leaves
// CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK unset and must count ZERO skips.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, assertRaises, printLaneNotes, noteLane,
  wbEnsureReady,
} from "./wave-b/wb-fixtures.mjs";

/** The migration whose effects this file describes, and the stem its gate module keys on. */
const MIGRATION = "0239_opening_balance_work";
const STEM = "opening_balance_work$";

/** The fourth value 0239 admits, and the three it must leave exactly where they were. */
const OPENING = "opening_balance";
const PRIOR = ["journal_entry", "periodic_stock_adjustment", "payroll_obligation"];

let ready = false;

before(async () => {
  ready = await wbEnsureReady();
  if (!ready) return;
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  if (r.rows[0].n === 0) {
    if (process.env.CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK !== "1") {
      throw new Error(
        `#984 premise ${MIGRATION} is not applied (no ${STEM} row in clara.schema_migrations) `
        + "and CLARA_ALLOW_MISSING_OPENING_BALANCE_WORK is unset -- this is a FOCUSED run and must "
        + "fail loudly, not skip. Preload ./tests/opening-balance-work-preintegration-gate.mjs for "
        + "an estate sweep against a pre-#984 chain.");
    }
    ready = false;
    return;
  }
});

after(async () => {
  printLaneNotes("opening-balance-work");
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: wbEnsureReady() failed, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

/** `clara._assert_adjustment_basis` is an owner-only internal; root is how every cell reaches it. */
const assertBasis = (purpose, adjustment) => rootQuery(
  "select clara._assert_adjustment_basis($1, $2::jsonb) as r",
  [purpose, adjustment === null ? null : JSON.stringify(adjustment)]);

// =============================================================================================
// 1 - obw984.basis.vocabulary -- the typed-particulars gate learns ONE value and loses none.
//
// This is the arm the Agent Brief's AC4 names. `clara._assert_adjustment_basis` holds its OWN
// closed list (it raises `invalid_purpose` outside the three) and is reached from every admission
// path, so a purpose the CHECKs admit but this body does not is a purpose no door could mint.
// =============================================================================================
test("obw984.basis.vocabulary: the opening purpose is admitted with NULL particulars, refuses typed ones, and the three prior purposes are untouched", async (t) => {
  if (unready(t)) return;

  // THE NEW ARM. An opening Work carries no typed particulars, exactly as a journal-entry Work
  // does not -- opening's figures are the opening items themselves, already posted entries.
  await assertBasis(OPENING, null);

  // ...and it is a REFUSAL, not an ignore, when somebody offers particulars anyway. The spelling
  // is the journal-entry arm's, because it is the same fault: a purpose that carries none.
  const err = await assertRaises("CLR10", () => assertBasis(OPENING, { period_start: "2026-01-01" }),
    "typed particulars on an opening work");
  const detail = JSON.parse(err.detail ?? "{}");
  assert.equal(detail.reason, "invalid_adjustment", "the refusal names the adjustment, not the purpose");
  assert.equal(detail.constraint, "not_supported",
    "...and says the purpose supports none, which is the journal-entry arm's own word");

  // THE THREE PRIOR PURPOSES, unmoved. A widening that quietly relaxed one of them would pass
  // every assertion above.
  await assertBasis("journal_entry", null);
  await assertRaises("CLR10", () => assertBasis("journal_entry", { period_start: "2026-01-01" }),
    "journal_entry still carries no particulars");
  const missing = await assertRaises("CLR10", () => assertBasis("periodic_stock_adjustment", null),
    "periodic_stock_adjustment still REQUIRES its particulars");
  assert.equal(JSON.parse(missing.detail ?? "{}").constraint, "object",
    "...with its own constraint token, not the opening arm's");

  // AND THE CLOSED SET IS STILL CLOSED. A fifth value is still `invalid_purpose`.
  const unknown = await assertRaises("CLR10", () => assertBasis("opening_balance_batch", null),
    "a value outside the widened four");
  assert.equal(JSON.parse(unknown.detail ?? "{}").reason, "invalid_purpose",
    "the gate still answers invalid_purpose outside the vocabulary -- widened, not opened");
  noteLane(`obw984: clara._assert_adjustment_basis admits ${PRIOR.length + 1} purposes and no more`);
});
