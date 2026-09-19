// #655 — TRADE INVOICES, SUPPLIER BILLS AND THE OPEN ITEM THEY BIRTH.
//
// Every assertion about the subject under test runs through a LEAST-PRIVILEGED persona
// (`humanQuery` for a signed-in human, `roleQuery(ROLES.runtime)` for the door) — `rootQuery`
// appears only for labelled fixture facts and for catalog censuses, never to prove that a floor
// holds. That is the evidence law (WORK-ORDER rule 7 / brief section 4).
//
// The cells are named `p655.*` and each closes a row of the brief's gap table.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  gateTi, TI_REASON, TI_KIND, DUE_SOURCE, TICHART, TI_DATE,
  ensureTiChart, vendor, customer,
  billParticulars, invoiceParticulars, billBasis, invoiceBasis,
  admitTradeInvoiceWork, getTradeInvoice, withClientRungHeld, awaitRungWaiters,
  invoiceRow, invoiceForWork, invoiceCount, invoiceStatus,
  openItemsForEntry, openItemsForClient, classifyEntry, entryRow,
  controlBalance, subledgerOutstanding,
  buildWorkWorld, freshWorkClient, admitJournalWork, claimWorkRun, mintClientObo,
  wakeRecordJournalEntry, entryCount, committedReceiptCount, entriesForClient, linesOf,
  assertPair, receiptsForWork, WCHART, basis,
  rootQuery, humanQuery, opk, ROLES, endPool, assertRaises,
} from "./trade-invoice-fixtures.mjs";
import { printLaneNotes, printSkipCount } from "./wave-a-helpers.mjs";

let world;

before(async () => { world = await buildWorkWorld(); });
after(async () => {
  printLaneNotes("trade-invoice");
  printSkipCount("trade-invoice");
  await endPool();
});

const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice;      // owner
const BOB = () => world.users.bob;          // bookkeeper
const CAROL = () => world.users.carol;      // viewer
const DAVE = () => world.users.dave;        // another firm's owner

/** A dedicated client of firm A carrying this battery's chart. Every cell takes its own, because
 *  the tie-out cell measures balances FROM ZERO and a shared client would make that a fiction. */
async function tiClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensureTiChart(ALICE(), client, tag);
  return client;
}

/** Admit a trade-invoice Work, claim its run, and mint the credential the run would hold. */
async function armed({
  client, author = null, kind = TI_KIND.bill, particulars, basis: b, sourceRefs = [],
  intentKey = null,
} = {}) {
  const who = author ?? ALICE();
  const work = await admitTradeInvoiceWork({
    client, author: who, kind, particulars, basis: b, sourceRefs, intentKey,
  });
  await claimWorkRun({ task: work.task_id, runId: opk("ti-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: who, client });
  return { ...work, cred, client, author: who, basis: b };
}

const post = (a, over = {}) => wakeRecordJournalEntry(a.cred.secret, {
  client: a.client, work: a.work_id, logicalOpId: a.logical_op_id, basis: a.basis, ...over,
});

/** The whole happy supplier-bill journey, in one call. */
async function postedBill(client, over = {}) {
  const cp = over.counterparty ?? await vendor(ALICE(), { client, termsDays: over.termsDays ?? null });
  const p = billParticulars({ counterparty: cp, ...(over.particulars ?? {}) });
  const b = billBasis(over.basis ?? {});
  const a = await armed({ client, kind: TI_KIND.bill, particulars: p, basis: b });
  const r = await post(a);
  return { ...a, counterparty: cp, particulars: p, result: r, entry: r.entry_id ?? r.result?.entry_id };
}

/** A refusal leaves NOTHING behind: no Work, no trade invoice, no entry, no committed receipt. */
async function refusesTi(client, code, reason, fn, label) {
  const works = (await rootQuery(
    "select count(*)::int n from clara.accounting_work where client_id=$1", [client])).rows[0].n;
  const invoices = await invoiceCount(client);
  const entries = await entryCount(client);
  const receipts = await committedReceiptCount(client);
  const out = await assertPair(code, reason, fn, label);
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.accounting_work where client_id=$1", [client])).rows[0].n,
  works, `${label}: no accounting_work row was written`);
  assert.equal(await invoiceCount(client), invoices, `${label}: no clara.trade_invoices row`);
  assert.equal(await entryCount(client), entries, `${label}: no journal row was written`);
  assert.equal(await committedReceiptCount(client), receipts, `${label}: no committed receipt`);
  return out;
}

// ===========================================================================================
// 0 · THE MEASURE-FIRST RIG CELLS. These are the measurements 0225's header records, re-asserted
//     so a later reader can re-run them rather than trust the comment.
// ===========================================================================================

test("p655.rig.trigger_order the birth trigger sorts BEFORE every deferred trigger that reads clara.open_items", async (t) => {
  if (await gateTi(t)) return;
  const rows = (await rootQuery(
    `select t.tgname, t.tgdeferrable, t.tginitdeferred, t.tgconstraint <> 0 as is_constraint,
            position('open_items' in p.prosrc) > 0 as reads_open_items
       from pg_trigger t join pg_proc p on p.oid = t.tgfoid
      where t.tgrelid = 'clara.journal_entries'::regclass and not t.tgisinternal
      order by t.tgname collate "C"`)).rows;
  const birth = rows.find((r) => r.tgname === "t_je_open_item_birth");
  assert.ok(birth, "p655.rig.trigger_order: t_je_open_item_birth exists on clara.journal_entries");
  assert.equal(birth.tgdeferrable && birth.tginitdeferred && birth.is_constraint, true,
    "p655.rig.trigger_order: it is a DEFERRABLE INITIALLY DEFERRED constraint trigger -- 0216:350-353's declaration");

  // THE MEASUREMENT, reproduced with THIS file's trigger name in place (0216:347-349 measured the
  // same physics on clara_639 for t_je_fa_acquisition_birth; SYNTHESIS section 2.1 LOUD #1 says
  // reproduce it, never assume it).
  const deferredReaders = rows.filter((r) => r.tgdeferrable && r.tginitdeferred
    && r.reads_open_items && r.tgname !== "t_je_open_item_birth");
  assert.deepEqual(deferredReaders.map((r) => r.tgname), ["t_je_subledger_belt"],
    "p655.rig.trigger_order: exactly ONE deferred trigger on clara.journal_entries reads clara.open_items at commit");
  for (const r of deferredReaders) {
    assert.ok("t_je_open_item_birth" < r.tgname,
      `p655.rig.trigger_order: the birth sorts before ${r.tgname}, so the item exists by the time the belt counts it`);
  }
  // …and the non-deferred reader is named rather than ignored: it fires at the statement, long
  // before the deferred queue runs, so its ordering is not this trigger's to manage.
  const immediateReaders = rows.filter((r) => !r.tginitdeferred && r.reads_open_items);
  assert.deepEqual(immediateReaders.map((r) => r.tgname), ["t_snapshot_staleness"],
    "p655.rig.trigger_order: the only NON-deferred open_items reader is t_snapshot_staleness");
});

test("p655.rig.receipt_join both subject-resolution paths are satisfiable at deferred-queue time", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("receiptjoin");
  const b = await postedBill(client);
  const entry = (await entriesForClient(client))[0].id;

  // PATH (1): the posted status row exists and names the entry and the receipt.
  const st = (await invoiceStatus(b.invoice_id)).find((r) => r.state === "posted");
  assert.ok(st, "p655.rig.receipt_join: clara.trade_invoice_status carries a posted row");
  assert.equal(st.entry_id, entry, "p655.rig.receipt_join: …naming the entry");
  assert.ok(st.receipt_id, "p655.rig.receipt_join: …and the committed receipt");

  // PATH (2): the receipt join, as a TEXT comparison so ix_operation_receipts_entry is usable.
  const viaReceipt = (await rootQuery(
    `select ti.id from clara.operation_receipts o
       join clara.trade_invoices ti on ti.work_id = o.work_id
      where o.effects->>'entry_id' = $1::text and o.outcome = 'committed'`, [entry])).rows;
  assert.equal(viaReceipt.length, 1,
    "p655.rig.receipt_join: the committed receipt resolves the same invoice through the TEXT-compared effects key");
  assert.equal(viaReceipt[0].id, b.invoice_id, "p655.rig.receipt_join: …the SAME invoice");

  // The one shared resolver 0225's classifier ladder and item belt both use agrees with both.
  const viaFn = (await rootQuery(
    "select clara._trade_invoice_kind_of_entry($1::uuid) as k", [entry])).rows[0].k;
  assert.equal(viaFn, TI_KIND.bill,
    "p655.rig.receipt_join: clara._trade_invoice_kind_of_entry resolves the kind from the entry");
  // …and returns NULL for an entry no trade invoice names, which is what keeps LADDER 3T narrow.
  const plain = await admitJournalWork({ client, author: ALICE(), basis: basis({ cents: 1000 }) });
  assert.equal((await rootQuery("select clara._trade_invoice_kind_of_entry($1::uuid) as k",
    [randomUUID()])).rows[0].k, null,
  "p655.rig.receipt_join: an entry no trade invoice names resolves to NULL");
  assert.ok(plain.work_id, "p655.rig.receipt_join: the plain journal Work still admits");
});

test("p655.rig.coding_kind_untouched this lane leaves journal_entries.coding_kind NULL, so the document-anchored shape belts never arm", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("codingkind");
  await postedBill(client);
  const e = (await entriesForClient(client))[0];
  const row = await entryRow(e.id);
  assert.equal(row.coding_kind, null,
    "p655.rig.coding_kind_untouched: the Work-lane trade-invoice entry carries coding_kind IS NULL");
  assert.equal(row.document_id, null,
    "p655.rig.coding_kind_untouched: …and no document_id, so clara._tf_source_binding_wall is inert too");
  assert.equal(row.is_opening_balance, false, "p655.rig.coding_kind_untouched: it is not an opening entry");
  assert.equal(row.reversal_of, null, "p655.rig.coding_kind_untouched: nor a reversal mirror");
  // THE QUESTION THIS CELL MAKES MOOT rather than answers (gap-655 section 14.2): whether a
  // documentless CODED entry could satisfy clara._assert_supplier_bill_shape_at_projected's
  // sst_purchase_cost arm. It cannot arise here, because the arm is gated on coding_kind.
  const belt = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._assert_supplier_bill_shape_at_projected(uuid,uuid,uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(belt.includes("if e.coding_kind = 'supplier_bill' and e.reversal_of is null then"),
    "p655.rig.coding_kind_untouched: the shape belt's whole body is gated on coding_kind='supplier_bill'");
});

test("p655.rig.lines_validator_path clara._validate_entry_lines is the only path into journal_lines on this lane, which is why the party is stamped AFTER the insert", async (t) => {
  if (await gateTi(t)) return;
  const core = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)'::regprocedure")).rows[0].prosrc;
  assert.equal(core.split("insert into clara.journal_lines(").length - 1, 1,
    "p655.rig.lines_validator_path: the sixth copy INSERTs journal_lines exactly once");
  assert.ok(core.includes("v_lines := clara._validate_entry_lines(p_client, v_canon->'lines');"),
    "p655.rig.lines_validator_path: …from clara._validate_entry_lines' output and nothing else");
  const validator = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._validate_entry_lines(uuid,jsonb)'::regprocedure")).rows[0].prosrc;
  assert.equal(validator.includes("counterparty_id"), false,
    "p655.rig.lines_validator_path: the validator drops every key but account_code/debit/credit/description -- a counterparty on a basis line can never reach the ledger");
  const stampAt = core.indexOf("update clara.journal_lines l set counterparty_id = v_ti_party");
  const insertAt = core.indexOf("insert into clara.journal_lines(");
  assert.ok(insertAt > 0 && stampAt > insertAt,
    "p655.rig.lines_validator_path: the party stamp sits AFTER the line insert");
});

