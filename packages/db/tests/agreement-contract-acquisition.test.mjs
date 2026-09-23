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
import { rootQuery, ensureReady, endPool, buildWorld } from "./rig-fixtures.mjs";
import { firmOf, filedDocument, seedExtraction, seedRegion, enqueueInvoiceFacts, docTasks, claimTask } from "./a21-helpers.mjs";
import { consentEvidenceDoc, grantPurpose, activatePurpose } from "./wave-b/wb-0020-helpers.mjs";

let ready = false;
let world = null;

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
  world = await buildWorld();
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

// ---------------------------------------------------------------------------
// S3 — the deterministic evaluator (AC2)
// ---------------------------------------------------------------------------

/** The same document read twice, agreeing — the shape the persist door admits. */
function bothChannels(opts = {}) {
  return [envelope({ ...opts, channel: "text" }), envelope({ ...opts, channel: "vision" })];
}

async function evaluate(textEnv, visionEnv) {
  const r = await rootQuery("select clara.evaluate_agreement_contract_state_v1($1::jsonb, $2::jsonb) as state", [
    JSON.stringify(textEnv),
    JSON.stringify(visionEnv),
  ]);
  return r.rows[0].state;
}

const cents = (v) => (v === null || v === undefined ? v : Number(v));

test("S3a · a hire-purchase agreement with a printed schedule: every question established, the price identity holds, the schedule reconciles", async (t) => {
  if (unready(t)) return;

  const state = await evaluate(...bothChannels());

  assert.equal(state.state_version, "v1");
  assert.equal(state.agreement_class, "hire_purchase", "read off what the page calls itself");
  assert.equal(state.financing, true);
  assert.equal(state.class_basis, "printed_kind_matched:HIRE PURCHASE");

  assert.deepEqual(state.disagreed, [], "nothing disagrees on a clean read");
  assert.deepEqual(state.missing, [], "…and the page prints every question");
  assert.equal(state.established.length, RUN_FIELDS.length, "all eleven established");

  // The figures, by hand from the worked example.
  assert.equal(cents(state.facts["contract.agreement.cash_price"].printed_cents), 12000000);
  assert.equal(cents(state.facts["contract.agreement.deposit"].printed_cents), 2000000);
  assert.equal(cents(state.facts["contract.agreement.amount_financed"].printed_cents), 10000000);
  assert.equal(cents(state.facts["contract.agreement.total_charges"].printed_cents), 840000);
  assert.equal(cents(state.facts["contract.agreement.total_payable"].printed_cents), 10840000);

  // The three summable questions carry the schedule's own column sums and agree with them.
  assert.equal(cents(state.facts["contract.agreement.amount_financed"].computed_cents), 10000000);
  assert.equal(cents(state.facts["contract.agreement.total_charges"].computed_cents), 840000);
  assert.equal(cents(state.facts["contract.agreement.total_payable"].computed_cents), 10840000);
  for (const f of [
    "contract.agreement.amount_financed",
    "contract.agreement.total_charges",
    "contract.agreement.total_payable",
  ]) {
    assert.equal(state.facts[f].basis, "printed_total_agrees_row_sum", `${f} was cross-checked`);
  }
  // The questions with no schedule counterpart say so rather than carrying a null silently.
  assert.equal(state.facts["contract.agreement.cash_price"].basis, "printed_total_no_row_counterpart");
  assert.equal(cents(state.facts["contract.agreement.cash_price"].computed_cents), null);

  // The rows.
  assert.equal(state.rows.text, 3);
  assert.equal(state.rows.vision, 3);
  assert.equal(state.rows.agreed, 3);
  assert.equal(state.rows.balanced, 3);
  assert.deepEqual(state.rows.contested, []);
  assert.deepEqual(state.rows.unbalanced, []);
  assert.deepEqual(state.rows.unchecked, []);

  // AC2's two named checks.
  assert.equal(state.checks.price_identity.state, "holds");
  assert.equal(cents(state.checks.price_identity.difference_cents), 0);
  assert.equal(state.checks.schedule_reconciles.state, "holds");
  assert.equal(cents(state.checks.schedule_reconciles.instalment_sum_cents), 10840000);
  assert.equal(cents(state.checks.schedule_reconciles.expected_cents), 10840000);

  // The non-monetary questions are renderings, never figures.
  assert.equal(state.facts["contract.agreement.financier"].printed_raw, "Maybank Islamic Berhad");
  assert.equal(cents(state.facts["contract.agreement.financier"].printed_cents), null);
  assert.equal(state.facts["contract.agreement.term_months"].printed_raw, "36");
  assert.equal(cents(state.facts["contract.agreement.term_months"].printed_cents), null);
});

