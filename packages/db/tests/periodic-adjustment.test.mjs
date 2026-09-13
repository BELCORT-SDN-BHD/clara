// #643 — PERIODIC STOCK ADJUSTMENTS AND SUPPLIED PAYROLL/STATUTORY-OBLIGATION BOOKKEEPING.
//
// Frontier-gated on the `periodic_adjustments$` stem (and on #623's own stem for the Work verbs it
// drives), so `db-slice-frontiers` legs pinned below either migration skip cleanly.
//
// WHAT THIS FILE IS ABOUT. #643 asks that an accountant who SUPPLIES a period, an amount and a
// basis can complete a periodic stock adjustment or a payroll/statutory obligation, that the
// result lands in the right period and the right close check, and that all-zero proposals,
// overbroad scope, stale input, lost permission and a locked period refuse honestly. Those are
// claims about DATA, so every cell below reads the committed rows under the real least-privileged
// roles rather than trusting a verb's own answer.
//
// WHY EVERY POSITIVE FIXTURE RUNS UNDER A REAL `interactive_client` CREDENTIAL: #623's reason,
// unchanged. The whole point of this lane is that role, client, period, chart and the NEW account
// relationships are re-checked AT COMMIT under the initiator's LIVE authority.
//
// THE ONE STRUCTURAL CLAIM THE BATTERY LEANS ON, asserted in its own cells: the typed particulars
// NEVER travel in `basis`. The run echoes `basis` and nothing else; `clara.accounting_work`'s new
// frozen `adjustment_basis` column is what the posting core reads. So a periodic adjustment
// commits through the SAME `clara.wake_record_journal_entry` a documentless journal entry does,
// with no frozen workflow body touched — which is exactly why `pa.stock.happy` posts through that
// verb rather than through a new one.
//
// A REFUSAL MUST LEAVE NOTHING BEHIND, and all three halves are asserted every time: no journal
// rows, no committed receipt, and no `clara.periodic_adjustments` row.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount,
  claimWorkRun, mintClientObo, wakeRecordJournalEntry, freshWorkClient,
  WCHART, REASON, CLR, BUNDLE_DIGEST, assertPair, assertRaises,
  rootQuery, opk, workRow, receiptsForWork, entriesForClient, linesOf,
  entryCount, committedReceiptCount, AGENT_USER_ID,
  // #643
  gatePa, PA_REASON, PA_PURPOSE, PACHART, ensurePaChart, retireAdvance,
  stockAdjustment, payrollObligation, basisForStock, basisForPayroll,
  admitPeriodicAdjustmentWork, listPeriodicAdjustments, reverseEntry,
  adjustmentsForClient, adjustmentRow, adjustmentCount, entryFlags, entryLinksFor,
  seedFiscalYear,
} from "./periodic-adjustment-fixtures.mjs";

let world = null;
before(async () => {
  world = await buildWorkWorld();
  for (const [key, client] of [["A1", world.clients.A1], ["A2", world.clients.A2]]) {
    await ensurePaChart(world.users.alice, client, key);
  }
});
after(async () => {
  printLaneNotes("periodic-adjustment");
  printSkipCount("periodic-adjustment");
  await endPool();
});

const A1 = () => world.clients.A1;
const A2 = () => world.clients.A2;
const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

/** A dedicated client of firm A carrying BOTH charts — used wherever a cell makes an
 *  IRREVERSIBLE change (an append-only fiscal year, a retired enrolment). */
async function paClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensurePaChart(ALICE(), client, tag);
  return client;
}