test("p655.rig.aging_floor ar_aging and ap_aging keep their own grants and floors -- this lane adds no read and moves none", async (t) => {
  if (await gateTi(t)) return;
  // MEASURED FROM THE CATALOG, not from a header citation (gap-655 section 14.4 took the floor
  // from a header). The live signatures carry a THIRD argument, `p_segment uuid default null`.
  for (const fn of ["clara.ar_aging(uuid,date,uuid)", "clara.ap_aging(uuid,date,uuid)"]) {
    const rows = (await rootQuery(
      `select p.oid::regprocedure::text sig, p.proacl::text acl, p.prosecdef, p.provolatile,
              position('_human_ctx' in p.prosrc) > 0 as human_floored,
              position('role_rank' in p.prosrc) > 0 as role_floored
         from pg_proc p where p.oid = $1::regprocedure`, [fn])).rows;
    assert.equal(rows.length, 1, `p655.rig.aging_floor: ${fn} exists`);
    const r = rows[0];
    assert.ok(r.acl.includes("clara_authenticated=X"),
      `p655.rig.aging_floor: ${fn} is reachable by clara_authenticated (measured from the catalog, not from a header)`);
    assert.equal(r.prosecdef, true, `p655.rig.aging_floor: ${fn} is SECURITY DEFINER`);
    assert.ok(r.human_floored && r.role_floored,
      `p655.rig.aging_floor: ${fn} carries a _human_ctx role floor in-body`);
    const body = (await rootQuery("select prosrc from pg_proc where oid=$1::regprocedure", [fn]))
      .rows[0].prosrc;
    assert.ok(body.includes("clara.role_rank('bookkeeper')"),
      `p655.rig.aging_floor: ${fn}'s floor is BOOKKEEPER, not viewer -- measured, and the reason a viewer's walk asserts no aging number`);
  }
});

// ===========================================================================================
// 1 · THE JOURNEY. One commit, four cross-referenced facts.
// ===========================================================================================

test("p655.post.bill_one_commit ONE commit yields the trade invoice, the balanced entry, ONE AP open item of exactly +106000 and ONE receipt", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("billone");
  const before = await entryCount(client);
  const b = await postedBill(client);

  assert.equal(await entryCount(client), before + 1, "p655.post.bill_one_commit: exactly ONE entry");
  const entry = (await entriesForClient(client))[0];
  const inv = await invoiceForWork(b.work_id);
  assert.ok(inv, "p655.post.bill_one_commit: the trade invoice row exists");
  assert.equal(inv.kind, TI_KIND.bill);
  assert.equal(String(inv.total_cents), "106000");
  assert.equal(inv.currency, "MYR");
  assert.equal(inv.document_date_text, TI_DATE.document);
  assert.equal(inv.counterparty_id, b.counterparty);
  assert.equal(inv.reference, "ALPHA-2026-0042");
  assert.deepEqual(inv.tax_facts, { stated_code: "SR", stated_cents: 6000, note: "as printed on the bill" },
    "p655.post.bill_one_commit: the supplied tax facts are carried OPAQUE and echoed, validated against nothing");

  const lines = await linesOf(entry.id);
  assert.equal(lines.length, 3, "p655.post.bill_one_commit: Dr expense / Dr SST / Cr payable");
  const dr = lines.reduce((n, l) => n + Number(l.debit_cents), 0);
  const cr = lines.reduce((n, l) => n + Number(l.credit_cents), 0);
  assert.equal(dr, 106000);
  assert.equal(cr, 106000);

  const items = await openItemsForEntry(entry.id);
  assert.equal(items.length, 1, "p655.post.bill_one_commit: exactly ONE open item");
  assert.equal(items[0].domain, "ap");
  assert.equal(items[0].item_kind, "bill");
  assert.equal(String(items[0].amount_cents), "106000",
    "p655.post.bill_one_commit: +106000 sen -- the sign law ck_open_items_kind_matrix pins (bill => ap && > 0)");
  assert.equal(items[0].counterparty_id, b.counterparty);
  assert.equal(items[0].item_date, TI_DATE.posting);

  const receipts = await receiptsForWork(b.work_id);
  const committed = receipts.filter((r) => r.outcome === "committed");
  assert.equal(committed.length, 1, "p655.post.bill_one_commit: exactly ONE committed operation receipt");
  assert.equal(committed[0].effects.entry_id, entry.id, "p655.post.bill_one_commit: …naming the entry");

  // THE FOUR IDS CROSS-REFERENCE, read as the SIGNED-IN HUMAN through the production read.
  const read = await getTradeInvoice(ALICE(), b.work_id);
  assert.equal(read.invoice_id, inv.id);
  assert.equal(read.entry_id, entry.id);
  assert.equal(read.receipt_id, committed[0].id);
  assert.equal(read.open_item_id, items[0].id);
  assert.equal(read.state, "posted");
  assert.equal(read.domain, "ap");
  assert.equal(String(read.outstanding_cents), "106000");
});

test("p655.post.invoice_one_commit the AR mirror: item_kind='invoice', domain='ar', positive cents", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("invone");
  const cp = await customer(ALICE(), { client });
  const a = await armed({
    client, kind: TI_KIND.sales,
    particulars: invoiceParticulars({ counterparty: cp }),
    basis: invoiceBasis(),
  });
  await post(a);
  const entry = (await entriesForClient(client))[0];
  const items = await openItemsForEntry(entry.id);
  assert.equal(items.length, 1);
  assert.equal(items[0].domain, "ar");
  assert.equal(items[0].item_kind, "invoice");
  assert.equal(String(items[0].amount_cents), "106000");
  const read = await getTradeInvoice(ALICE(), a.work_id);
  assert.equal(read.kind, TI_KIND.sales);
  assert.equal(read.domain, "ar");
  assert.equal(read.counterparty_kind, "customer");
});

