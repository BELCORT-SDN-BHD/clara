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

// ---------------------------------------------------------------------------
// S2 — the answer-vocabulary gate (AC1, first half)
// ---------------------------------------------------------------------------

const value = (raw) => ({ state: "value", raw });
const notPrinted = () => ({ state: "not_printed" });

/** The worked example, printed once here and used by every later cell. A hire-purchase
 *  agreement for a lorry: cash price 120,000.00, deposit 20,000.00, financed 100,000.00, total
 *  charges 8,400.00, total payable 108,400.00 over 36 months at 3,011.11 — figures checked BY
 *  HAND, never by re-running what the database runs (WORK-ORDER rule 4). */
const PRINTED = {
  "contract.agreement.kind": value("Hire Purchase Agreement"),
  "contract.agreement.financier": value("Maybank Islamic Berhad"),
  "contract.agreement.agreement_date": value("2026-03-14"),
  "contract.agreement.asset_description": value("Isuzu NLR77 3.0 lorry, chassis JAANLR77LP7100123"),
  "contract.agreement.cash_price": value("120,000.00"),
  "contract.agreement.deposit": value("20,000.00"),
  "contract.agreement.amount_financed": value("100,000.00"),
  "contract.agreement.total_charges": value("8,400.00"),
  "contract.agreement.total_payable": value("108,400.00"),
  "contract.agreement.term_months": value("36"),
  "contract.agreement.instalment_amount": value("3,011.11"),
};

function scheduleRow(rowNo, { due, instalment, principal, interest }) {
  return {
    row_no: rowNo,
    cells: {
      "contract.schedule.due_date": value(due),
      "contract.schedule.instalment": value(instalment),
      "contract.schedule.principal": value(principal),
      "contract.schedule.interest": value(interest),
    },
  };
}

/** A THREE-ROW printed schedule that reconciles to the worked example by hand:
 *    principal  40,000.00 + 35,000.00 + 25,000.00 = 100,000.00  (= amount financed)
 *    interest    3,400.00 +  3,000.00 +  2,000.00 =   8,400.00  (= total charges)
 *    instalment 43,400.00 + 38,000.00 + 27,000.00 = 108,400.00  (= total payable)
 *  and each row's own identity principal + interest = instalment holds. */
const SCHEDULE = () => [
  scheduleRow(1, { due: "2026-04-14", instalment: "43,400.00", principal: "40,000.00", interest: "3,400.00" }),
  scheduleRow(2, { due: "2026-05-14", instalment: "38,000.00", principal: "35,000.00", interest: "3,000.00" }),
  scheduleRow(3, { due: "2026-06-14", instalment: "27,000.00", principal: "25,000.00", interest: "2,000.00" }),
];

function envelope({ channel = "text", answers = {}, rows = null, drop = [] } = {}) {
  const a = {};
  for (const f of RUN_FIELDS) {
    if (drop.includes(f)) continue;
    a[f] = f in answers ? answers[f] : PRINTED[f];
  }
  return { contract: { channel, answers: a, rows: rows ?? SCHEDULE() } };
}

async function answersOk(env, channel) {
  const r = await rootQuery("select clara._agreement_answers_ok($1::jsonb, $2) as ok", [
    JSON.stringify(env),
    channel,
  ]);
  return r.rows[0].ok;
}

test("S2 · the agreement answer vocabulary is closed: every question answered, not_printed a first-class answer, an unknown key at any level refused", async (t) => {
  if (unready(t)) return;

  assert.equal(await answersOk(envelope(), "text"), true, "the printed shape is admitted");
  assert.equal(
    await answersOk(envelope({ channel: "vision" }), "vision"),
    true,
    "…on either channel, when the envelope's own channel matches the one claimed",
  );
  assert.equal(
    await answersOk(envelope({ channel: "vision" }), "text"),
    false,
    "the channel receipt is checked: an envelope that says `vision` is not a text reading",
  );

  // `not_printed` is an ANSWER, not an omission: an agreement with no printed schedule prints no
  // total charges and no instalment, and the questionnaire must be able to say so.
  assert.equal(
    await answersOk(
      envelope({
        answers: {
          "contract.agreement.total_charges": notPrinted(),
          "contract.agreement.instalment_amount": notPrinted(),
        },
        rows: [],
      }),
      "text",
    ),
    true,
    "a page that prints no charges and no schedule is a complete reading",
  );

  // HALF TWO: every one of the eleven is PRESENT. Each dropped in turn — the shape that would let
  // a silent omission pass for `not_printed`.
  for (const f of RUN_FIELDS) {
    assert.equal(await answersOk(envelope({ drop: [f] }), "text"), false, `dropping ${f} is a refusal`);
  }

  // HALF ONE: an unknown key, at all THREE levels.
  const extraRunAnswer = envelope();
  extraRunAnswer.contract.answers["contract.agreement.residual_value"] = value("1.00");
  assert.equal(await answersOk(extraRunAnswer, "text"), false, "an unknown run-level question is refused");

  const extraCell = envelope();
  extraCell.contract.rows[0].cells["contract.schedule.balance"] = value("60,000.00");
  assert.equal(await answersOk(extraCell, "text"), false, "an unknown schedule cell is refused");

  const extraMember = envelope();
  extraMember.contract.totals = { financed: "100,000.00" };
  assert.equal(
    await answersOk(extraMember, "text"),
    false,
    "the envelope itself is closed: a totals bag beside the answers is a computed figure travelling as a read",
  );

  // A row that does not answer all four cells cannot be reconciled and is refused outright.
  const shortRow = envelope();
  delete shortRow.contract.rows[1].cells["contract.schedule.interest"];
  assert.equal(await answersOk(shortRow, "text"), false, "an incomplete schedule row is refused");

  // Two rows at one printed instalment number would be double-counted by every column sum.
  const rows = SCHEDULE();
  rows[1].row_no = 1;
  assert.equal(await answersOk(envelope({ rows }), "text"), false, "a duplicated row_no is refused");

  // A blank rendering is not a reading, and there is no third state.
  const blank = envelope({ answers: { "contract.agreement.cash_price": { state: "value", raw: "   " } } });
  assert.equal(await answersOk(blank, "text"), false, "a blank rendering is refused");
  const thirdState = envelope({ answers: { "contract.agreement.deposit": { state: "unknown" } } });
  assert.equal(await answersOk(thirdState, "text"), false, "there is no third answer state");

  // Zero quoted rows is a legitimate reading (an agreement that prints no schedule), and the
  // envelope still has to carry the array.
  assert.equal(await answersOk(envelope({ rows: [] }), "text"), true, "zero schedule rows is admitted");
  const noRows = envelope();
  delete noRows.contract.rows;
  assert.equal(await answersOk(noRows, "text"), false, "a missing rows array is refused");
});