/** Admit a periodic-adjustment Work, claim its run, and mint the credential the run would hold. */
async function armedPa({
  client = null, author = null, purpose = PA_PURPOSE.stock, adjustment = null, basis = null,
  sourceRefs = [], intentKey = null,
} = {}) {
  const cli = client ?? A1();
  const who = author ?? ALICE();
  const adj = adjustment ?? stockAdjustment();
  const b = basis ?? (purpose === PA_PURPOSE.stock ? basisForStock(adj) : basisForPayroll(adj));
  const work = await admitPeriodicAdjustmentWork({
    client: cli, author: who, purpose, adjustment: adj, basis: b, sourceRefs, intentKey,
  });
  await claimWorkRun({ task: work.task_id, runId: opk("pa-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: who, client: cli });
  return { ...work, cred, client: cli, author: who, basis: b, adjustment: adj, purpose };
}

const post = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, ...over,
});

/** A refusal leaves NOTHING behind: no entry, no committed receipt, no adjustment row. */
async function refusesPa(client, code, reason, fn, label) {
  const entries = await entryCount(client);
  const receipts = await committedReceiptCount(client);
  const adjustments = await adjustmentCount(client);
  const out = await assertPair(code, reason, fn, label);
  assert.equal(await entryCount(client), entries, `${label}: no journal row was written`);
  assert.equal(await committedReceiptCount(client), receipts, `${label}: no committed receipt`);
  assert.equal(await adjustmentCount(client), adjustments, `${label}: no periodic_adjustments row`);
  return out;
}

// ===========================================================================================
// 1 · The happy stock case — the whole journey, read from the committed rows.
// ===========================================================================================

test("pa.stock.happy an opening/closing count posts ONE marked entry, ONE receipt and ONE adjustment row", async (t) => {
  if (await gatePa(t)) return;
  const adj = stockAdjustment();               // 400000 -> 650000, a RM 2,500.00 rise
  const a = await armedPa({ adjustment: adj });
  const before = await entryCount(A1());

  assert.equal(a.logical_op_id, `work:${a.work_id}:periodic_stock_adjustment:1`,
    "stock.happy: the server-assigned identity NAMES the purpose (0178's `work:<id>:<purpose>:<n>` schema)");

  const out = await post(a);
  assert.equal(out.posted, true, "stock.happy: posted");
  assert.equal(out.replayed, false);
  assert.ok(out.entry_id && out.receipt_id && out.adjustment_id,
    "stock.happy: the answer names ALL THREE effects");
  assert.equal(await entryCount(A1()), before + 1, "stock.happy: exactly ONE new entry");

  // --- the ENTRY, and its marker -----------------------------------------------------------
  const entry = (await entriesForClient(A1())).find((e) => e.id === out.entry_id);
  assert.equal(entry.status, "approved");
  assert.equal(entry.origin, "agent");
  assert.equal(entry.maker_actor, AGENT_USER_ID);
  assert.equal(entry.checker_actor, AGENT_USER_ID);
  assert.equal(entry.posting_date, adj.period_end,
    "stock.happy: the EXACT supplied posting date, never a timezone-shifted one");
  const flags = await entryFlags(out.entry_id);
  assert.ok(flags && Object.prototype.hasOwnProperty.call(flags, "closing_stock"),
    "stock.happy: the posted entry carries the marker the close gate reads — this is the producer C-29 asks for");
  assert.equal(flags.closing_stock.period_end, adj.period_end,
    "stock.happy: …and the marker states the period it claims, on the entry's own face");
  assert.equal(flags.closing_stock.method, "opening_closing_count");

  // --- the LINES: the movement, in the direction the sign fixes ---------------------------
  const lines = await linesOf(out.entry_id);
  assert.equal(lines.length, 2, "stock.happy: exactly two lines");
  const inv = lines.find((l) => l.account_code === PACHART.inventory);
  const cost = lines.find((l) => l.account_code === PACHART.cost);
  assert.equal(String(inv.debit_cents), "250000", "stock.happy: EXACT minor units — a rise DEBITS inventory");
  assert.equal(String(cost.credit_cents), "250000", "stock.happy: …and CREDITS the cost account");

  // --- the RECEIPT --------------------------------------------------------------------------
  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts.length, 1, "stock.happy: ONE operation receipt");
  const r = receipts[0];
  assert.equal(r.outcome, "committed");
  assert.equal(r.purpose, PA_PURPOSE.stock,
    "stock.happy: the receipt's purpose is the WORK's purpose, not the literal journal_entry");
  assert.equal(r.on_behalf_of, ALICE(), "stock.happy: the human whose authority was rechecked");
  assert.equal(r.via_wake_kind, "interactive_client");
  assert.equal(r.bundle_digest, BUNDLE_DIGEST);
  assert.equal(r.effects.entry_id, out.entry_id);
  assert.equal(r.effects.adjustment_id, out.adjustment_id,
    "stock.happy: the receipt NAMES its adjustment, so a reader of the receipt can open the particulars");

  // --- the ADJUSTMENT ROW -------------------------------------------------------------------
  const rows = await adjustmentsForClient(A1());
  const row = rows.find((x) => x.id === out.adjustment_id);
  assert.ok(row, "stock.happy: the durable adjustment row exists");
  assert.equal(row.purpose, PA_PURPOSE.stock);
  assert.equal(row.work_id, a.work_id);
  assert.equal(row.logical_op_id, a.logical_op_id);
  assert.equal(row.entry_id, out.entry_id);
  assert.equal(row.receipt_id, out.receipt_id);
  assert.equal(String(row.amount_cents), "250000", "stock.happy: the EXACT signed movement");
  assert.equal(row.currency, "MYR");
  assert.equal(row.period_start_text, adj.period_start);
  assert.equal(row.period_end_text, adj.period_end);
  assert.equal(row.on_behalf_of, ALICE());
  assert.equal(row.recorded_by, AGENT_USER_ID);
  assert.equal(row.corrects_adjustment_id, null);
  assert.equal(row.corrected_by_adjustment_id, null);
  assert.equal(row.basis.opening_cents, 400000, "stock.happy: the counted figures are kept verbatim");
  assert.equal(row.basis.closing_cents, 650000);
  assert.equal(row.basis.count_reference, "STOCKTAKE-2026-12");

  // --- the WORK -----------------------------------------------------------------------------
  const w = await workRow(a.work_id);
  assert.equal(w.result.entry_id, out.entry_id, "stock.happy: the Work carries its outcome");
  assert.equal(w.result.receipt_id, out.receipt_id);
  assert.equal(w.result.adjustment_id, out.adjustment_id);
  assert.equal(w.purpose, PA_PURPOSE.stock);
  assert.ok(w.adjustment_basis, "stock.happy: the particulars live on the WORK ROW, never in `basis`");
  assert.equal(w.basis.lines.length, 2);
  assert.equal(w.basis.method, undefined,
    "stock.happy: …and the echoed basis carries NONE of them — the run never sees a particular");

  // --- the JOURNAL SURFACE reads the purpose through the existing door ----------------------
  const links = await entryLinksFor(BOB(), { client: A1(), entries: [out.entry_id] });
  const link = links.find((l) => l.entry_id === out.entry_id);
  assert.equal(link.purpose, PA_PURPOSE.stock,
    "stock.happy: clara.list_entry_links already projects `purpose`, so the journals surface now names this one");
  assert.equal(link.work_id, a.work_id);
  assert.equal(link.receipt_id, out.receipt_id);
});