test("p655.post.control_leg_still_refused a plain admit_journal_work Work naming the SAME payable account is STILL refused generic_control_leg", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("stillrefused");
  const plain = await admitJournalWork({
    client, author: ALICE(),
    basis: {
      posting_date: TI_DATE.posting, memo: "a generic journal touching the control account",
      currency: "MYR",
      lines: [
        { account_code: WCHART.expense, debit_cents: 5000, credit_cents: 0, description: "x" },
        { account_code: TICHART.payable, debit_cents: 0, credit_cents: 5000, description: "y" },
      ],
    },
  });
  await claimWorkRun({ task: plain.task_id, runId: opk("ti-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  await assertPair("CLR10", TI_REASON.genericControlLeg,
    () => wakeRecordJournalEntry(cred.secret, {
      client, work: plain.work_id, logicalOpId: plain.logical_op_id,
      basis: {
        posting_date: TI_DATE.posting, memo: "a generic journal touching the control account",
        currency: "MYR",
        lines: [
          { account_code: WCHART.expense, debit_cents: 5000, credit_cents: 0, description: "x" },
          { account_code: TICHART.payable, debit_cents: 0, credit_cents: 5000, description: "y" },
        ],
      },
    }),
    "p655.post.control_leg_still_refused: the recut opened a DOOR, not a hole -- a Work with no clara.trade_invoices row still meets section 7's refusal");
});

// ===========================================================================================
// 2 · THE DUE-DATE BASIS (D12c). Three answers, and 'absent' is one of them.
// ===========================================================================================

test("p655.due.stated a stated due date reaches clara.open_items.due_date verbatim with due_date_source='stated'", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("duestated");
  const cp = await vendor(ALICE(), { client, termsDays: 30 });   // terms EXIST and must not win
  const a = await armed({
    client, particulars: billParticulars({ counterparty: cp, dueDate: "2026-04-15", dueDateSource: DUE_SOURCE.stated }),
    basis: billBasis(),
  });
  await post(a);
  const inv = await invoiceForWork(a.work_id);
  assert.equal(inv.due_date_text, "2026-04-15");
  assert.equal(inv.due_date_source, DUE_SOURCE.stated,
    "p655.due.stated: stated WINS over the counterparty's agreed terms");
  const entry = (await entriesForClient(client))[0];
  assert.equal((await openItemsForEntry(entry.id))[0].due_date, "2026-04-15",
    "p655.due.stated: …and reaches the open item verbatim");
});

test("p655.due.terms_fallback no stated date + payment_terms_days=30 ⇒ posting_date + 30 with due_date_source='counterparty_terms'", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("dueterms");
  const cp = await vendor(ALICE(), { client, termsDays: 30 });
  const a = await armed({
    client, particulars: billParticulars({ counterparty: cp, dueDate: null }), basis: billBasis(),
  });
  await post(a);
  const inv = await invoiceForWork(a.work_id);
  // 2026-03-31 + 30 days = 2026-04-30 — the x37.c2 arithmetic (0040:6010-6015), on the NEW lane.
  assert.equal(inv.due_date_text, "2026-04-30");
  assert.equal(inv.due_date_source, DUE_SOURCE.terms);
  const entry = (await entriesForClient(client))[0];
  assert.equal((await openItemsForEntry(entry.id))[0].due_date, "2026-04-30",
    "p655.due.terms_fallback: the item carries the derived date, so the coding lane and this lane agree");
});

test("p655.due.absent neither a stated date nor agreed terms ⇒ NULL due date, 'absent', and the aging read reports overdue:false rather than inventing one", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("dueabsent");
  const cp = await vendor(ALICE(), { client });                  // no terms agreed
  const a = await armed({
    client, particulars: billParticulars({ counterparty: cp, dueDate: null }), basis: billBasis(),
  });
  await post(a);
  const inv = await invoiceForWork(a.work_id);
  assert.equal(inv.due_date_text, null, "p655.due.absent: undated is undated");
  assert.equal(inv.due_date_source, DUE_SOURCE.absent);
  const entry = (await entriesForClient(client))[0];
  const item = (await openItemsForEntry(entry.id))[0];
  assert.equal(item.due_date, null);
  // THE AGING READ, as the signed-in human, says so rather than inventing today.
  const aging = (await humanQuery(ALICE(),
    "select clara.ap_aging(p_client => $1::uuid, p_as_of => $2::date) as r",
    [client, "2027-01-01"])).rows[0].r;
  const row = (aging.counterparties ?? []).flatMap((c) => c.items ?? [])
    .find((x) => x.item_id === item.id);
  assert.ok(row, "p655.due.absent: the item appears in the AP aging read");
  assert.equal(row.due_date, null, "p655.due.absent: with no due date");
  assert.equal(row.overdue, false,
    "p655.due.absent: and overdue:false -- an item with no agreed due date cannot be late");
});

// ===========================================================================================
// 3 · POLARITY AND THE CREDIT BOUNDARY (AC11, D12b).
// ===========================================================================================

test("p655.polarity.matrix a negative total, an AR party on an AP kind and a credit-note-shaped payload are each refused BY NAME", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("polarity");
  const vend = await vendor(ALICE(), { client });
  const cust = await customer(ALICE(), { client });

  // (a) A NEGATIVE TOTAL — a typed CLR10 `invalid_total`, raised BEFORE the column CHECK
  // total_cents > 0 could fire as a bare 23514 (0194:1078-1081's rule).
  const neg = await refusesTi(client, "CLR10", TI_REASON.invalidTotal,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend, totalCents: -106000 }),
      basis: billBasis(),
    }),
    "p655.polarity.matrix(a): a negative total is not a credit note");
  assert.notEqual(neg.err.code, "23514", "p655.polarity.matrix(a): NOT a bare CHECK violation");
  await refusesTi(client, "CLR10", TI_REASON.invalidTotal,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend, totalCents: 0 }),
      basis: billBasis(),
    }),
    "p655.polarity.matrix(a2): a zero total leaves under the SAME name");

  // (b) AN AR PARTY ON AN AP KIND — `wrong_control_domain`, typed at ADMISSION rather than left to
  // a commit-time belt (the 0037:1088-1096 rule, restated at the door).
  await refusesTi(client, "CLR10", TI_REASON.wrongControlDomain,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: cust }), basis: billBasis(),
    }),
    "p655.polarity.matrix(b): a customer cannot be the party of a supplier bill");
  // …and its mirror: a receivable control leg on a supplier bill.
  await refusesTi(client, "CLR10", TI_REASON.wrongControlDomain,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend }),
      basis: billBasis({ control: TICHART.receivable }),
    }),
    "p655.polarity.matrix(b2): a receivable-class control leg on a supplier bill");

  // (c) A CREDIT-NOTE-SHAPED PAYLOAD — refused BY NAME, as a typed CLR10 and NOT as a bare 23514
  // out of the `kind` column CHECK. The #666/#662 boundary is SPOKEN rather than silent.
  const credit = await refusesTi(client, "CLR10", TI_REASON.creditShape,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: "sales_credit_note",
      particulars: invoiceParticulars({ counterparty: cust }), basis: invoiceBasis(),
    }),
    "p655.polarity.matrix(c): a credit note is not this ticket");
  assert.notEqual(credit.err.code, "23514",
    "p655.polarity.matrix(c): a typed CLR10, never an unclassifiable 23514 out of the kind CHECK");
  // …and a MyInvois type-02 document, whatever the caller calls it.
  await refusesTi(client, "CLR10", TI_REASON.creditShape,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.sales,
      particulars: invoiceParticulars({ counterparty: cust, taxFacts: { type_code: "02" } }),
      basis: invoiceBasis(),
    }),
    "p655.polarity.matrix(c2): a type-02 document is a credit note however it is labelled");

  // (d) THE FIFTEENTH TOKEN, named rather than hidden: an unrecognised kind that is not
  // credit-shaped still leaves typed.
  const bad = await refusesTi(client, "CLR10", TI_REASON.invalidKind,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: "proforma",
      particulars: billParticulars({ counterparty: vend }), basis: billBasis(),
    }),
    "p655.polarity.matrix(d): an unrecognised kind is a typed refusal, not a CHECK violation");
  assert.notEqual(bad.err.code, "23514");
  assert.equal(bad.detail.kind, "proforma",
    "p655.polarity.matrix(d): …and invalid_kind names the KIND, which is the one thing it is about");

  // (d2) ONE REASON NAMES ONE THING (F2, fix round 1). `invalid_kind` used to answer four
  // different failures — a malformed particulars object, an unrecognised kind, a currency that is
  // not MYR, and tax facts that are not an object — while the runtime map and the message
  // catalogue rendered the single sentence "A trade invoice is either a sales invoice or a
  // supplier bill." For three of the four that sentence is simply false, and a person told it
  // would go and change the one thing that was already right. The ladder is the contract
  // (DECISIONS.md:50), so the ladder grows and each token names its own failure.
  await refusesTi(client, "CLR10", TI_REASON.invalidParticulars,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill, particulars: null, basis: billBasis(),
    }),
    "p655.polarity.matrix(d2): particulars that are not an object at all");
  const cur = await refusesTi(client, "CLR10", TI_REASON.invalidCurrency,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend, extra: { currency: "SGD" } }),
      basis: billBasis(),
    }),
    "p655.polarity.matrix(d2): a currency this estate does not record");
  assert.equal(cur.detail.currency, "SGD",
    "p655.polarity.matrix(d2): …and the refusal names the currency that was sent");
  const tax = await refusesTi(client, "CLR10", TI_REASON.invalidTaxFacts,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend, taxFacts: ["SR", 6000] }),
      basis: billBasis(),
    }),
    "p655.polarity.matrix(d2): tax facts that are not an object");
  assert.equal(tax.detail.field, "tax_facts",
    "p655.polarity.matrix(d2): …naming the field, not the kind");

  // (e) THE BASIS LAWS.
  await refusesTi(client, "CLR10", TI_REASON.controlLegMissing,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend }),
      basis: billBasis({ control: TICHART.nonControl }),
    }),
    "p655.polarity.matrix(e): a bill with no control leg at all");
  await refusesTi(client, "CLR10", TI_REASON.invalidTotal,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend, totalCents: 105999 }),
      basis: billBasis(),
    }),
    "p655.polarity.matrix(e2): a stated total that does not tie to the control leg");
  const unbal = await refusesTi(client, "CLR10", TI_REASON.unbalanced,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend }),
      basis: billBasis({ lines: [
        { account_code: TICHART.expense, debit_cents: 100000, credit_cents: 0, description: "x" },
        { account_code: TICHART.payable, debit_cents: 0, credit_cents: 106000, description: "y" },
      ] }),
    }),
    "p655.polarity.matrix(e3): an unbalanced basis");
  // ADV-655-5 (fix round 1): WHICH arm answers is pinned, because two of them could. Step 2's
  // re-badge of `clara._assert_journal_basis` (0178:780-783) carries that predicate's OWN
  // `field`/`constraint` keys; step 6's later re-sum builds a detail with neither. The estate
  // answers with step 2's — so step 6 is a belt behind a door that already closed, and 0225's
  // comment now says so instead of implying it is the reason an unbalanced basis is refused.
  assert.equal(unbal.detail.constraint, "balanced",
    "p655.polarity.matrix(e3): the refusal is clara._assert_journal_basis's, re-badged at step 2 -- not step 6's own re-sum");
  assert.equal(unbal.detail.field, "lines",
    "p655.polarity.matrix(e3): …and it carries that predicate's own `field`, which step 6's raise does not build");
  await refusesTi(client, "CLR10", TI_REASON.invalidDueDate,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: vend, dueDate: "2026-03-01" }),
      basis: billBasis(),
    }),
    "p655.polarity.matrix(e4): a due date before the document date");
});

