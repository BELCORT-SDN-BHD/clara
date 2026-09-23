// Battery for migration 0299_agreement_contract_acquisition.sql — #948: A HIRE-PURCHASE OR
// FINANCE-LEASE AGREEMENT IS READ THE WAY A PAYSLIP IS READ, AND THE ACQUISITION IT CREATES ON
// THE DAY IT IS SIGNED IS DRAFTED INTO THE FIXED-ASSET LANE.
//
// Spec of record: issue #948's Agent Brief (the issue body). Its single comment (belcorttao,
// 2026-09-19T16:22:05Z) is an AI triage note, not an owner ruling, and nothing on this ticket is
// dated 2026-09-20 — so the body stands, and the comment's factual correction is followed:
// there is NO fixed-asset birth door to call. `clara._tf_fa_acquisition_birth` (0216) is a
// lane-agnostic deferred constraint trigger that fires on any entry reaching `approved` and
// births a register row for every line debiting an account enrolled in
// `clara.fa_account_profiles`. This lane therefore posts an ORDINARY entry and the trigger does
// the rest.
//
// Parent: #926, owner ruling 2026-09-18 (option G) — "a payroll summary and a contract go down
// the same lane as any other accounting document, read and posted, not merely stored". #945/#946
// shipped the payroll half; this is the contract half.
//
// THE SEAMS, named up front (WORK-ORDER rule 4 — the seams are the public interfaces the brief
// names, and no cell sits anywhere else):
//   S1. THE FIELD-PATH GRAMMAR — clara._field_path_conforms(text), the CHECK constraint's own
//       boolean over clara._assert_field_path's closed namespace roster. AC1's "the contract
//       namespace is registered".
//   S2. THE ANSWER-VOCABULARY GATE — clara._agreement_answers_ok(jsonb, text). AC1's "the
//       vocabulary gate widened": the agreement family's OWN closed vocabulary.
//   S3. THE DETERMINISTIC EVALUATOR — clara.evaluate_agreement_contract_state_v1(jsonb, jsonb).
//       AC2: deposit + financed = cash price, the printed schedule reconciled, and which KIND of
//       agreement it read.
//   S4. THE FACTS ROUTER — clara.enqueue_invoice_facts(uuid), the door every caller reaches.
//       An agreement contract stops terminating as a skipped kind and gets its own lane.
//   S5. THE PERSIST DOOR — clara.persist_agreement_facts(uuid, jsonb, jsonb, integer) and its
//       terminal twin clara.fail_agreement_facts(uuid, text).
//   S6. THE CAPABILITY READ — clara._document_capability(text, text). AC3.
//   S7. THE DRAFTING BODY — clara._agreement_entry_plan(uuid, jsonb). AC4's entry.
//   S8. THE UNATTENDED GATE — clara._agreement_posting_verdict(uuid). AC4's "the unattended gate
//       matches the payroll lane's, condition for condition"; AC5's non-financing branch.
//   S9. NEEDS YOU — clara.list_review_queue(jsonb, jsonb, integer).
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
    await rootQuery("select count(*)::int as n from clara.schema_migrations where version like '0299@_%' escape '@'")
  ).rows[0].n;
  if (applied === 0) {
    if (process.env.CLARA_ALLOW_MISSING_AGREEMENT_CONTRACT !== "1") {
      throw new Error(
        "agreement-contract premise missing (migration 0299 is not applied) -- this is a FOCUSED " +
          "run and must fail loudly, not skip. Preload " +
          "./tests/agreement-contract-acquisition-preintegration-gate.mjs for an estate sweep " +
          "against a chain that predates 0299.",
      );
    }
    ready = false;
    return;
  }
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0299 is not applied");
    return true;
  }
  return false;
}

/** The eleven run-level questions the agreement questionnaire asks, and the four cells a
 *  printed repayment-schedule row prints. Spelled here ONCE and re-used by every later cell, so
 *  a rename shows up as a diff in one place. */
const RUN_FIELDS = [
  "contract.agreement.kind",
  "contract.agreement.financier",
  "contract.agreement.agreement_date",
  "contract.agreement.asset_description",
  "contract.agreement.cash_price",
  "contract.agreement.deposit",
  "contract.agreement.amount_financed",
  "contract.agreement.total_charges",
  "contract.agreement.total_payable",
  "contract.agreement.term_months",
  "contract.agreement.instalment_amount",
];

const ROW_FIELDS = [
  "contract.schedule.due_date",
  "contract.schedule.instalment",
  "contract.schedule.principal",
  "contract.schedule.interest",
];

// ---------------------------------------------------------------------------
// S1 — the field-path grammar (AC1, second half)
// ---------------------------------------------------------------------------

async function conforms(path) {
  const r = await rootQuery("select clara._field_path_conforms($1) as ok", [path]);
  return r.rows[0].ok;
}

test("S1 · every agreement field path conforms to the canonical grammar, and a typo'd namespace is still refused", async (t) => {
  if (unready(t)) return;

  for (const p of [...RUN_FIELDS, ...ROW_FIELDS]) {
    assert.equal(await conforms(p), true, `${p} must be a canonical field path`);
  }

  // The roster is still CLOSED: one namespace joined it, nothing else did. The refusal is the
  // grammar's own CLR10 / field_path_namespace, driven rather than asserted from the body text.
  await assert.rejects(
    () => rootQuery("select clara._field_path_conforms($1) as ok", ["contrakt.agreement.cash_price"]),
    (err) => {
      assert.equal(err.code, "CLR10");
      assert.equal(JSON.parse(err.detail).reason, "field_path_namespace");
      return true;
    },
    "a typo'd namespace is refused by the grammar, not admitted",
  );

  // …and the namespace is the FACT FAMILY, not the document kind: `agreement_contract` is not a
  // namespace and must not become one.
  await assert.rejects(
    () => rootQuery("select clara._field_path_conforms($1) as ok", ["agreement_contract.cash_price"]),
    (err) => err.code === "CLR10",
    "the document kind is not a namespace",
  );

  // The neighbour namespaces every earlier lane registered are untouched.
  for (const p of ["invoice.total", "payroll.run.gross_pay", "statement.period_start"]) {
    assert.equal(await conforms(p), true, `${p} still conforms — 0299 recuts the roster on nobody`);
  }
});