test("S3b · an agreement WITHOUT a printed schedule is still fully read: the unprinted lines say so, and the reconciliation is not checkable", async (t) => {
  if (unready(t)) return;

  const state = await evaluate(
    ...bothChannels({
      answers: {
        "contract.agreement.total_charges": notPrinted(),
        "contract.agreement.total_payable": notPrinted(),
        "contract.agreement.instalment_amount": notPrinted(),
      },
      rows: [],
    }),
  );

  assert.equal(state.agreement_class, "hire_purchase");
  assert.deepEqual(state.missing.sort(), [
    "contract.agreement.instalment_amount",
    "contract.agreement.total_charges",
    "contract.agreement.total_payable",
  ]);
  assert.deepEqual(state.disagreed, []);
  assert.equal(state.facts["contract.agreement.total_charges"].state, "not_printed");
  assert.equal(cents(state.facts["contract.agreement.total_charges"].printed_cents), null);
  assert.equal(cents(state.facts["contract.agreement.total_charges"].computed_cents), null);

  // The acquisition figures still stand, so the price identity still holds — which is what makes
  // a schedule-less agreement postable at all.
  assert.equal(state.checks.price_identity.state, "holds");
  assert.equal(state.checks.schedule_reconciles.state, "not_checkable");
  assert.equal(state.checks.schedule_reconciles.reason, "no_printed_schedule");
  assert.equal(state.rows.agreed, 0);
});

test("S3c · deposit plus financed that does not equal the cash price is a NAMED failure carrying all three figures", async (t) => {
  if (unready(t)) return;

  // 20,000.00 + 100,000.00 = 120,000.00, but the page prints a cash price of 125,000.00.
  const state = await evaluate(...bothChannels({ answers: { "contract.agreement.cash_price": value("125,000.00") } }));

  assert.equal(state.checks.price_identity.state, "fails");
  assert.equal(state.checks.price_identity.reason, "deposit_plus_financed_differs_from_cash_price");
  assert.equal(cents(state.checks.price_identity.cash_price_cents), 12500000);
  assert.equal(cents(state.checks.price_identity.deposit_cents), 2000000);
  assert.equal(cents(state.checks.price_identity.financed_cents), 10000000);
  assert.equal(cents(state.checks.price_identity.difference_cents), 500000);

  // The individual questions are still ESTABLISHED — the page printed them, and the failure is a
  // relationship between them, not a doubt about any one of them.
  assert.equal(state.facts["contract.agreement.cash_price"].state, "established");
  assert.equal(state.facts["contract.agreement.deposit"].state, "established");
});

test("S3d · a schedule row whose principal and interest do not make its instalment stops every column summing", async (t) => {
  if (unready(t)) return;

  const rows = SCHEDULE();
  rows[1].cells["contract.schedule.interest"] = value("2,999.00"); // 35,000.00 + 2,999.00 <> 38,000.00
  const state = await evaluate(...bothChannels({ rows }));

  assert.deepEqual(state.rows.unbalanced, [2], "row 2 fails its own identity");
  assert.equal(state.rows.balanced, 2);
  for (const f of [
    "contract.agreement.amount_financed",
    "contract.agreement.total_charges",
    "contract.agreement.total_payable",
  ]) {
    assert.equal(state.facts[f].state, "rows_unbalanced", `${f} does not sum over a page that contradicts itself`);
    assert.equal(state.facts[f].reason, "row_identity_failed");
  }
  // A question with no schedule counterpart is unaffected — the cash price is printed once and
  // no row speaks to it.
  assert.equal(state.facts["contract.agreement.cash_price"].state, "established");
  assert.equal(state.checks.schedule_reconciles.state, "not_checkable");
  assert.equal(state.checks.schedule_reconciles.reason, "rows_not_summable");
});

test("S3e · a printed total the schedule contradicts is a totals mismatch, not a silent re-sum", async (t) => {
  if (unready(t)) return;

  // The schedule still sums to 108,400.00; the page's own total payable says 109,000.00.
  const state = await evaluate(...bothChannels({ answers: { "contract.agreement.total_payable": value("109,000.00") } }));

  assert.equal(state.facts["contract.agreement.total_payable"].state, "totals_mismatch");
  assert.equal(state.facts["contract.agreement.total_payable"].reason, "printed_total_disagrees_row_sum");
  assert.equal(cents(state.facts["contract.agreement.total_payable"].printed_cents), 10900000);
  assert.equal(cents(state.facts["contract.agreement.total_payable"].computed_cents), 10840000);
  assert.equal(state.facts["contract.agreement.amount_financed"].state, "established", "its neighbours are unaffected");

  // The brief's OWN reconciliation is instalments vs financed-plus-charges, and total_payable is
  // not one of its terms — so it still holds here, and the contradiction is caught once, by the
  // cross-check above, rather than twice under two names. (The unattended gate's
  // `arithmetic_holds` rung reads the per-question state, so this page does not post.)
  assert.equal(state.checks.schedule_reconciles.state, "holds");

  // A page whose instalments genuinely do not add up to financed plus charges fails the named
  // check by name.
  const rows = SCHEDULE();
  rows[0].cells["contract.schedule.instalment"] = value("43,900.00");
  rows[0].cells["contract.schedule.interest"] = value("3,900.00"); // the row identity still holds
  const broken = await evaluate(...bothChannels({ rows }));
  assert.equal(broken.rows.unbalanced.length, 0, "every row still balances on its own terms");
  assert.equal(broken.checks.schedule_reconciles.state, "fails");
  assert.equal(broken.checks.schedule_reconciles.reason, "instalments_do_not_reconcile_to_financed_plus_charges");
  assert.equal(cents(broken.checks.schedule_reconciles.instalment_sum_cents), 10890000);
  assert.equal(cents(broken.checks.schedule_reconciles.expected_cents), 10840000);
});