// ===========================================================================================
// 4 · IDEMPOTENCE, ATOMICITY AND AUTHORITY.
// ===========================================================================================

test("p655.replay.one_receipt same key + same payload twice ⇒ ONE of everything, and the second call writes NOTHING", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("replay");
  const cp = await vendor(ALICE(), { client });
  const key = `ti-replay-${randomUUID()}`;
  const p = billParticulars({ counterparty: cp });
  const b = billBasis();

  const first = await admitTradeInvoiceWork({
    client, author: ALICE(), intentKey: key, particulars: p, basis: b });
  const inv1 = await invoiceRow(first.invoice_id);
  const statusBefore = (await invoiceStatus(first.invoice_id)).length;

  const second = await admitTradeInvoiceWork({
    client, author: ALICE(), intentKey: key, particulars: p, basis: b });
  assert.equal(second.replayed, true, "p655.replay.one_receipt: the second call answers replayed:true");
  assert.equal(second.work_id, first.work_id, "p655.replay.one_receipt: …with the SAME work id");
  assert.equal(second.invoice_id, first.invoice_id, "p655.replay.one_receipt: …and the SAME invoice id");
  assert.equal(await invoiceCount(client), 1, "p655.replay.one_receipt: exactly ONE trade invoice");
  const inv2 = await invoiceRow(first.invoice_id);
  assert.equal(inv2.created_at.toISOString(), inv1.created_at.toISOString(),
    "p655.replay.one_receipt: the row was NOT rewritten -- the probe is step 4, before any write");
  assert.equal((await invoiceStatus(first.invoice_id)).length, statusBefore,
    "p655.replay.one_receipt: …and the status ledger did not grow");

  // Now post it, and prove one entry / one item / one receipt survive the whole journey.
  await claimWorkRun({ task: first.task_id, runId: opk("ti-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  await wakeRecordJournalEntry(cred.secret, {
    client, work: first.work_id, logicalOpId: first.logical_op_id, basis: b });
  const entry = (await entriesForClient(client))[0];
  assert.equal(await entryCount(client), 1);
  assert.equal((await openItemsForEntry(entry.id)).length, 1);
  assert.equal((await receiptsForWork(first.work_id)).filter((r) => r.outcome === "committed").length, 1);

  // SAME KEY, DIFFERENT PARTICULARS ⇒ intent_payload_conflict naming the field.
  const conflict = await assertPair("CLR10", TI_REASON.intentConflict,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), intentKey: key,
      particulars: billParticulars({ counterparty: cp, totalCents: 200000 }),
      basis: billBasis({ totalCents: 200000 }),
    }),
    "p655.replay.one_receipt: same key, different particulars");
  assert.equal(conflict.detail.field, "particulars",
    "p655.replay.one_receipt: …and the refusal NAMES the offending field");

  // SAME KEY OVER A WORK THAT IS NOT A TRADE INVOICE ⇒ intent_payload_conflict too, never a replay
  // handing back somebody else's basis (0221:1278-1285).
  const otherKey = `ti-plain-${randomUUID()}`;
  await admitJournalWork({ client, author: ALICE(), intentKey: otherKey, basis: basis({ cents: 4200 }) });
  const notTi = await assertPair("CLR10", TI_REASON.intentConflict,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), intentKey: otherKey,
      particulars: billParticulars({ counterparty: cp }), basis: billBasis(),
    }),
    "p655.replay.one_receipt: a key that already carries a plain journal Work");
  assert.equal(notTi.detail.field, "kind");
});

test("p655.replay.race a concurrent pair under ONE key leaves one invoice and a typed conflict, never a raw 23505", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("race");
  const cp = await vendor(ALICE(), { client });
  const key = `ti-race-${randomUUID()}`;
  const p = billParticulars({ counterparty: cp });
  const b = billBasis();

  const outcomes = await withClientRungHeld(client, async (release) => {
    const a = admitTradeInvoiceWork({ client, author: ALICE(), intentKey: key, particulars: p, basis: b })
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e.code, detail: e.detail }));
    const c = admitTradeInvoiceWork({ client, author: ALICE(), intentKey: key, particulars: p, basis: b })
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e.code, detail: e.detail }));
    await awaitRungWaiters(2);
    await release();
    return Promise.all([a, c]);
  });
  assert.equal(await invoiceCount(client), 1,
    "p655.replay.race: exactly ONE clara.trade_invoices row survives the race");
  for (const o of outcomes) {
    if (!o.ok) {
      assert.notEqual(o.code, "23505",
        "p655.replay.race: the loser leaves as a TYPED refusal, never a raw unique violation the runtime cannot classify");
    }
  }
  const ok = outcomes.filter((o) => o.ok);
  assert.ok(ok.length >= 1, "p655.replay.race: at least one caller is answered");
  const ids = new Set(ok.map((o) => o.r.invoice_id));
  assert.equal(ids.size, 1, "p655.replay.race: every answered caller names the SAME invoice");

  // ---- THE DIVERGENT RACE (the fix-round arm) -------------------------------------------
  // THE ARM ABOVE RACES ONE PAYLOAD WITH ITSELF, so the only divergence the door cannot see from
  // its pre-rung probe -- two DIFFERENT typed particulars under ONE key -- was never exercised.
  // The sequential case is caught at step 4 (p655.replay.one_receipt), but step 4 runs BEFORE the
  // rung: a concurrent pair both pass it, and after the rung the door delegates conflict detection
  // to clara._admit_accounting_work_core, which compares basis digest / purpose / source_refs /
  // adjustment (0194:1171-1190) and can see NOTHING of the counterparty, the reference, the dates
  // or the total. So the loser's typed half must be re-read against the row that actually survived
  // -- the same idiom the core uses for its own concurrent-race re-read (0194:1239-1256).
  //
  // WHAT AN UNGUARDED DOOR DOES, measured before the fix: BOTH callers leave as SUCCESS, the
  // loser's trade invoice is silently discarded by `on conflict (work_id) do nothing`, and the
  // loser is answered the WINNER's invoice_id folded together with its OWN kind / counterparty_id
  // / due_date -- an answer describing an object the database does not hold.
  const dclient = await tiClient("racediverge");
  const alpha = await vendor(ALICE(), { client: dclient, name: `Race Alpha ${randomUUID().slice(0, 8)}` });
  const beta = await vendor(ALICE(), { client: dclient, name: `Race Beta ${randomUUID().slice(0, 8)}` });
  const dkey = `ti-race-diverge-${randomUUID()}`;
  const pA = billParticulars({ counterparty: alpha, reference: "RACE-A-0001" });
  const pB = billParticulars({ counterparty: beta, reference: "RACE-B-0002" });
  const db_ = billBasis();   // THE SAME journal basis, so the core's own digest comparison agrees
                             // and the ONLY divergence is the typed half this ticket exists for.

  const raced = await withClientRungHeld(dclient, async (release) => {
    const a = admitTradeInvoiceWork({ client: dclient, author: ALICE(), intentKey: dkey, particulars: pA, basis: db_ })
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e.code, detail: e.detail }));
    const c = admitTradeInvoiceWork({ client: dclient, author: ALICE(), intentKey: dkey, particulars: pB, basis: db_ })
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, code: e.code, detail: e.detail }));
    await awaitRungWaiters(2);
    await release();
    return Promise.all([a, c]);
  });

  assert.equal(await invoiceCount(dclient), 1,
    "p655.replay.race: a DIVERGENT pair still leaves exactly ONE trade invoice");
  const dok = raced.filter((o) => o.ok);
  const dno = raced.filter((o) => !o.ok);
  assert.equal(dok.length, 1,
    "p655.replay.race: exactly ONE of a divergent pair is answered -- the other sent different particulars under the same key");
  assert.equal(dno.length, 1, "p655.replay.race: …and the other leaves as a refusal");
  assert.equal(dno[0].code, "CLR10",
    "p655.replay.race: the loser's refusal is the door's own typed class, never a raw 23505");
  const dDetail = typeof dno[0].detail === "string" ? JSON.parse(dno[0].detail) : dno[0].detail;
  assert.equal(dDetail.reason, TI_REASON.intentConflict,
    "p655.replay.race: …and it is intent_payload_conflict, the same name the sequential case carries");
  assert.equal(dDetail.field, "particulars",
    "p655.replay.race: …naming the offending half");

  // EVERY ANSWERED CALLER'S ANSWER DESCRIBES THE ROW ITS OWN invoice_id NAMES. This is the
  // assertion the vacuous cell could not make: the defect answered SUCCESS with a foreign party.
  const survivor = await invoiceRow(dok[0].r.invoice_id);
  assert.ok(survivor, "p655.replay.race: the answered invoice_id names a real row");
  assert.equal(dok[0].r.counterparty_id, survivor.counterparty_id,
    "p655.replay.race: the answered counterparty is the one the surviving row holds");
  assert.equal(dok[0].r.kind, survivor.kind,
    "p655.replay.race: …and so is the kind");
  assert.equal(dok[0].r.due_date_source, survivor.due_date_source,
    "p655.replay.race: …and the due-date basis");
  assert.equal(survivor.reference,
    survivor.counterparty_id === alpha ? "RACE-A-0001" : "RACE-B-0002",
    "p655.replay.race: the stored reference belongs to the SAME submission as the stored party -- never a blend of the two");
});