test("pa.stock.replay the SAME identity + SAME basis returns the ORIGINAL effects, no second adjustment", async (t) => {
  if (await gatePa(t)) return;
  const a = await armedPa({ client: A2() });
  const first = await post(a);
  const entries = await entryCount(A2());
  const adjustments = await adjustmentCount(A2());
  const again = await post(a);
  assert.equal(again.replayed, true, "stock.replay: the reservation answers with the stored result");
  assert.equal(again.entry_id, first.entry_id);
  assert.equal(again.adjustment_id, first.adjustment_id);
  assert.equal(await entryCount(A2()), entries, "stock.replay: NO second entry");
  assert.equal(await adjustmentCount(A2()), adjustments, "stock.replay: NO second adjustment row");
});

test("pa.stock.explicit an explicit_adjustment with a NEGATIVE movement posts the mirrored pair", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("stockfall");
  const adj = stockAdjustment({
    method: "explicit_adjustment", adjustmentCents: -90000, countedAt: null, countReference: null,
    instruction: "The supervisor's written instruction: write the stock down by RM 900.00.",
  });
  const a = await armedPa({ client, adjustment: adj });
  const out = await post(a);
  const lines = await linesOf(out.entry_id);
  const inv = lines.find((l) => l.account_code === PACHART.inventory);
  const cost = lines.find((l) => l.account_code === PACHART.cost);
  assert.equal(String(inv.credit_cents), "90000", "stock.explicit: a FALL credits inventory");
  assert.equal(String(cost.debit_cents), "90000", "stock.explicit: …and debits the cost account");
  const row = await adjustmentRow(out.adjustment_id);
  assert.equal(String(row.amount_cents), "-90000",
    "stock.explicit: the stored movement is SIGNED — a count below opening is a real, negative fact");
  assert.equal(row.basis.opening_cents, null, "stock.explicit: an explicit movement carries no count");
});

// ===========================================================================================
// 2 · The payroll relationships.
// ===========================================================================================