test("S3f · the two channels reading one question differently is a disagreement, and a row they read differently contests every sum", async (t) => {
  if (unready(t)) return;

  const textEnv = envelope({ channel: "text" });
  const visionEnv = envelope({ channel: "vision", answers: { "contract.agreement.deposit": value("2,000.00") } });
  let state = await evaluate(textEnv, visionEnv);
  assert.equal(state.facts["contract.agreement.deposit"].state, "channels_disagree");
  assert.equal(state.facts["contract.agreement.deposit"].text_raw, "20,000.00");
  assert.equal(state.facts["contract.agreement.deposit"].vision_raw, "2,000.00");
  assert.equal(cents(state.facts["contract.agreement.deposit"].printed_cents), null);
  assert.equal(state.checks.price_identity.state, "not_checkable");
  assert.equal(state.checks.price_identity.reason, "deposit_not_established");

  // "1,000.00" and "1000.00" are the same figure read twice — typography is not a disagreement.
  const spaced = envelope({ channel: "vision", answers: { "contract.agreement.cash_price": value("RM 120000.00") } });
  state = await evaluate(textEnv, spaced);
  assert.equal(state.facts["contract.agreement.cash_price"].state, "established", "compared on the FIGURE");

  // A schedule row the two channels read differently contests every column sum: a partial sum is
  // a figure no page states.
  const visionRows = SCHEDULE();
  visionRows[2].cells["contract.schedule.principal"] = value("25,500.00");
  state = await evaluate(textEnv, envelope({ channel: "vision", rows: visionRows }));
  assert.deepEqual(state.rows.contested, [3]);
  assert.equal(state.facts["contract.agreement.amount_financed"].state, "rows_contested");
  assert.equal(state.checks.schedule_reconciles.state, "not_checkable");
});

test("S3g · a rendering that is not a figure is unreadable, reported verbatim, never guessed", async (t) => {
  if (unready(t)) return;

  const state = await evaluate(...bothChannels({ answers: { "contract.agreement.deposit": value("Trade-in vehicle") } }));
  assert.equal(state.facts["contract.agreement.deposit"].state, "unreadable");
  assert.equal(state.facts["contract.agreement.deposit"].reason, "rendering_is_not_a_figure");
  assert.equal(state.facts["contract.agreement.deposit"].printed_raw, "Trade-in vehicle");
  assert.equal(cents(state.facts["contract.agreement.deposit"].printed_cents), null);
  assert.equal(state.checks.price_identity.state, "not_checkable");
});

test("S3h · the evaluator says which agreement it read, and never guesses a page into a financing class", async (t) => {
  if (unready(t)) return;

  const cases = [
    ["Hire Purchase Agreement", "hire_purchase", true],
    ["PERJANJIAN SEWA BELI", "hire_purchase", true],
    ["Master Finance Lease Agreement", "finance_lease", true],
    ["Capital Lease Schedule 3", "finance_lease", true],
    ["Tenancy Agreement", "tenancy", false],
    ["Operating Lease Agreement", "operating_lease", false],
    ["Supply Agreement", "supply", false],
    ["Memorandum of Understanding", "other", false],
  ];
  for (const [raw, klass, financing] of cases) {
    const state = await evaluate(...bothChannels({ answers: { "contract.agreement.kind": value(raw) } }));
    assert.equal(state.agreement_class, klass, `"${raw}" reads as ${klass}`);
    assert.equal(state.financing, financing, `"${raw}" financing=${financing}`);
  }

  // A page that does not say what it is is NOT guessed into a class.
  let state = await evaluate(...bothChannels({ answers: { "contract.agreement.kind": notPrinted() } }));
  assert.equal(state.agreement_class, "not_established");
  assert.equal(state.financing, false);
  assert.equal(state.class_basis, "kind_not_established");

  // Neither is a page the two channels read differently.
  state = await evaluate(
    envelope({ channel: "text" }),
    envelope({ channel: "vision", answers: { "contract.agreement.kind": value("Tenancy Agreement") } }),
  );
  assert.equal(state.agreement_class, "not_established");
  assert.equal(state.class_basis, "kind_not_established");
});