test("p655.duplicate.same_reference_is_NOT_probed two admissions of ONE supplier bill number under two intent keys both land -- the residual, measured rather than assumed", async (t) => {
  if (await gateTi(t)) return;
  // ADV-655-6 (fix round 1), NAMED AND MEASURED, NOT FIXED. This branch reads "duplicate"
  // exclusively as "the same INTENT replayed" -- which is what AC4 and the brief's cell 13 ask
  // for, and what p655.replay.* proves. It does NOT read "duplicate" as "this supplier's bill
  // number is already recorded": nothing in the door, the birth trigger or the belts looks at
  // (client_id, counterparty_id, reference), and `reference` carries no uniqueness (0225 section
  // A: it is nullable, and two suppliers legitimately reuse numbers, so a hard unique would be
  // WRONG). The usual shape is a warn-not-refuse probe -- the person is told "this number is
  // already recorded, here is the Work" and chooses -- and that is a new refusal/advisory surface
  // the brief does not grant this ticket.
  //
  // So the cell PINS today's behaviour instead of pretending it is not there: one bill number,
  // two keys, two payables. A later ticket that adds the probe reds this cell, which is exactly
  // how a named residual should behave.
  const client = await tiClient("dupref");
  const cp = await vendor(ALICE(), { client });
  const ref = `ALPHA-DUP-${randomUUID().slice(0, 8)}`;
  for (const tag of ["one", "two"]) {
    const a = await armed({
      client, particulars: billParticulars({ counterparty: cp, reference: ref }),
      basis: billBasis(), intentKey: `ti-dup-${tag}-${randomUUID()}`,
    });
    await post(a);
  }
  const dupes = (await rootQuery(
    "select count(*)::int n from clara.trade_invoices where client_id=$1 and reference=$2",
    [client, ref])).rows[0].n;
  assert.equal(dupes, 2,
    "p655.duplicate.same_reference_is_NOT_probed: TWO trade invoices carry one bill number -- the residual this cell names");
  const items = await openItemsForClient(client);
  assert.equal(items.length, 2, "p655.duplicate.same_reference_is_NOT_probed: …and TWO AP open items");
  assert.equal(items.reduce((s, i) => s + Number(i.amount_cents), 0), 212000,
    "p655.duplicate.same_reference_is_NOT_probed: …so the payable is doubled. A firm's own control is the "
    + "Work list and the open-item list, not this door -- until a duplicate probe is owned and built");
});

test("p655.atomic.no_partial a failure anywhere in the admission leaves no Work, no invoice, no entry, no item and no receipt", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("atomic");
  const cp = await vendor(ALICE(), { client });

  // A failure BETWEEN clara._admit_accounting_work_core returning and the trade_invoices insert is
  // the case the brief names: the two are ONE transaction, which is exactly why the typed row is
  // written AFTER the core. It is injected by making the durable insert impossible — a document
  // reference that is not this firm's — and asserting the CORE'S OWN Work is gone too.
  const foreignDoc = randomUUID();
  const worksBefore = (await rootQuery(
    "select count(*)::int n from clara.accounting_work where client_id=$1", [client])).rows[0].n;
  await assertRaises(undefined, () => admitTradeInvoiceWork({
    client, author: ALICE(), particulars: billParticulars({ counterparty: cp }), basis: billBasis(),
    sourceRefs: [{ kind: "document", document_id: foreignDoc }],
  }), "p655.atomic.no_partial: an unusable source reference").catch(() => {});
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.accounting_work where client_id=$1", [client])).rows[0].n,
  worksBefore, "p655.atomic.no_partial: no accounting_work row survived -- the two writes are ONE transaction");
  assert.equal(await invoiceCount(client), 0, "p655.atomic.no_partial: no trade invoice");
  assert.equal(await entryCount(client), 0, "p655.atomic.no_partial: no entry");
  assert.equal(await committedReceiptCount(client), 0, "p655.atomic.no_partial: no receipt");
  assert.equal((await openItemsForClient(client)).length, 0, "p655.atomic.no_partial: no open item");
});

test("p655.authority.floors viewer ⇒ insufficient_role; deactivated member ⇒ actor_not_active; another firm's client ⇒ client_not_found with no existence oracle; a locked period refused by name", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("floors");
  const cp = await vendor(ALICE(), { client });
  const p = billParticulars({ counterparty: cp });
  const b = billBasis();

  await refusesTi(client, "CLR04", TI_REASON.insufficientRole,
    () => admitTradeInvoiceWork({ client, author: CAROL(), particulars: p, basis: b }),
    "p655.authority.floors: a viewer may not record a trade invoice");

  // ANOTHER FIRM'S AUTHOR, on this firm's client: `client_not_found`, NOT "not a member" — the
  // credential must never become an existence oracle (0194's own rule).
  const oracle = await assertPair("CLR11", "client_not_found",
    () => admitTradeInvoiceWork({ client, author: DAVE(), particulars: p, basis: b }),
    "p655.authority.floors: a non-member gets client_not_found");
  assert.equal(oracle.err.message.includes("member"), false,
    "p655.authority.floors: …and the message does not leak that the client exists");
  const missing = await assertPair("CLR11", "client_not_found",
    () => admitTradeInvoiceWork({ client: randomUUID(), author: ALICE(), particulars: p, basis: b }),
    "p655.authority.floors: an unknown client id gets the SAME answer");
  assert.equal(missing.err.message, oracle.err.message,
    "p655.authority.floors: an unknown firm and a non-member are INDISTINGUISHABLE");

  // A DEACTIVATED MEMBER.
  const tmp = await tiClient("floorsdeact");
  const tmpCp = await vendor(ALICE(), { client: tmp });
  await rootQuery(
    "update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
    [BOB(), FIRM_A()]);
  try {
    await refusesTi(tmp, "CLR04", "actor_not_active",
      () => admitTradeInvoiceWork({
        client: tmp, author: BOB(),
        particulars: billParticulars({ counterparty: tmpCp }),
        basis: b,
      }),
      "p655.authority.floors: a deactivated member");
  } finally {
    await rootQuery(
      "update clara.firm_memberships set status='active' where user_id=$1 and firm_id=$2",
      [BOB(), FIRM_A()]);
  }

  // A LOCKED PERIOD, refused BY NAME at admission rather than at the wall minutes later.
  const sealed = await tiClient("floorssealed");
  const scp = await vendor(ALICE(), { client: sealed });
  // A LABELLED FIXTURE SHORTCUT: `clara.open_fiscal_year` opens a year, and closing one runs the
  // whole close model (0056) — which is #676/#656 territory, not this cell's. The cell under test
  // is the DOOR'S refusal, so the sealed year is written directly and said so.
  await rootQuery(
    `insert into clara.fiscal_years(firm_id, client_id, label, starts_on, ends_on, ordinal,
        status, fy_end_source, opened_by)
     select c.firm_id, c.id, 'FY2026 (rig)', date '2026-01-01', date '2026-12-31', 1,
        'closed', 'asserted', $2
       from clara.clients c where c.id = $1`, [sealed, ALICE()]);
  await refusesTi(sealed, "CLR19", TI_REASON.periodLocked,
    () => admitTradeInvoiceWork({
      client: sealed, author: ALICE(),
      particulars: billParticulars({ counterparty: scp }), basis: billBasis(),
    }),
    "p655.authority.floors: a closed fiscal year is refused by name");

  // AND THE DOOR ITSELF IS clara_runtime's. A signed-in human cannot call it at all.
  await assertRaises("42501",
    () => admitTradeInvoiceWork({ client, author: ALICE(), particulars: p, basis: b,
      role: ROLES.authenticated }),
    "p655.authority.floors: clara_authenticated may not execute the admission door");

  // AND A BLANK INTENT KEY NEVER OWNS A WORK.
  await refusesTi(client, "CLR10", TI_REASON.invalidIntentKey,
    () => admitTradeInvoiceWork({ client, author: ALICE(), intentKey: "   ", particulars: p, basis: b }),
    "p655.authority.floors: a whitespace intent key is refused before anything durable");
});