test("pa.payroll.happy a supplied EPF obligation posts Dr expense / Cr statutory payable and records its source", async (t) => {
  if (await gatePa(t)) return;
  const adj = payrollObligation();
  const a = await armedPa({ purpose: PA_PURPOSE.payroll, adjustment: adj });
  const out = await post(a);
  const lines = await linesOf(out.entry_id);
  assert.equal(String(lines.find((l) => l.account_code === PACHART.payrollExpense).debit_cents), "130000");
  assert.equal(String(lines.find((l) => l.account_code === PACHART.liability).credit_cents), "130000");
  const row = await adjustmentRow(out.adjustment_id);
  assert.equal(row.purpose, PA_PURPOSE.payroll);
  assert.equal(row.basis.obligation_kind, "epf");
  assert.equal(row.basis.particulars_source,
    "Payroll summary for August 2026 supplied by the client's HR officer",
    "payroll.happy: WHERE the figures came from is stored verbatim — nothing is computed from a rate");
  assert.equal(String(row.amount_cents), "130000");
  const flags = await entryFlags(out.entry_id);
  assert.equal(flags.payroll_obligation.obligation_kind, "epf",
    "payroll.happy: the entry says on its face that it moved a statutory liability");
  const receipts = await receiptsForWork(a.work_id);
  assert.equal(receipts[0].purpose, PA_PURPOSE.payroll);
});

test("pa.payroll.relationships an advance account with NO live enrolment refuses CLR10 advance_not_enrolled", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("advance");
  const adj = payrollObligation({
    amountCents: 500000, advanceAccountCode: PACHART.advanceLoose,
    instruction: "Recover August's advance from the salary run.",
  });
  const basis = basisForPayroll(adj, { creditSplit: { advance: 120000 } });
  const entries = await entryCount(client);
  const receipts = await committedReceiptCount(client);

  // ADMISSION refuses it — the world half runs before a Work row exists.
  const g = await assertPair(CLR.badRequest, PA_REASON.advanceNotEnrolled,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.payroll, adjustment: adj, basis,
    }), "payroll.relationships(admission)");
  assert.equal(g.detail.account_code, PACHART.advanceLoose, "the refusal names the offending account");
  assert.equal(g.detail.field, "adjustment.advance_account_code",
    "…and the control it belongs beside");
  assert.equal(await entryCount(client), entries, "payroll.relationships: entry count unmoved");
  assert.equal(await committedReceiptCount(client), receipts, "payroll.relationships: receipt count unmoved");
  assert.equal(await adjustmentCount(client), 0, "payroll.relationships: no adjustment row");
  assert.equal(
    (await rootQuery("select count(*)::int n from clara.accounting_work where client_id=$1", [client])).rows[0].n,
    0, "payroll.relationships: …and NO Work was admitted at all");

  // …and an ENROLLED account is ADMITTED, so the refusal is about the register and not about the
  // shape. What happens to it at APPROVE is the staff-advance register's business, not this
  // lane's — see `pa.payroll.advance-discharge` below.
  const ok = payrollObligation({
    amountCents: 500000, advanceAccountCode: PACHART.advance,
    instruction: "Recover August's advance from the salary run.",
  });
  const admitted = await admitPeriodicAdjustmentWork({
    client, author: ALICE(), purpose: PA_PURPOSE.payroll, adjustment: ok,
    basis: basisForPayroll(ok, { creditSplit: { advance: 120000 } }),
  });
  assert.ok(admitted.work_id, "payroll.relationships: the ENROLLED account is admitted");
});

test("pa.payroll.advance-discharge the staff-advance REGISTER, not this lane, decides what a discharge needs", async (t) => {
  if (await gatePa(t)) return;
  // #643's boundary: "do not invent … missing settlement facts". WHICH advance a credit on an
  // enrolled staff-advance account discharges is exactly such a fact, and the estate already has
  // a door for it (`clara.book_staff_advance_application`) and a belt that refuses without it
  // (`clara._adv_on_approve`, CLR40). This lane therefore asserts only the CONTROL RELATIONSHIP
  // (is the account a live enrolment, is it an asset, does the entry touch it) and leaves the
  // allocation to the register — which refuses AT APPROVE, under its own name, with its own
  // remedy. Pinned here so a later cut cannot quietly "fix" the refusal by fabricating one.
  const client = await paClient("advdischarge");
  const adj = payrollObligation({
    amountCents: 500000, advanceAccountCode: PACHART.advance,
    instruction: "Recover August's advance from the salary run.",
  });
  const a = await armedPa({
    client, purpose: PA_PURPOSE.payroll, adjustment: adj,
    basis: basisForPayroll(adj, { creditSplit: { advance: 120000 } }),
  });
  const err = await assertRaises("CLR40", () => post(a), "payroll.advance-discharge");
  assert.match(err.message, /which advance it discharges/,
    "advance-discharge: the estate's own register refuses it and names book_staff_advance_application");
  assert.equal(await adjustmentCount(client), 0,
    "advance-discharge: …and nothing durable was written by this lane");
});