test("S3i · a malformed pair is a typed refusal, not an exception", async (t) => {
  if (unready(t)) return;

  const r = await rootQuery(
    "select clara.evaluate_agreement_contract_state_v1($1::jsonb, $2::jsonb) as state",
    [JSON.stringify({ contract: { channel: "text" } }), JSON.stringify(envelope({ channel: "vision" }))],
  );
  assert.equal(r.rows[0].state.refusal, "agreement_envelope_malformed");
});

test("S3j · the evaluator's registered closure is exactly one member, and it calls nobody", async (t) => {
  if (unready(t)) return;

  const ver = (
    await rootQuery(
      `select ev.id, ev.entrypoint_signature, ev.migration_version, ev.deployed
         from clara.evaluator_versions ev
        where ev.evaluator_name = 'evaluate_agreement_contract_state' and ev.version = 1`,
    )
  ).rows;
  assert.equal(ver.length, 1, "registered in the same migration that creates it");
  assert.equal(ver[0].entrypoint_signature, "clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)");
  assert.equal(ver[0].migration_version, "0299_agreement_contract_acquisition");
  assert.equal(ver[0].deployed, false, "the deploy flip is a ceremony act, never a migration's");

  const members = (
    await rootQuery("select member_signature from clara.evaluator_version_members where evaluator_version_id = $1", [
      ver[0].id,
    ])
  ).rows;
  assert.deepEqual(
    members.map((m) => m.member_signature),
    ["clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)"],
    "ONE member: an N-member registration is N bodies a later lane could never recut",
  );

  // …and that is structural, not stylistic: the body reaches for no other clara function.
  const src = (
    await rootQuery(
      "select prosrc from pg_proc where oid = 'clara.evaluate_agreement_contract_state_v1(jsonb,jsonb)'::regprocedure",
    )
  ).rows[0].prosrc;
  const calls = src.match(/clara\.[a-z_][a-z0-9_]*\s*\(/gi) ?? [];
  assert.deepEqual(calls, [], `the evaluator calls no clara function: ${JSON.stringify(calls)}`);
});

// ---------------------------------------------------------------------------
// S4 — the facts router (AC3's other half: the registry's `stored_only` verdict was DERIVED
//      from this dead end, so removing the dead end and re-deriving the registry are one change)
// ---------------------------------------------------------------------------

async function hasWitnessConsent(client) {
  const r = await rootQuery(
    `select exists(select 1 from clara.client_egress_purpose_activations a
        join clara.client_egress_purpose_consents c
          on c.id=a.consent_id and c.firm_id=a.firm_id and c.client_id=a.client_id and c.purpose=a.purpose
       where a.client_id=$1 and a.purpose='witness_extraction'
         and a.deactivated_at is null and c.revoked_at is null) as live`,
    [client],
  );
  return r.rows[0].live === true;
}

/** A FILED agreement-contract pdf with a done OCR extraction and one cited region, born through
 *  the real doors. The consent is granted BEFORE the document is filed, deliberately:
 *  `file_document` runs the facts enqueue itself, so granting afterwards would leave a
 *  pre-consent gate receipt on the trail beside the live task. */
async function agreementDoc(client, { consent = true } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  if (consent && !(await hasWitnessConsent(client))) {
    const evidence = await consentEvidenceDoc(sub, { firm });
    const grant = await grantPurpose(sub, { client, purpose: "witness_extraction", evidenceDocument: evidence.documentId });
    await activatePurpose(sub, { client, purpose: "witness_extraction", consent: grant.consent_id });
  }
  const doc = await filedDocument(sub, { firm, client, kind: "agreement_contract" });
  const extractionId = await seedExtraction({ firm, document: doc.documentId, engineKind: "ocr", status: "done" });
  const regionId = await seedRegion({
    firm, extraction: extractionId, fieldPath: "contract.agreement.cash_price", textContent: "120,000.00",
  });
  return { ...doc, extractionId, regionId };
}

test("S4 · an agreement_contract pdf stops terminating as skipped_kind and enters its own lane", async (t) => {
  if (unready(t)) return;

  const doc = await agreementDoc(world.clients.A1);
  const receipt = await enqueueInvoiceFacts(doc.documentId);
  assert.equal(receipt.status, "queued", `the router admits the document: ${JSON.stringify(receipt)}`);

  const tasks = await docTasks(doc.documentId);
  assert.equal(
    tasks.filter((x) => x.error_code === "skipped_kind").length,
    0,
    "no skipped_kind receipt is left anywhere on the trail — the dead end is gone, not merely bypassed",
  );
  const lane = tasks.filter((x) => x.lane === "contract_facts");
  assert.equal(
    lane.length,
    1,
    `exactly one contract_facts task: ${JSON.stringify(tasks.map((x) => `${x.lane}/${x.status}/${x.error_code}`))}`,
  );
  assert.equal(lane[0].status, "queued", "the task is LIVE, not a consent refusal in disguise");
  assert.match(lane[0].engine_id, /^llm-/, "the contract lane is an LLM witness-pair lane, and its engine identity says so");
  assert.equal(
    tasks.filter((x) => x.lane === "invoice_facts" || x.lane === "llm_witness" || x.lane === "payroll_facts").length,
    0,
    "an agreement contract never enters another family's lane — this widens the estate, it does not reroute anybody",
  );

  const again = await enqueueInvoiceFacts(doc.documentId);
  assert.equal(again.status, "queued");
  assert.equal(
    (await docTasks(doc.documentId)).filter((x) => x.lane === "contract_facts").length,
    1,
    "a re-fire finds the in-flight task; it never mints a second one",
  );
});

test("S4 · the contract lane holds the SAME enqueue-time typed-consent gate the witness lanes hold", async (t) => {
  if (unready(t)) return;

  // A client with no live witness_extraction activation: the read is refused BEFORE a task is
  // ever runnable, and the refusal is a terminal never-claimed receipt, never a raise (the router
  // runs inside file_document, and a raise would abort an unrelated filing transaction).
  const doc = await agreementDoc(world.clients.A2, { consent: false });
  const receipt = await enqueueInvoiceFacts(doc.documentId);
  assert.equal(receipt.status, "failed");
  assert.equal(receipt.reason, "agreement_consent_inactive");

  const lane = (await docTasks(doc.documentId)).filter((x) => x.lane === "contract_facts");
  assert.equal(lane.length, 1);
  assert.equal(lane[0].status, "failed");
  assert.equal(lane[0].error_code, "agreement_consent_inactive");
  assert.equal(lane[0].attempt_count, 0, "a gate verdict consumes no attempts");
  assert.equal(lane[0].started_at, null, "…and was never claimed");
});

test("S4 · every other kind's route through the recut router is unchanged", async (t) => {
  if (unready(t)) return;

  const sub = world.users.alice;
  const client = world.clients.A1;
  const firm = await firmOf(client);

  const inv = await filedDocument(sub, { firm, client, kind: "invoice" });
  await seedExtraction({ firm, document: inv.documentId, engineKind: "ocr", status: "done" });
  await enqueueInvoiceFacts(inv.documentId);
  const invTasks = await docTasks(inv.documentId);
  assert.equal(invTasks.filter((x) => x.lane === "llm_witness").length, 1, "an invoice still rides llm_witness");
  assert.equal(invTasks.filter((x) => x.lane === "contract_facts").length, 0);

  // A kind with no reader still terminates cleanly as skipped_kind: this file widened the router
  // by ONE arm and removed nobody else's dead end.
  const other = await filedDocument(sub, { firm, client, kind: "tax_correspondence" });
  await seedExtraction({ firm, document: other.documentId, engineKind: "ocr", status: "done" });
  const otherReceipt = await enqueueInvoiceFacts(other.documentId);
  assert.equal(otherReceipt.status, "skipped_kind", "the skipped_kind arm still serves every kind with no reader");
});

// ---------------------------------------------------------------------------
// S5 — the persist door (AC1's banked read)
// ---------------------------------------------------------------------------

/** Drive an agreement contract all the way to a CLAIMED, running task through the real doors,
 *  and hand back everything the persist call needs. */
async function runningAgreementTask(client) {
  const doc = await agreementDoc(client);
  await enqueueInvoiceFacts(doc.documentId);
  const task = (
    await rootQuery(
      "select id from clara.document_processing_tasks where document_id=$1 and lane='contract_facts' and status='queued' order by version_n desc limit 1",
      [doc.documentId],
    )
  ).rows[0];
  assert.ok(task, "mandatory setup: the router queued a contract_facts task");
  const claimed = await claimTask(task.id, { egressApproved: true });
  assert.equal(claimed.status, "running", `mandatory setup: the task is claimable (got ${JSON.stringify(claimed)})`);
  const sha = (await rootQuery("select sha256 from clara.documents where id=$1", [doc.documentId])).rows[0].sha256;
  return { ...doc, taskId: task.id, sha };
}

function call(env, { pin, promptHash, citations = [] }) {
  return { input_pin: pin, prompt_hash: promptHash, envelope: env, citations };
}

async function persist(taskId, textCall, visionCall, pages = 1) {
  const r = await rootQuery("select clara.persist_agreement_facts($1,$2::jsonb,$3::jsonb,$4) as receipt", [
    taskId, JSON.stringify(textCall), JSON.stringify(visionCall), pages,
  ]);
  return r.rows[0].receipt;
}

const regionsOf = async (documentId) => (
  await rootQuery(
    `select r.field_path, r.text_content, r.monetary_raw, r.monetary_cents, r.locator, e.engine_kind
       from clara.document_regions r
       join clara.document_extractions e on e.id = r.extraction_id
      where e.document_id = $1
        and e.engine_kind in ('agreement_text_facts','agreement_vision_facts')
      order by r.field_path`,
    [documentId],
  )
).rows;

test("S5 · the agreement's typed terms land as regions, an unprinted term says so, and the read replays idempotently", async (t) => {
  if (unready(t)) return;

  const doc = await runningAgreementTask(world.clients.A1);
  // A page that prints no repayment schedule prints no charges either — the reading a real
  // one-page hire-purchase letter produces.
  const answers = { "contract.agreement.total_charges": notPrinted() };
  const [textEnv, visionEnv] = bothChannels({ answers });

  const receipt = await persist(
    doc.taskId,
    call(textEnv, { pin: doc.extractionId, promptHash: "agreement-text-v1",
      citations: [{ field_path: "contract.agreement.cash_price", region_idx: 1 }] }),
    call(visionEnv, { pin: doc.sha, promptHash: "agreement-vision-v1" }),
  );
  assert.equal(receipt.status, "done");
  assert.equal(receipt.replayed, false);

  const regions = await regionsOf(doc.documentId);
  assert.equal(regions.length, RUN_FIELDS.length,
    `one region per run-level question, answered or not: ${JSON.stringify(regions.map((r) => r.field_path))}`);
  for (const r of regions) {
    assert.equal(r.engine_kind, "agreement_text_facts", "every fact hangs off the CANONICAL text row of the pair");
  }

  const price = regions.find((r) => r.field_path === "contract.agreement.cash_price");
  assert.equal(price.monetary_cents, "12000000", "the printed cash price, as the DB's own integer");
  assert.equal(price.monetary_raw, "120,000.00", "…beside the verbatim rendering the page carries");
  assert.equal(price.text_content, "120,000.00");
  assert.equal(
    price.locator.source_region_id,
    doc.regionId,
    "…resolved through the estate's ONE citation numbering, so a person can click the figure and see the page",
  );

  const charges = regions.find((r) => r.field_path === "contract.agreement.total_charges");
  assert.ok(charges, "an UNPRINTED term still lands as a fact — silence is a reading, not an absence");
  assert.equal(charges.monetary_cents, null, "…carrying NO figure at all, which is what `not printed` means");
  assert.equal(charges.monetary_raw, null);
  assert.equal(charges.text_content, null, "…never the string '0' and never a zero cents value");

  // The five NON-monetary questions land as text and carry no monetary columns at all: a name,
  // a date, a prose description and a count are not money.
  for (const f of ["contract.agreement.kind", "contract.agreement.financier",
    "contract.agreement.agreement_date", "contract.agreement.asset_description",
    "contract.agreement.term_months"]) {
    const r = regions.find((x) => x.field_path === f);
    assert.equal(r.text_content, PRINTED[f].raw, `${f} lands as its verbatim rendering`);
    assert.equal(r.monetary_cents, null, `${f} is not money and carries no cents`);
    assert.equal(r.monetary_raw, null, `${f} is not money and carries no monetary rendering`);
  }

  // The pair is banked under its OWN engine kinds, so clara._invoice_fact_state can never
  // resolve an agreement envelope as an invoice corroboration.
  const kinds = (
    await rootQuery(
      "select engine_kind from clara.document_extractions where document_id=$1 order by engine_kind",
      [doc.documentId],
    )
  ).rows.map((k) => k.engine_kind);
  assert.deepEqual(
    kinds.sort(),
    ["agreement_text_facts", "agreement_vision_facts", "ocr"],
    "the OCR row the read was pinned to, plus the agreement pair under its own two kinds",
  );

  // The fact state rides with the text row: what the evaluator decided at the one moment both
  // envelopes existed, banked beside the answers it judged.
  const banked = (
    await rootQuery(
      "select envelope from clara.document_extractions where document_id=$1 and engine_kind='agreement_text_facts'",
      [doc.documentId],
    )
  ).rows[0].envelope;
  assert.equal(banked.contract_state.agreement_class, "hire_purchase");
  assert.equal(banked.contract_state.state_version, "v1");
  assert.equal(banked.contract.channel, "text");
  assert.equal(Object.keys(banked.contract.answers).length, RUN_FIELDS.length);
  assert.equal(banked.contract.rows.length, 3, "the PRINTED repayment schedule is part of what the page says");

  // Idempotent replay: a worker that re-settles a done task gets the stored receipt back and
  // banks nothing a second time.
  const replay = await persist(
    doc.taskId,
    call(textEnv, { pin: doc.extractionId, promptHash: "agreement-text-v1" }),
    call(visionEnv, { pin: doc.sha, promptHash: "agreement-vision-v1" }),
  );
  assert.equal(replay.replayed, true);
  assert.equal((await regionsOf(doc.documentId)).length, RUN_FIELDS.length, "a replay writes no second set of facts");
});

test("S5 · the door refuses a structurally malformed read at the write boundary, and banks a DISAGREEING one in full", async (t) => {
  if (unready(t)) return;

  // (a) A broken vocabulary is refused before anything is inserted.
  const a = await runningAgreementTask(world.clients.A1);
  const [okText, okVision] = bothChannels();
  const broken = envelope({ drop: ["contract.agreement.total_payable"] });
  await assert.rejects(
    () => persist(a.taskId, call(broken, { pin: a.extractionId, promptHash: "t" }),
      call(okVision, { pin: a.sha, promptHash: "v" })),
    /vocabulary|malformed/i,
    "a question the read did not answer is a refusal, not a silent `not_printed`",
  );
  assert.equal((await regionsOf(a.documentId)).length, 0, "…and nothing at all was written");

  // (b) ONE prompt used twice is one reading twice, not two readings.
  await assert.rejects(
    () => persist(a.taskId, call(okText, { pin: a.extractionId, promptHash: "same" }),
      call(okVision, { pin: a.sha, promptHash: "same" })),
    /prompt hash/i,
    "the independence receipt requires distinct prompts",
  );

  // (c) A pin that does not resolve to a done OCR extraction of THIS document.
  await assert.rejects(
    () => persist(a.taskId, call(okText, { pin: a.documentId, promptHash: "t" }),
      call(okVision, { pin: a.sha, promptHash: "v" })),
    /input pin/i,
    "the text channel's pin must resolve to this document's own done OCR extraction",
  );

  // (d) A WELL-FORMED read whose two channels disagree is banked IN FULL, with the disagreement
  //     named in the state — a person cannot adjudicate a reading they cannot see.
  const b = await runningAgreementTask(world.clients.A2);
  const visionDiffers = envelope({ channel: "vision", answers: { "contract.agreement.deposit": value("25,000.00") } });
  const receipt = await persist(
    b.taskId,
    call(okText, { pin: b.extractionId, promptHash: "agreement-text-v1" }),
    call(visionDiffers, { pin: b.sha, promptHash: "agreement-vision-v1" }),
  );
  assert.equal(receipt.status, "done", "a read that disagrees with itself is still a read");
  const state = (
    await rootQuery(
      "select envelope->'contract_state' as s from clara.document_extractions where document_id=$1 and engine_kind='agreement_text_facts'",
      [b.documentId],
    )
  ).rows[0].s;
  assert.deepEqual(state.disagreed, ["contract.agreement.deposit"]);
  assert.equal(state.checks.price_identity.state, "not_checkable");
  assert.equal(state.checks.price_identity.reason, "deposit_not_established");
  assert.equal((await regionsOf(b.documentId)).length, RUN_FIELDS.length, "every question still banks a fact");
  const dep = (await regionsOf(b.documentId)).find((r) => r.field_path === "contract.agreement.deposit");
  assert.equal(dep.monetary_raw, "20,000.00", "the TEXT channel's rendering, which is the one that can cite a region");
  assert.equal(dep.monetary_cents, null, "…and no integer, because there is no figure both readings support");

  // Every refusal above left task `a` exactly as it found it — running, unclaimed by any write.
  // Settle it so a cell that is finished with a task does not hold this firm's per-lane
  // concurrency window open for the next one.
  assert.equal(
    (await rootQuery("select status from clara.document_processing_tasks where id=$1", [a.taskId])).rows[0].status,
    "running",
    "a refusal at the write boundary never settles the task it refused",
  );
  await rootQuery("select clara.fail_agreement_facts($1,$2)", [a.taskId, "internal"]);
});

test("S5 · fail_agreement_facts settles a running task terminally, under the lane's own code vocabulary", async (t) => {
  if (unready(t)) return;

  const doc = await runningAgreementTask(world.clients.A1);
  const r = await rootQuery("select clara.fail_agreement_facts($1,$2) as receipt", [doc.taskId, "corrupt"]);
  assert.equal(r.rows[0].receipt.status, "failed");
  assert.equal(r.rows[0].receipt.reason, "corrupt");

  const again = await rootQuery("select clara.fail_agreement_facts($1,$2) as receipt", [doc.taskId, "corrupt"]);
  assert.equal(again.rows[0].receipt.replayed, true, "a re-settle of a failed task replays");

  // An unrecognised reason coerces to engine_error rather than widening the lane's vocabulary.
  const other = await runningAgreementTask(world.clients.A1);
  const coerced = await rootQuery("select clara.fail_agreement_facts($1,$2) as receipt", [other.taskId, "who_knows"]);
  assert.equal(coerced.rows[0].receipt.reason, "engine_error");

  const ev = await rootQuery(
    "select count(*)::int n from clara.domain_events where document_id=$1 and event_type='document.agreement_facts_failed'",
    [doc.documentId],
  );
  assert.equal(ev.rows[0].n, 1, "the lane's OWN failure twin, never the invoice lane's");
});

// ---------------------------------------------------------------------------
// S6 — the capability registry (AC3)
// ---------------------------------------------------------------------------

/** The SIX formats the router's pdf/image arm actually serves — a pdf and the five raster
 *  formats whose mime is image/*. Transcribed from the router's own mime test, not read back out
 *  of the registry. */
const AGREEMENT_READ_FORMATS = ["heic", "jpeg", "pdf", "png", "tiff", "webp"];

const capability = async (format, kind) =>
  (await rootQuery("select clara._document_capability($1,$2) as c", [format, kind])).rows[0].c;

test("S6 · the agreement contract's typed-facts axis stops being stored-only, and its reason sentence says what is read and what is posted", async (t) => {
  if (unready(t)) return;

  for (const format of AGREEMENT_READ_FORMATS) {
    const c = await capability(format, "agreement_contract");
    assert.equal(c.custody, "supported", `${format}: custody is unmoved by #948`);
    assert.equal(c.byte_extraction, "supported", `${format}: byte extraction is unmoved by #948`);
    assert.equal(c.typed_facts, "supported", `${format}: the pair now has a reader`);
    assert.equal(
      c.business_operation,
      "supported",
      `${format}: #948 is the reading AND the posting half in one file — Clara carries these typed facts into a posted acquisition, and the registry says so`,
    );
    assert.equal(
      /terminates this pair cleanly/.test(c.basis),
      false,
      `${format}: the reason sentence must not still describe the dead end #948 removed`,
    );
    assert.match(c.basis, /Typed facts are persisted with source regions by/,
      `${format}: the reason sentence names the engine that reads it`);
    assert.match(c.basis, /never/i, `${format}: …and still says what Clara will not do`);
    assert.equal(c.limits.agreement_non_financing, "accepted_limitation",
      `${format}: a tenancy or supply agreement creates no asset at signing — a permanent boundary, not a future build`);
    assert.equal(c.limits.agreement_non_financing_reason, "no_entry_exists_at_signing_for_a_non_financing_agreement");
    assert.equal(c.limits.agreement_asset_account, "accepted_limitation",
      `${format}: the asset account comes from the client's own enrolments, never from the prose the page prints`);
    assert.equal(c.limits.agreement_asset_account_reason, "resolved_from_client_enrolment_never_from_prose");
  }

  // The formats the router does NOT serve for this kind are untouched: a docx agreement has no
  // reader on this lane and the registry still says so.
  for (const format of ["csv", "tsv", "xlsx", "docx", "ofx"]) {
    const c = await capability(format, "agreement_contract");
    assert.equal(c.typed_facts, "stored_only",
      `${format}: the router's agreement arm is on the pdf/image branch only — this pair still has no reader`);
    assert.equal(c.business_operation, "stored_only", `${format}: …and drives nothing`);
    assert.equal(c.limits.agreement_non_financing, undefined,
      `${format}: a limit is only stated where the capability it bounds exists`);
  }
  const xml = await capability("xml", "agreement_contract");
  assert.equal(xml.typed_facts, "unsupported", "xml x agreement_contract is unmoved — the local lane reads MyInvois UBL only");
});

test("S6 · the registry re-publishes at ONE new version, and nobody else's row moved", async (t) => {
  if (unready(t)) return;

  const r = (
    await rootQuery(
      `select count(distinct registry_version)::int as versions, min(registry_version)::int as v,
              count(*)::int as rows from clara.document_capabilities`,
    )
  ).rows[0];
  assert.equal(r.versions, 1, "the registry publishes exactly one version — a re-derivation is whole or it is drift");
  assert.equal(r.v, 6, "…and it is 6 (0228 raised to 2, #782's 0245 to 3, a wave-2 file to 4, #945 to 5, #948 to 6)");
  assert.equal(r.rows, 240, "#948 inserts and deletes no registry row");

  const drift = (
    await rootQuery(
      `select count(*)::int as n from clara.document_capabilities c
         left join clara.document_capability_version_high_water h
           on h.format = c.format and h.document_kind = c.document_kind
        where h.format is null or h.registry_version is distinct from c.registry_version`,
    )
  ).rows[0].n;
  assert.equal(drift, 0, "the high-water mark rose with the registry, every pair, through #846's ordinary writer path");

  // Nothing but the six agreement_contract rows carries an agreement limit.
  const moved = (
    await rootQuery(
      `select format, document_kind from clara.document_capabilities
        where limits ? 'agreement_non_financing' order by format`,
    )
  ).rows;
  assert.deepEqual(moved.map((x) => x.format), AGREEMENT_READ_FORMATS);
  assert.deepEqual([...new Set(moved.map((x) => x.document_kind))], ["agreement_contract"]);

  // The payroll summary's own six rows are exactly where #945 left them: this file re-published
  // the registry's VERSION, it did not restate anybody else's verdict.
  const payroll = (
    await rootQuery(
      `select typed_facts, business_operation from clara.document_capabilities
        where document_kind='payroll_summary' and mime_type='application/pdf'`,
    )
  ).rows[0];
  assert.equal(payroll.typed_facts, "supported");
  assert.equal(payroll.business_operation, "stored_only",
    "#946 left the payroll pair's operation axis at stored_only; #948 does not widen another ticket's row");
});