test("p655.authority.cited_and_inactive the last two tokens of the door's ladder are DRIVEN: a document that already backs a posted entry, and a client that is no longer active", async (t) => {
  if (await gateTi(t)) return;
  // ADV-655-4 (fix round 1). `source_already_posted` and `client_inactive` were declared in the
  // fixtures, raised in the door and named in the contract stanza, but no cell, World leg or walk
  // ever drove them -- and DECISIONS section 4 admits a NAMED residual, never silence. Both are
  // driven here, through `refusesTi`, so the "wrote nothing" half is proved too.
  const rf = await import("./rig-fixtures.mjs");

  // ---- source_already_posted --------------------------------------------------------------
  // The FIRST trade invoice cites a real verified document and posts; the posting core writes the
  // clara.entry_evidence_links row (0204:687-700) that clara._document_posting_entry reads. The
  // SECOND admission cites the same document and must be refused BY NAME, at admission, rather
  // than reaching uq_entry_evidence_links_document as a raw 23505 minutes later.
  const cited = await tiClient("cited");
  const ccp = await vendor(ALICE(), { client: cited });
  const doc = await rf.ingestDocument(ALICE(), {
    client: cited,
    sha256: `${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "")}`,   // 64 lowercase hex — documents_sha256_check
    filename: "alpha-bill.pdf", opKey: opk("ti-cited-doc"),
  });
  const first = await armed({
    client: cited, particulars: billParticulars({ counterparty: ccp }), basis: billBasis(),
    sourceRefs: [{ kind: "document", document_id: doc }],
  });
  await post(first);
  assert.equal(await entryCount(cited), 1, "p655.authority.cited_and_inactive: the cited invoice posted");

  const already = await refusesTi(cited, "CLR13", TI_REASON.sourceAlreadyPosted,
    () => admitTradeInvoiceWork({
      client: cited, author: ALICE(),
      particulars: billParticulars({ counterparty: ccp, reference: "ALPHA-2026-0043" }),
      basis: billBasis(), sourceRefs: [{ kind: "document", document_id: doc }],
    }),
    "p655.authority.cited_and_inactive: a document that already backs a posted entry");
  assert.equal(already.detail.document_id, doc,
    "p655.authority.cited_and_inactive: …and the refusal names the document");
  assert.ok(already.detail.entry_id,
    "p655.authority.cited_and_inactive: …and the entry that already holds it, so the person can open it");

  // ---- client_inactive ----------------------------------------------------------------------
  // A LABELLED FIXTURE SHORTCUT: archiving a client is the client lifecycle's own door (#635's
  // surface), and driving it here would test that lane rather than this one. The status is
  // written directly, said so, and put back.
  const dormant = await tiClient("dormant");
  const dcp2 = await vendor(ALICE(), { client: dormant });
  await rootQuery("update clara.clients set status='archived' where id=$1", [dormant]);
  try {
    await refusesTi(dormant, "CLR10", TI_REASON.clientInactive,
      () => admitTradeInvoiceWork({
        client: dormant, author: ALICE(),
        particulars: billParticulars({ counterparty: dcp2 }), basis: billBasis(),
      }),
      "p655.authority.cited_and_inactive: an archived client admits no new accounting work");
  } finally {
    await rootQuery("update clara.clients set status='active' where id=$1", [dormant]);
  }
});

test("p655.party.resolution an ambiguous party is refused at ADMISSION with the candidate list carried verbatim", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("party");
  const name = `Ambiguous Trading ${randomUUID().slice(0, 6)}`;
  const one = await vendor(ALICE(), { client, name, registration: "200101000001" });
  const two = await vendor(ALICE(), { client, name, registration: "200101000002" });

  const amb = await refusesTi(client, "CLR10", TI_REASON.partyAmbiguous,
    () => admitTradeInvoiceWork({
      client, author: ALICE(),
      particulars: billParticulars({ counterparty: null, name }), basis: billBasis(),
    }),
    "p655.party.resolution: two vendors answer to one name");
  const detail = amb.detail;
  assert.equal(detail.candidates.length, 2,
    "p655.party.resolution: the candidate list is CARRIED, so the person picks from what the books hold");
  assert.deepEqual(new Set(detail.candidates.map((c) => c.counterparty_id)), new Set([one, two]));
  assert.ok(detail.candidates.every((c) => c.registration_no),
    "p655.party.resolution: …with the identifier that tells them apart");

  // Naming one by ID resolves it.
  const ok = await admitTradeInvoiceWork({
    client, author: ALICE(), particulars: billParticulars({ counterparty: one }), basis: billBasis() });
  assert.equal((await invoiceRow(ok.invoice_id)).counterparty_id, one);

  // A name nobody answers to is `party_unresolved`, not an invented counterparty: 2026-09-15 D11
  // gives this lane identity provenance to CONSUME and no alias to write.
  await refusesTi(client, "CLR10", TI_REASON.partyUnresolved,
    () => admitTradeInvoiceWork({
      client, author: ALICE(),
      particulars: billParticulars({ counterparty: null, name: "Nobody Sdn Bhd" }),
      basis: billBasis(),
    }),
    "p655.party.resolution: an unknown name is refused, never silently created");
  const aliasWriters = (await rootQuery(
    `select count(*)::int n from pg_proc p join pg_namespace nn on nn.oid=p.pronamespace
      where nn.nspname='clara' and p.proname like 'clara%trade_invoice%'
        and position('counterparty_aliases' in p.prosrc) > 0`)).rows[0].n;
  assert.equal(aliasWriters, 0,
    "p655.party.resolution: no #655 body WRITES clara.counterparty_aliases (2026-09-15 D11)");
});

// ===========================================================================================
// 5 · THE SUBLEDGER'S OWN LAWS ON THE NEW LANE.
// ===========================================================================================