test("pa.payroll.settled a partly settled obligation splits its credit across the liability and the payment leg", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("settled");
  const adj = payrollObligation({
    amountCents: 130000, paymentAccountCode: PACHART.bank,
    instruction: "August EPF: RM 300.00 paid from the bank on the day, the rest accrued.",
  });
  const a = await armedPa({
    client, purpose: PA_PURPOSE.payroll, adjustment: adj,
    basis: basisForPayroll(adj, { creditSplit: { payment: 30000 } }),
  });
  const out = await post(a);
  const posted = await linesOf(out.entry_id);
  assert.equal(String(posted.find((l) => l.account_code === PACHART.bank).credit_cents), "30000");
  assert.equal(String(posted.find((l) => l.account_code === PACHART.liability).credit_cents), "100000",
    "payroll.settled: the liability takes the remainder — the SPLIT is the accountant's, not the database's");
  const row = await adjustmentRow(out.adjustment_id);
  assert.equal(row.basis.payment_account_code, PACHART.bank,
    "payroll.settled: the settlement account is kept as a supplied particular");

  // A NAMED LEG THE ENTRY NEVER TOUCHES is refused: the particulars must describe the entry.
  const unused = payrollObligation({ amountCents: 130000, paymentAccountCode: PACHART.bank });
  const g = await refusesPa(client, CLR.badRequest, PA_REASON.linesMismatch,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.payroll, adjustment: unused,
      basis: basisForPayroll(unused),
    }), "payroll.settled(named but unused)");
  assert.equal(g.detail.constraint, "payment_leg");
});

test("pa.payroll.enrolment-withdrawn the enrolment is re-read AT COMMIT, not snapshotted at admission", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("advwithdrawn");
  const adj = payrollObligation({ amountCents: 400000, advanceAccountCode: PACHART.advance });
  const a = await armedPa({
    client, purpose: PA_PURPOSE.payroll, adjustment: adj,
    basis: basisForPayroll(adj, { creditSplit: { advance: 100000 } }),
  });
  await retireAdvance(ALICE(), { client, code: PACHART.advance });
  await refusesPa(client, CLR.badRequest, PA_REASON.advanceNotEnrolled, () => post(a),
    "payroll.enrolment-withdrawn");
});

test("pa.payroll.account-class the liability leg must BE a liability, and the refusal says so", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("class");
  const adj = payrollObligation({ liabilityAccountCode: PACHART.notAnAsset });
  const basis = basisForPayroll(adj);
  const g = await assertPair(CLR.badRequest, PA_REASON.accountRelationship,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.payroll, adjustment: adj, basis,
    }), "payroll.account-class");
  assert.equal(g.detail.constraint, "liability_account_class");
  assert.equal(g.detail.account_type, "income");
  assert.equal(g.detail.expected_account_type, "liability");
});

// ===========================================================================================
// 3 · The refusal table.
// ===========================================================================================

test("pa.refusals the typed refusal table — every arm names its field and leaves nothing behind", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("refusals");

  const cases = [
    {
      label: "all-zero (counted)",
      reason: PA_REASON.allZero,
      code: CLR.badRequest,
      field: "adjustment.adjustment_cents",
      adjustment: stockAdjustment({ openingCents: 400000, closingCents: 400000 }),
    },
    {
      label: "all-zero (payroll)",
      reason: PA_REASON.allZero,
      code: CLR.badRequest,
      field: "adjustment.amount_cents",
      purpose: PA_PURPOSE.payroll,
      adjustment: payrollObligation({ amountCents: 0 }),
    },
    {
      label: "scope overbroad (past the fiscal year end)",
      reason: PA_REASON.scopeOverbroad,
      code: CLR.badRequest,
      field: "adjustment.period_end",
      adjustment: stockAdjustment({ periodStart: "2029-01-01", periodEnd: "2029-12-31", countedAt: "2029-12-31" }),
      seedFy: { startsOn: "2029-01-01", endsOn: "2029-06-30", status: "open" },
    },
    {
      label: "stale basis (counted outside the period)",
      reason: PA_REASON.staleBasis,
      code: CLR.badRequest,
      field: "adjustment.counted_at",
      adjustment: stockAdjustment({ countedAt: "2027-02-01" }),
    },
    {
      label: "the counted movement contradicts the count",
      reason: PA_REASON.invalidAdjustment,
      code: CLR.badRequest,
      field: "adjustment.adjustment_cents",
      constraint: "derived_amount",
      adjustment: stockAdjustment({ openingCents: 400000, closingCents: 650000, adjustmentCents: 250001 }),
      basisFrom: (adj) => basisForStock({ ...adj, adjustment_cents: 250001 }),
    },
    {
      label: "the lines do not say what the particulars say",
      reason: PA_REASON.linesMismatch,
      code: CLR.badRequest,
      field: "adjustment.inventory_account_code",
      adjustment: stockAdjustment(),
      // The SAME balanced money, on two accounts the particulars never named: exactly the
      // "anonymous balancing journal" C-29 refuses.
      basisFrom: (adj) => ({
        ...basisForStock(adj),
        lines: [
          { account_code: WCHART.expense, debit_cents: 250000, credit_cents: 0, description: "anonymous" },
          { account_code: WCHART.bank, debit_cents: 0, credit_cents: 250000, description: "anonymous" },
        ],
      }),
    },
    {
      label: "an unknown obligation kind",
      reason: PA_REASON.invalidAdjustment,
      code: CLR.badRequest,
      field: "adjustment.obligation_kind",
      purpose: PA_PURPOSE.payroll,
      adjustment: payrollObligation({ obligationKind: "socso_2026_rate" }),
    },
    {
      label: "no instruction",
      reason: PA_REASON.invalidAdjustment,
      code: CLR.badRequest,
      field: "adjustment.instruction",
      adjustment: stockAdjustment({ omit: ["instruction"] }),
    },
    {
      label: "a currency that is not ringgit",
      reason: PA_REASON.invalidAdjustment,
      code: CLR.badRequest,
      field: "adjustment.currency",
      adjustment: stockAdjustment({ currency: "SGD" }),
    },
  ];

  for (const c of cases) {
    const adj = c.adjustment;
    const purpose = c.purpose ?? PA_PURPOSE.stock;
    const basis = c.basisFrom
      ? c.basisFrom(adj)
      : (purpose === PA_PURPOSE.stock ? basisForStock(adj) : basisForPayroll(adj));
    const cli = c.seedFy ? await paClient(`refusal-${cases.indexOf(c)}`) : client;
    if (c.seedFy) {
      await seedFiscalYear(cli, { ...c.seedFy, label: `#643 ${c.label}`, openedBy: ALICE() });
    }
    const g = await refusesPa(cli, c.code, c.reason,
      () => admitPeriodicAdjustmentWork({
        client: cli, author: ALICE(), purpose, adjustment: adj, basis,
      }), `refusals: ${c.label}`);
    assert.equal(g.detail.field, c.field, `refusals: ${c.label} names its control`);
    if (c.constraint) assert.equal(g.detail.constraint, c.constraint, `refusals: ${c.label} constraint`);
  }
});

test("pa.refusals.closed-period a sealed fiscal year refuses CLR19 write_into_closed_period, by name and early", async (t) => {
  if (await gatePa(t)) return;
  // A DEDICATED client: `clara.fiscal_years` is append-only, so a closed year seeded here can
  // never be cleaned up (the `w623.post.closed-period` precedent).
  const client = await paClient("closedfy");
  await seedFiscalYear(client, {
    label: "#643 closed FY", startsOn: "2026-01-01", endsOn: "2026-12-31",
    status: "closed", openedBy: ALICE(),
  });
  const adj = stockAdjustment();
  const g = await refusesPa(client, CLR.period, PA_REASON.closedPeriod,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: adj, basis: basisForStock(adj),
    }), "refusals.closed-period");
  assert.equal(g.detail.fy_status, "closed",
    "refusals.closed-period: the typed pre-check names the year's state — the period wall behind it would say the same");
});

test("pa.refusals.obo an interactive_client credential minted OBO ANOTHER bookkeeper cannot commit this Work", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("obo");
  const a = await armedPa({ client, author: ALICE() });
  const elsewhere = await mintClientObo({ firm: FIRM_A(), obo: BOB(), client });
  await refusesPa(client, CLR.authz, REASON.oboNotInitiator,
    () => wakeRecordJournalEntry(elsewhere.secret, {
      client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis,
    }), "refusals.obo");
});