test("p655.classify.ladder_3t the classifier answers 'bill'/'invoice' for the new lane and is byte-identical for every other input", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("ladder3t");
  await postedBill(client);
  const entry = (await entriesForClient(client))[0];
  const cl = await classifyEntry(entry.id);
  assert.equal(cl.length, 1);
  assert.equal(cl[0].item_kind, "bill",
    "p655.classify.ladder_3t: LADDER 3T answers 'bill', not LADDER 5's 'adjustment' -- which is what keeps clara._tf_subledger_entry_belt ARM 1 green");
  assert.equal(cl[0].domain, "ap");
  assert.equal(String(cl[0].amount_cents), "106000");

  // A coding_kind-NULL entry NO trade invoice names still classifies 'adjustment' (LADDER 5).
  const plain = await tiClient("ladder3tplain");
  const pcp = await vendor(ALICE(), { client: plain });
  const d = await import("./s6-helpers.mjs");
  const rf = await import("./rig-fixtures.mjs");
  const draft = await d.draftEntryV3(ALICE(), {
    client: plain, resolution: await rf.freshResolution(ALICE(), plain, { subjectKind: "manual", subjectId: null }),
    postingDate: TI_DATE.posting, memo: "a plain coded-nothing entry with a control leg",
    lines: [
      { account_code: TICHART.expense, debit_cents: 5000, credit_cents: 0, description: "x" },
      { account_code: TICHART.payable, debit_cents: 0, credit_cents: 5000, description: "y" },
    ],
    vendor: { existing_id: pcp }, opKey: opk("ti-plain-draft"),
  });
  await rf.approveEntry(BOB(), {
    entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ti-plain-approve") });
  const pcl = await classifyEntry(draft.entry_id);
  assert.equal(pcl[0].item_kind, "adjustment",
    "p655.classify.ladder_3t: LADDER 5 is untouched -- coding_kind NULL with no trade invoice is still 'adjustment'");
  assert.equal((await openItemsForEntry(draft.entry_id))[0].item_kind, "adjustment",
    "p655.classify.ladder_3t: …and clara._subledger_on_approve still writes exactly that");
});

test("p655.tieout.control the AR and AP control-account GL balances equal the sum of their open items' outstanding, FROM ZERO", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("tieout");
  assert.equal(await controlBalance(client, "payable"), 0n, "p655.tieout.control: from zero");
  assert.equal(await subledgerOutstanding(client, "ap"), 0n);

  await postedBill(client);
  const cust = await customer(ALICE(), { client });
  const a = await armed({
    client, kind: TI_KIND.sales, particulars: invoiceParticulars({ counterparty: cust }),
    basis: invoiceBasis(),
  });
  await post(a);

  assert.equal(await controlBalance(client, "payable"), await subledgerOutstanding(client, "ap"),
    "p655.tieout.control: the AP control account equals the AP subledger -- x37.a's identity, re-proven on the NEW lane");
  assert.equal(await controlBalance(client, "receivable"), await subledgerOutstanding(client, "ar"),
    "p655.tieout.control: and the AR side");
  assert.equal(await controlBalance(client, "payable"), 106000n);
  assert.equal(await controlBalance(client, "receivable"), 106000n);
});

test("p655.reversal.unwinds reversing a trade-invoice entry unwinds its open item through LADDER 1, with no change to that ladder", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("reversal");
  await postedBill(client);
  const entry = (await entriesForClient(client))[0];
  const rf = await import("./rig-fixtures.mjs");
  await rf.reverseEntry(ALICE(), { entry: entry.id, reason: "rig: wrong supplier", opKey: opk("ti-rev") });

  const items = await openItemsForClient(client);
  const unwind = items.filter((i) => i.item_kind === "reversal_unwind");
  assert.equal(unwind.length, 1, "p655.reversal.unwinds: LADDER 1 minted exactly ONE unwind item");
  assert.equal(String(unwind[0].amount_cents), "-106000",
    "p655.reversal.unwinds: negating the original, exactly as 0037:940-957 does");
  assert.equal(await controlBalance(client, "payable"), 0n,
    "p655.reversal.unwinds: the control account is back to zero…");
  assert.equal(await subledgerOutstanding(client, "ap"), 0n,
    "p655.reversal.unwinds: …and so is the subledger");
  // THE BIRTH TRIGGER DID NOT FIRE FOR THE MIRROR: a mirror carries reversal_of, so the classifier
  // takes LADDER 1 and the trigger finds no trade invoice naming it.
  assert.equal(items.filter((i) => i.item_kind === "bill").length, 1,
    "p655.reversal.unwinds: still exactly ONE bill item -- the mirror birthed no second one");
});

test("p655.parity.source_vs_direct a coding-lane supplier bill and a Work-lane trade invoice for the SAME facts produce the same control movement, kind, sign and due date", async (t) => {
  if (await gateTi(t)) return;
  // THE WORK LANE.
  const direct = await tiClient("paritydirect");
  const dcp = await vendor(ALICE(), { client: direct, termsDays: 30 });
  const a = await armed({
    client: direct, particulars: billParticulars({ counterparty: dcp, dueDate: null }),
    basis: billBasis({ taxCents: 0 }),
  });
  await post(a);
  const dEntry = (await entriesForClient(direct))[0];
  const dItem = (await openItemsForEntry(dEntry.id))[0];

  // THE CODING LANE, through its OWN doors: a human draft with a supplier_bill coding kind,
  // approved by a DISTINCT human, so clara._approve_entry_core -> clara._subledger_on_approve
  // writes the item.
  const coded = await tiClient("paritycoded");
  const ccp = await vendor(ALICE(), { client: coded, termsDays: 30 });
  const s6 = await import("./s6-helpers.mjs");
  const rf = await import("./rig-fixtures.mjs");
  const draft = await s6.draftEntryV3(ALICE(), {
    client: coded,
    resolution: await rf.freshResolution(ALICE(), coded, { subjectKind: "manual", subjectId: null }),
    postingDate: TI_DATE.posting, memo: "Alpha Supplies bill, office paper",
    lines: s6.billLines(TICHART.expense, TICHART.payable, 106000),
    vendor: { existing_id: ccp }, opKey: opk("ti-parity-draft"),
  }).catch((e) => { throw new Error(`parity coding-lane draft raised ${e.code}: ${e.message}`); });
  // A LABELLED FIXTURE SHORTCUT, stated rather than hidden (the ensureWorkChart precedent):
  // `clara.draft_entry` passes NULL for p_coding_kind (0009:1424-1425), so a HUMAN can never
  // create a coded invoice entry at all — which is itself one of this ticket's findings. The
  // coding lane's own producer is the document/extraction path (invoiceFacts -> autoDraft ->
  // wake_post_entry), and dragging a whole extraction corpus in here would test the fixture rather
  // than the parity. The kind is stamped on the DRAFT, before approve, so
  // clara._approve_entry_core -> clara._subledger_on_approve classifies it exactly as the real
  // coding lane would.
  await rootQuery("update clara.journal_entries set coding_kind='supplier_bill' where id=$1",
    [draft.entry_id]);
  await rf.approveEntry(BOB(), {
    entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("ti-parity-approve") });
  const cItem = (await openItemsForEntry(draft.entry_id))[0];

  assert.equal(dItem.domain, cItem.domain, "p655.parity: the same control domain");
  assert.equal(String(dItem.amount_cents), String(cItem.amount_cents),
    "p655.parity: the same signed amount, to the sen");
  assert.equal(dItem.item_date, cItem.item_date, "p655.parity: the same item date");

  // THE DUE DATE, ASSERTED AGAINST THE RULE AND NOT AGAINST THE OTHER LANE'S OUTPUT.
  //
  // ADV-655-3 (fix round 1): `assert.equal(dItem.due_date, cItem.due_date)` alone proves that two
  // implementations agree on an arithmetic, never that the arithmetic is the right one for a lane
  // that carries a SEPARATE document date. THIS Work-lane invoice states document_date 2026-03-04
  // and posts on 2026-03-31, so the two candidate anchors are 27 days apart and exactly one of
  // them is what the estate wrote. The cell now NAMES it.
  //
  // ADV-655-2, RECORDED HERE RATHER THAN SILENTLY FIXED: payment terms conventionally run from the
  // DOCUMENT, and the anchor is what the ticket added `document_date` for. But brief-655.md's
  // section 4 cell 11 prescribes `posting_date + 30` verbatim, and D12c leaves the anchor unstated
  // while pointing at the legacy producer 0040:6010-6015. Changing it changes what the brief
  // specifies, so it is RATIFICATION-REQUESTED, not a hunk -- and until it is ruled, the number
  // the estate actually writes is pinned here in the open. Flipping the anchor reds THIS line
  // first, which is the point.
  const TERMS_FROM_POSTING = "2026-04-30";   // TI_DATE.posting  + 30
  const TERMS_FROM_DOCUMENT = "2026-04-03";  // TI_DATE.document + 30
  assert.equal(dItem.due_date, TERMS_FROM_POSTING,
    "p655.parity: the counterparty-terms fallback anchors on the POSTING date (0225's clara._trade_invoice_due, "
    + "brief section 4 cell 11) -- NOT on the document date, though the document date is 27 days earlier here");
  assert.notEqual(TERMS_FROM_POSTING, TERMS_FROM_DOCUMENT,
    "p655.parity: the two anchors genuinely disagree on this fixture, so the assertion above is not vacuous");
  assert.equal(dItem.due_date, cItem.due_date,
    "p655.parity: and the coding lane derives the same date from the same anchor (0040:6010-6015)");
  assert.equal(await controlBalance(direct, "payable"), await controlBalance(coded, "payable"),
    "p655.parity: the same control-account movement");
  // THE HONEST RESIDUAL, asserted rather than glossed: the two lanes' item KINDS agree only
  // because 0225 taught the classifier the new lane; the two lanes are still walled apart at the
  // wake allowlist and the receipt shape, which is #665's cutover to merge.
  assert.equal(cItem.item_kind, "bill");
  assert.equal(dItem.item_kind, "bill",
    "p655.parity: both lanes produce item_kind='bill' for the same economic facts");
});

// ===========================================================================================
// 6 · GRANTS, CENSUSES AND THE NEGATIVES.
// ===========================================================================================