test("pa.refusals.intent-conflict one intent key with DIFFERENT particulars is a typed conflict, not a replay", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("intent");
  const key = opk("pa-intent");
  const adj = stockAdjustment();
  const basis = basisForStock(adj);
  const first = await admitPeriodicAdjustmentWork({
    client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: adj, basis, intentKey: key,
  });
  // THE SAME LINES AND THE SAME DIGEST, a DIFFERENT PERIOD. `basis_digest` does not move, so
  // without the particulars' own canonical comparison this would REPLAY and the changed period
  // would vanish.
  const moved = stockAdjustment({ periodStart: "2025-01-01", periodEnd: "2025-12-31", countedAt: "2025-12-31" });
  const g = await assertPair(CLR.badRequest, REASON.intentConflict,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: moved,
      basis: { ...basis, posting_date: basis.posting_date }, intentKey: key,
    }), "refusals.intent-conflict");
  assert.equal(g.detail.work_id, first.work_id, "the conflict NAMES the Work that key already holds");

  // …and the SAME particulars under the same key still replay.
  const replayed = await admitPeriodicAdjustmentWork({
    client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: adj, basis, intentKey: key,
  });
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.work_id, first.work_id);
});

test("pa.refusals.wrong-door the journal purpose is refused at the periodic-adjustment door", async (t) => {
  if (await gatePa(t)) return;
  const adj = stockAdjustment();
  await assertPair(CLR.badRequest, PA_REASON.invalidPurpose,
    () => admitPeriodicAdjustmentWork({
      client: A1(), author: ALICE(), purpose: "journal_entry", adjustment: adj, basis: basisForStock(adj),
    }), "refusals.wrong-door");
});

// ===========================================================================================
// 4 · The correction chain.
// ===========================================================================================

test("pa.correction post, reverse, correct — two rows linked BOTH ways under two logical identities", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("correction");
  const adj = stockAdjustment({ openingCents: 400000, closingCents: 650000 });
  const a = await armedPa({ client, adjustment: adj });
  const first = await post(a);

  // A CORRECTION FOLLOWS A REVERSAL. Asserted by refusing the correction while the original
  // entry is still live: the books may not carry both movements at once.
  const recount = stockAdjustment({
    openingCents: 400000, closingCents: 610000, countReference: "STOCKTAKE-2026-12-RECOUNT",
    instruction: "Recount: RM 400.00 of the first count was consignment stock the client does not own.",
    correctsAdjustmentId: first.adjustment_id,
  });
  await refusesPa(client, CLR.badRequest, PA_REASON.correctionLive,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: recount,
      basis: basisForStock(recount),
    }), "correction(before the reversal)");

  await reverseEntry(ALICE(), {
    entry: first.entry_id, reason: "#643 rig: the first count included consignment stock",
  });
  const reversed = (await rootQuery(
    "select reversed_by from clara.journal_entries where id=$1", [first.entry_id])).rows[0];
  assert.ok(reversed.reversed_by, "correction: mandatory setup — the original entry is reversed");

  const b = await armedPa({ client, adjustment: recount });
  const second = await post(b);
  assert.notEqual(second.adjustment_id, first.adjustment_id);
  assert.notEqual(b.logical_op_id, a.logical_op_id,
    "correction: TWO logical identities — a correction is a new effect, not a replay of the first");

  const originalRow = await adjustmentRow(first.adjustment_id);
  const correctionRow = await adjustmentRow(second.adjustment_id);
  assert.equal(correctionRow.corrects_adjustment_id, first.adjustment_id,
    "correction: the new row names what it corrects");
  assert.equal(originalRow.corrected_by_adjustment_id, second.adjustment_id,
    "correction: …and the original names its replacement — the one update the append-only belt admits");
  assert.equal(String(correctionRow.amount_cents), "210000");

  // TWO COMMITTED RECEIPTS, under two identities.
  const committed = (await rootQuery(
    "select count(*)::int n from clara.operation_receipts where client_id=$1 and outcome='committed'",
    [client])).rows[0].n;
  assert.equal(committed, 2, "correction: two committed receipts, one per logical identity");

  // A SECOND correction of the same target is refused — the chain stays unambiguous.
  const third = stockAdjustment({
    openingCents: 400000, closingCents: 600000, countReference: "STOCKTAKE-2026-12-THIRD",
    instruction: "A third count.", correctsAdjustmentId: first.adjustment_id,
  });
  await refusesPa(client, CLR.badRequest, PA_REASON.correctionAlreadyCorrected,
    () => admitPeriodicAdjustmentWork({
      client, author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: third,
      basis: basisForStock(third),
    }), "correction(second attempt)");

  // …and a target that is not this client's is not found, never a different error.
  const stranger = stockAdjustment({ correctsAdjustmentId: first.adjustment_id });
  await refusesPa(A1(), CLR.badRequest, PA_REASON.correctionNotFound,
    () => admitPeriodicAdjustmentWork({
      client: A1(), author: ALICE(), purpose: PA_PURPOSE.stock, adjustment: stranger,
      basis: basisForStock(stranger),
    }), "correction(another client's adjustment)");
});

// ===========================================================================================
// 5 · The durable record's own belts, and the read.
// ===========================================================================================

test("pa.append-only the adjustment row admits exactly one update and refuses every other edit and DELETE", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("appendonly");
  const a = await armedPa({ client });
  const out = await post(a);
  for (const [sql, label] of [
    ["update clara.periodic_adjustments set amount_cents = amount_cents + 1 where id = $1", "amount"],
    ["update clara.periodic_adjustments set period_end = period_end + 1 where id = $1", "period"],
    ["update clara.periodic_adjustments set basis = '{}'::jsonb where id = $1", "basis"],
    ["delete from clara.periodic_adjustments where id = $1", "delete"],
  ]) {
    await assertPair(CLR.immutable, "periodic_adjustment_immutable",
      () => rootQuery(sql, [out.adjustment_id]), `append-only: ${label}`);
  }
});

test("pa.read list_periodic_adjustments returns the particulars, the entry state and the chain", async (t) => {
  if (await gatePa(t)) return;
  const client = await paClient("read");
  const adj = stockAdjustment();
  const a = await armedPa({ client, adjustment: adj });
  const out = await post(a);

  const rows = await listPeriodicAdjustments(BOB(), { client });
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.id, out.adjustment_id);
  assert.equal(row.purpose, PA_PURPOSE.stock);
  assert.equal(row.entry_id, out.entry_id);
  assert.equal(row.entry_status, "approved");
  assert.equal(row.receipt_id, out.receipt_id);
  assert.equal(row.amount_cents, 250000);
  assert.equal(row.basis.method, "opening_closing_count");
  assert.equal(row.reversed_by, null);

  // THE WINDOW IS A FILTER, not a suggestion: an adjustment whose period ends before the window
  // starts is not in the answer.
  assert.equal((await listPeriodicAdjustments(BOB(), { client, from: "2027-01-01" })).length, 0);
  assert.equal((await listPeriodicAdjustments(BOB(), { client, to: "2026-12-31" })).length, 1);

  // …and it is FIRM-FLOORED: another firm's bookkeeper is not told the client exists.
  await assertPair(CLR.notFound, REASON.clientNotFound,
    () => listPeriodicAdjustments(world.users.dave, { client }), "read(foreign firm)");
});

test("pa.rls a periodic adjustment is readable under the human role and holds NO DML for any app role", async (t) => {
  if (await gatePa(t)) return;
  const priv = await rootQuery(
    `select r.role,
            has_table_privilege(r.role, 'clara.periodic_adjustments', 'SELECT') as sel,
            has_table_privilege(r.role, 'clara.periodic_adjustments', 'INSERT') as ins,
            has_table_privilege(r.role, 'clara.periodic_adjustments', 'UPDATE') as upd,
            has_table_privilege(r.role, 'clara.periodic_adjustments', 'DELETE') as del
       from unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                         'clara_wake_interactive','clara_wake_proactive']) as r(role)`);
  for (const row of priv.rows) {
    assert.equal(row.ins, false, `${row.role} must hold no INSERT`);
    assert.equal(row.upd, false, `${row.role} must hold no UPDATE`);
    assert.equal(row.del, false, `${row.role} must hold no DELETE`);
    assert.equal(row.sel, row.role === "clara_authenticated",
      `${row.role}: only the human role reads this table`);
  }
  const forced = await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname='clara' and c.relname='periodic_adjustments'`);
  assert.equal(forced.rows[0].relrowsecurity, true);
  assert.equal(forced.rows[0].relforcerowsecurity, true);
});