test("p655.grants the ONE door is clara_runtime's, the read is the human's, the internals are nobody's, and there is no attestation", async (t) => {
  if (await gateTi(t)) return;
  const DOOR = "clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)";
  const can = async (role, fn) => (await rootQuery(
    "select has_function_privilege($1,$2,'EXECUTE') as ok", [role, fn])).rows[0].ok;

  assert.equal(await can(ROLES.runtime, DOOR), true, "p655.grants: clara_runtime HOLDS the door");
  assert.equal(await can(ROLES.authenticated, DOOR), false,
    "p655.grants: clara_authenticated holding it is a FAILURE (0221:1880-1888's pair) -- Work admission on this lane is a runtime act OBO a named human");
  for (const role of [ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    assert.equal(await can(role, DOOR), false, `p655.grants: ${role} does not hold the door`);
  }
  // NO `_for` TWIN and no second door.
  const doors = (await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname like '%trade_invoice%' and p.proname not like '\\_%'
      order by 1`)).rows.map((r) => r.proname);
  assert.deepEqual(doors, ["admit_trade_invoice_work", "get_trade_invoice"],
    "p655.grants: exactly ONE admission door and ONE read carry public names");

  assert.equal(await can(ROLES.authenticated, "clara.get_trade_invoice(uuid)"), true,
    "p655.grants: the read is reachable by the signed-in human");
  for (const fn of ["clara._assert_trade_invoice_basis(uuid,text,jsonb,jsonb,boolean)",
    "clara._trade_invoice_resolve_party(uuid,text,jsonb)",
    "clara._trade_invoice_kind_of_entry(uuid)",
    "clara._tf_je_open_item_birth()"]) {
    for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo]) {
      assert.equal(await can(role, fn), false, `p655.grants: ${role} may not execute the internal ${fn}`);
    }
  }
  // NO p_attestation, and the high-stakes ceremony is unreachable (CB-AE2E-013).
  const args = (await rootQuery(
    "select proargnames from pg_proc where oid=$1::regprocedure", [DOOR])).rows[0].proargnames;
  assert.equal(args.includes("p_attestation"), false,
    "p655.grants: the door carries NO p_attestation -- accepted role authority IS the authority");
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid=$1::regprocedure", [DOOR])).rows[0].prosrc;
  assert.equal(/is_high_stakes|approve_entry/.test(src), false,
    "p655.grants: clara.approve_entry's is_high_stakes ceremony (0009:1513-1523) is unreachable from this door");

  // ZERO DML GRANTS AND FORCE RLS on both new relations.
  for (const rel of ["clara.trade_invoices", "clara.trade_invoice_status"]) {
    const r = (await rootQuery(
      "select relrowsecurity, relforcerowsecurity from pg_class where oid=$1::regclass", [rel])).rows[0];
    assert.equal(r.relrowsecurity && r.relforcerowsecurity, true, `p655.grants: ${rel} is FORCE RLS`);
    for (const role of [ROLES.authenticated, ROLES.runtime, ROLES.agentRo]) {
      for (const priv of ["INSERT", "UPDATE", "DELETE"]) {
        assert.equal((await rootQuery(
          "select has_table_privilege($1,$2,$3) as ok", [role, rel, priv])).rows[0].ok, false,
        `p655.grants: ${role} holds no ${priv} on ${rel}`);
      }
    }
  }
});

test("p655.census.writers the open_items writer set is exactly TWO, the subledger-hook caller set is still SIX, and the birth names neither the hook nor the classifier", async (t) => {
  if (await gateTi(t)) return;
  const writers = (await rootQuery(
    `select array_agg(p.proname::text order by p.proname) a
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and position('insert into clara.open_items(' in p.prosrc) > 0`)).rows[0].a;
  assert.deepEqual(writers, ["_subledger_on_approve", "_tf_je_open_item_birth"],
    "p655.census.writers: TWO writers, superseding 0037:3830-3833's ONE (#868's stale copy, closed in 0225's tail)");

  const callers = (await rootQuery(
    `select array_agg(p.proname::text order by p.proname) a
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0
        and p.proname <> '_subledger_on_approve'`)).rows[0].a;
  assert.deepEqual(callers, ["_approve_entry_core", "_approve_opening_entry",
    "approve_wrong_client_correction", "finalize_close", "reopen_fiscal_year", "reverse_entry"],
  "p655.census.writers: the hook's caller set is STILL the measured SIX (0216:938-947) -- #655 adds none");

  const birth = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._tf_je_open_item_birth()'::regprocedure")).rows[0].prosrc;
  assert.equal(birth.includes("clara._subledger_on_approve("), false,
    "p655.census.writers: the birth trigger does not call the hook");
  assert.equal(birth.includes("clara._subledger_classify_entry("), false,
    "p655.census.writers: nor the classifier -- it reads its kind from the TYPED OBJECT (0037:995-996 would return 'adjustment')");

  // THE APPROVE-PATH SET. 0037:3774-3782 pinned FOUR before the Work lane existed;
  // fixed-asset-acquisition.test.mjs:242-267's `!sub.includes("_record_journal_entry_core")` stays
  // TRUE after this slice (the core births through the trigger and still does not call the hook),
  // and the NEW writer is named here so a reader is not left looking for it.
  const approvers = (await rootQuery(
    `select array_agg(p.proname::text order by p.proname) a
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.prosrc ~ 'set\\s+status\\s*=\\s*''approved'''
        and p.proname not like '\\_tf\\_%'`)).rows[0].a;
  assert.ok(approvers.includes("_record_journal_entry_core"),
    "p655.census.writers: the approve-path census names the Work-lane core");
});

test("p655.belts the entry belt and the item belt both tie on the new lane -- the finding that shaped 0225", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("belts");
  // That the bill posted AT ALL is the assertion: clara._tf_subledger_entry_belt ARM 1 and
  // clara._tf_subledger_item_belt's KIND-TO-SOURCE arm are DEFERRED constraint triggers, so a
  // divergence between the classifier and the item raises at COMMIT, not at insert.
  await postedBill(client);
  const entry = (await entriesForClient(client))[0];

  // ARM 1, re-run by hand at the belt's own predicate, so the cell states the number rather than
  // only that nothing threw.
  const bad = (await rootQuery(`
    select count(*)::int v from (
      select 1 from clara._subledger_classify_entry($1::uuid) cl
      full outer join (
        select oi.domain d, clara._canonical_counterparty(oi.client_id, oi.counterparty_id) cp,
               sum(oi.amount_cents)::bigint amt, min(oi.item_kind) k,
               count(distinct oi.item_kind)::int kn
          from clara.open_items oi where oi.entry_id = $1::uuid group by 1,2
         having sum(oi.amount_cents) <> 0
      ) it on it.d = cl.domain and it.cp is not distinct from cl.counterparty_id
      where cl.amount_cents is distinct from it.amt or cl.item_kind is distinct from it.k
         or coalesce(it.kn,1) <> 1) z`, [entry.id])).rows[0].v;
  assert.equal(bad, 0,
    "p655.belts: clara._tf_subledger_entry_belt ARM 1 sees ZERO divergent grain rows -- measured at 1 before 0225's LADDER 3T");
});

test("p655.appendonly the trade invoice admits no update and no delete, and the status ledger is append-only too", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("appendonly");
  const b = await postedBill(client);
  await assertRaises("CLR08",
    () => rootQuery("update clara.trade_invoices set reference='rewritten' where id=$1", [b.invoice_id]),
    "p655.appendonly: a trade invoice admits no update");
  await assertRaises("CLR08",
    () => rootQuery("update clara.trade_invoices set created_at=created_at where id=$1", [b.invoice_id]),
    "p655.appendonly: …not even a no-op one");
  await assertRaises("CLR08",
    () => rootQuery("delete from clara.trade_invoices where id=$1", [b.invoice_id]),
    "p655.appendonly: nor a delete");
  const st = (await invoiceStatus(b.invoice_id))[0];
  await assertRaises("CLR08",
    () => rootQuery("update clara.trade_invoice_status set state='refused' where id=$1", [st.id]),
    "p655.appendonly: the status ledger is append-only");
  // AND THE LEDGER'S HISTORY IS COMPLETE: admitted, then posted.
  assert.deepEqual((await invoiceStatus(b.invoice_id)).map((r) => r.state).sort(),
    ["admitted", "posted"],
    "p655.appendonly: one row per (invoice, state) -- admitted at the door, posted at the receipt");
});

test("p655.read.floor clara.get_trade_invoice is viewer-floored and firm-scoped", async (t) => {
  if (await gateTi(t)) return;
  const client = await tiClient("readfloor");
  const b = await postedBill(client);
  const asViewer = await getTradeInvoice(CAROL(), b.work_id);
  assert.ok(asViewer, "p655.read.floor: a viewer of the firm reads it");
  assert.equal(asViewer.invoice_id, b.invoice_id);
  const asStranger = await getTradeInvoice(DAVE(), b.work_id);
  assert.equal(asStranger, null,
    "p655.read.floor: another firm's owner reads NOTHING -- firm-scoped, and never an existence oracle");
});
