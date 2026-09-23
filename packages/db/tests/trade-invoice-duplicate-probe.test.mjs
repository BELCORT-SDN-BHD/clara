// #1007 — WARN BEFORE RECORDING A TRADE INVOICE THAT LOOKS LIKE ONE ALREADY RECORDED.
//
// Owner's ruling (2026-09-20, on the ticket): check at the RECORDING step, WARN and let the
// person decide, NEVER refuse; and do not look at the document number alone — also look at the
// amount and the counterparty. So this battery's subject is a READ that answers "which recorded
// invoices look like this one?", plus the durable record of a person who was warned and went on.
//
// THE SEAMS ARE THE THREE NEW DOORS AND NOTHING BELOW THEM:
//   · `clara.probe_trade_invoice_duplicates`      — the signed-in bookkeeper's own read (the form)
//   · `clara.probe_trade_invoice_duplicates_for`  — the runtime twin, actor-explicit (the chat lane)
//   · `clara.record_trade_invoice_duplicate_ack`  — the "recorded anyway" record, a runtime act
//     OBO a named human, read back through `clara.get_trade_invoice_duplicate_ack`
// `clara._trade_invoice_duplicate_matches` and `clara._trade_invoice_reference_key` are UNGRANTED
// internals (this file's migration tail asserts that), so no cell calls them directly.
//
// The cells are named `p1007.*`. They live in their own file so #1007's frontier (migration 0275)
// can skip independently of #655's (0225) and #982's (0274).

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  gateTiDup, TI_KIND, TI_DUP_SIGNAL,
  ensureTiChart, vendor, billParticulars, billBasis,
  admitTradeInvoiceWork, probeTradeInvoiceDuplicates,
  buildWorkWorld, freshWorkClient, endPool,
  claimWorkRun, settleWorkRun, mintClientObo, wakeRecordJournalEntry, entriesForClient,
  opk, rootQuery, assertPair, customer, invoiceParticulars, invoiceBasis,
} from "./trade-invoice-fixtures.mjs";
import { withActor, ROLES } from "./rig-helpers.mjs";
import { printLaneNotes, printSkipCount } from "./wave-a-helpers.mjs";

let world;
before(async () => { world = await buildWorkWorld(); });
after(async () => {
  printLaneNotes("trade-invoice-duplicate-probe");
  printSkipCount("trade-invoice-duplicate-probe");
  await endPool();
});

const ALICE = () => world.users.alice;      // owner of firm A

/** A dedicated client of firm A carrying the trade-invoice chart. The probe is client-scoped, so
 *  a fresh client per cell is what makes each cell's invoice population exactly what it says. */
async function tiClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensureTiChart(ALICE(), client, tag);
  return client;
}

/** Record one supplier bill through the lane's own admission door and return its receipt. */
async function recordBill(client, over = {}) {
  const r = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: over.kind ?? TI_KIND.bill,
    particulars: billParticulars(over.particulars ?? {}),
    basis: billBasis(over.basis ?? {}),
    intentKey: over.intentKey ?? `ti-dup-${randomUUID()}`,
  });
  return r;
}

/** Record one supplier bill AND post it, through the lane's own wake verb. */
async function postBill(client, over = {}) {
  const b = billBasis(over.basis ?? {});
  const admitted = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: over.kind ?? TI_KIND.bill,
    particulars: billParticulars(over.particulars ?? {}), basis: b,
    intentKey: over.intentKey ?? `ti-dup-${randomUUID()}`,
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("tidup-run") });
  const cred = await mintClientObo({ firm: world.firms.A, obo: ALICE(), client });
  await wakeRecordJournalEntry(cred.secret, {
    client, work: admitted.work_id, logicalOpId: admitted.logical_op_id, basis: b,
  });
  return admitted;
}

test("p1007.probe.same_reference an earlier bill from the SAME vendor carrying the SAME document number is reported, and the match names the signal that fired", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("dupref");
  const cp = await vendor(ALICE(), { client });
  const reference = `ALPHA-${randomUUID().slice(0, 8)}`;
  const first = await recordBill(client, { particulars: { counterparty: cp, reference } });

  // A DIFFERENT total on a DIFFERENT day, so ONLY the document-number signal can fire and the
  // cell proves that signal rather than the pair.
  const out = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: cp, reference, totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.equal(out.match_count, 1,
    "p1007.probe.same_reference: the probe found exactly the one bill already recorded under that number");
  assert.equal(out.matches[0].invoice_id, first.invoice_id,
    "p1007.probe.same_reference: …and it is THAT bill, named by its own invoice id");
  assert.equal(out.matches[0].work_id, first.work_id,
    "p1007.probe.same_reference: …carrying the Work that recorded it, so the person can open it");
  assert.deepEqual(out.matches[0].signals, [TI_DUP_SIGNAL.reference],
    "p1007.probe.same_reference: …and it names WHICH signal fired -- the document number, not the money");
});

test("p1007.probe.normalised INV-001 and inv001 are ONE document number for the same vendor, and the same number under ANOTHER vendor is not a match at all", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("dupnorm");
  const alpha = await vendor(ALICE(), { client, name: `Alpha Supplies ${randomUUID().slice(0, 8)}` });
  const beta = await vendor(ALICE(), { client, name: `Beta Trading ${randomUUID().slice(0, 8)}` });
  const recorded = await recordBill(client, {
    particulars: { counterparty: alpha, reference: "INV-001" },
  });

  // Case, spaces and punctuation ignored — the estate's ONE identifier normalisation.
  const same = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: alpha, reference: "inv 001", totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.equal(same.match_count, 1,
    "p1007.probe.normalised: `inv 001` and `INV-001` are the same document number");
  assert.equal(same.matches[0].invoice_id, recorded.invoice_id,
    "p1007.probe.normalised: …and it is the bill Alpha actually sent");
  assert.equal(same.reference_key, "inv001",
    "p1007.probe.normalised: the probe says WHICH key it compared, so a reader can check it");

  // THE COUNTERPARTY IS PART OF EVERY SIGNAL. Two suppliers legitimately number their own
  // documents 1, 2, 3 — a reference alone is never a duplicate.
  const other = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: beta, reference: "INV-001", totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.equal(other.match_count, 0,
    "p1007.probe.normalised: the SAME number under a different vendor is not a probable duplicate");
  assert.deepEqual(other.matches, [],
    "p1007.probe.normalised: …and the answer is an empty list, never a null the browser has to guess about");
});

test("p1007.probe.same_money_same_day with NO number stated, the same vendor, total and document date match; the same total on a DIFFERENT day does not", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("dupmoney");
  const cp = await vendor(ALICE(), { client });
  const recorded = await recordBill(client, {
    particulars: { counterparty: cp, reference: null, totalCents: 106000, documentDate: "2026-03-04" },
  });

  const same = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: cp, reference: null, totalCents: 106000, documentDate: "2026-03-04",
    }),
  });
  assert.equal(same.match_count, 1,
    "p1007.probe.same_money_same_day: the SIGNAL FOR A MISSING NUMBER fired -- same vendor, same total, same day");
  assert.equal(same.matches[0].invoice_id, recorded.invoice_id,
    "p1007.probe.same_money_same_day: …and it is the bill already recorded");
  assert.deepEqual(same.matches[0].signals, [TI_DUP_SIGNAL.money],
    "p1007.probe.same_money_same_day: …named as the money signal, because no number was stated on either side");

  // A MONTHLY RENT BILL IS THE WHOLE REASON THE DATE IS PART OF THE SIGNAL: the same vendor and
  // the same amount, one month later, is an ordinary second bill and not a duplicate.
  const later = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: cp, reference: null, totalCents: 106000, documentDate: "2026-04-04",
    }),
  });
  assert.equal(later.match_count, 0,
    "p1007.probe.same_money_same_day: the same vendor and the same total on ANOTHER day is not a probable duplicate");
});

test("p1007.probe.never_posting an invoice whose Work was refused, failed or cancelled does not count, and neither does one whose entry was reversed", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("dupdead");
  const cp = await vendor(ALICE(), { client });

  // FOUR EARLIER BILLS FROM ONE VENDOR, each under its own document number so only signal 1 can
  // fire, and each taken to a different terminal state.
  const dead = {};
  for (const outcome of ["refused", "failed", "cancelled"]) {
    const admitted = await recordBill(client, {
      particulars: { counterparty: cp, reference: `DEAD-${outcome}` },
    });
    await claimWorkRun({ task: admitted.task_id, runId: opk("tidup-dead") });
    await settleWorkRun({ task: admitted.task_id, outcome, errorCode: "tool_error",
      error: { reason: "rig: this Work will never post" } });
    dead[outcome] = admitted;
  }
  const posted = await postBill(client, {
    particulars: { counterparty: cp, reference: "DEAD-reversed" },
  });
  const entry = (await entriesForClient(client))[0];
  const rf = await import("./rig-fixtures.mjs");
  await rf.reverseEntry(ALICE(), { entry: entry.id, reason: "rig: posted in error", opKey: opk("tidup-rev") });
  assert.notEqual((await rootQuery(
    "select reversed_by from clara.journal_entries where id=$1", [entry.id])).rows[0].reversed_by, null,
  "p1007.probe.never_posting: the rig really did reverse the entry -- reversed_by is stamped");

  for (const [label, admitted] of Object.entries({ ...dead, reversed: posted })) {
    const reference = label === "reversed" ? "DEAD-reversed" : `DEAD-${label}`;
    const out = await probeTradeInvoiceDuplicates(ALICE(), {
      client, kind: TI_KIND.bill,
      particulars: billParticulars({
        counterparty: cp, reference, totalCents: 91100, documentDate: "2026-03-09",
      }),
    });
    assert.equal(out.match_count, 0,
      `p1007.probe.never_posting: the ${label} bill is not on the books and is not a probable duplicate`);
    assert.ok(admitted.invoice_id, `p1007.probe.never_posting: the ${label} bill really was recorded first`);
  }

  // THE CONTROL: a bill under a LIVE Work, same vendor, still matches — so the four negatives
  // above are the filter doing its job rather than the probe seeing nothing at all.
  const live = await recordBill(client, { particulars: { counterparty: cp, reference: "LIVE-0001" } });
  const seen = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: cp, reference: "live 0001", totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.deepEqual(seen.matches.map((m) => m.invoice_id), [live.invoice_id],
    "p1007.probe.never_posting: a bill whose Work is still queued DOES count -- it is about to post");
});

test("p1007.probe.scoped a sales invoice never matches a supplier bill, another client's books are never read, and another firm's client is not even an existence oracle", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("dupscope");
  const other = await tiClient("dupscope2");
  const reference = `SHARED-${randomUUID().slice(0, 8)}`;

  // ONE supplier bill on this client, and ONE sales invoice with the SAME number on the same
  // client — different kind, different party register, and the two must not see each other.
  const cp = await vendor(ALICE(), { client });
  const bill = await recordBill(client, { particulars: { counterparty: cp, reference } });
  const buyer = await customer(ALICE(), { client });
  const sale = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.sales,
    particulars: invoiceParticulars({ counterparty: buyer, reference }),
    basis: invoiceBasis(), intentKey: `ti-dup-${randomUUID()}`,
  });

  const asSales = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.sales,
    particulars: invoiceParticulars({
      counterparty: buyer, reference, totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.deepEqual(asSales.matches.map((m) => m.invoice_id), [sale.invoice_id],
    "p1007.probe.scoped: probing a SALES invoice reports the customer's own earlier invoice and NOT the supplier bill that carries the same number");
  const asBill = await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: cp, reference, totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.deepEqual(asBill.matches.map((m) => m.invoice_id), [bill.invoice_id],
    "p1007.probe.scoped: …and probing a SUPPLIER BILL reports only the bill, so each kind sees exactly its own side of the same number");

  // A SECOND CLIENT OF THE SAME FIRM, with its own vendor of the same name and the same number.
  const otherCp = await vendor(ALICE(), { client: other });
  const onOther = await probeTradeInvoiceDuplicates(ALICE(), {
    client: other, kind: TI_KIND.bill,
    particulars: billParticulars({
      counterparty: otherCp, reference, totalCents: 91100, documentDate: "2026-03-09",
    }),
  });
  assert.equal(onOther.match_count, 0,
    "p1007.probe.scoped: another client's identical bill number is never read -- every signal is inside one client's books");

  // ANOTHER FIRM'S CLIENT: the same answer an unknown id gets, so the probe is no existence oracle.
  const foreign = await assertPair("CLR11", "client_not_found",
    () => probeTradeInvoiceDuplicates(ALICE(), {
      client: world.clients.B1, kind: TI_KIND.bill,
      particulars: billParticulars({ name: "Alpha Supplies", reference }),
    }),
    "p1007.probe.scoped: another firm's client is not this firm's to probe");
  const unknown = await assertPair("CLR11", "client_not_found",
    () => probeTradeInvoiceDuplicates(ALICE(), {
      client: randomUUID(), kind: TI_KIND.bill,
      particulars: billParticulars({ name: "Alpha Supplies", reference }),
    }),
    "p1007.probe.scoped: an unknown client id gets the SAME answer");
  assert.equal(foreign.err.message, unknown.err.message,
    "p1007.probe.scoped: …and the two messages are byte-equal, so the probe never says whether a client exists");
});

test("p1007.probe.is_a_read the probe writes nothing and holds no row lock -- proved from OUTSIDE it, and the catalog says why", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("dupread");
  const cp = await vendor(ALICE(), { client });
  const recorded = await recordBill(client, { particulars: { counterparty: cp, reference: "READ-0001" } });

  // (1) THE CATALOG REASON. All four bodies are `stable`, which is what makes a write inside them
  // impossible rather than merely absent, and `security definer` with the pinned search_path.
  const posture = (await rootQuery(
    `select p.proname, p.provolatile, p.prosecdef
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname='clara' and p.proname in ('probe_trade_invoice_duplicates',
        '_trade_invoice_probe_core','_trade_invoice_duplicate_matches')
      order by p.proname`)).rows;
  assert.equal(posture.length, 3, "p1007.probe.is_a_read: the three probe bodies exist");
  for (const row of posture) {
    assert.equal(row.provolatile, "s",
      `p1007.probe.is_a_read: clara.${row.proname} is STABLE, so PostgreSQL refuses any write inside it`);
    assert.equal(row.prosecdef, true,
      `p1007.probe.is_a_read: clara.${row.proname} is SECURITY DEFINER, as every read on this lane is`);
  }

  // (2) THE BEHAVIOURAL HALF. Nothing the probe could plausibly touch gains a row -- including
  // clara.audit_log, because a read that audited itself would be a write.
  const census = async () => (await rootQuery(
    `select (select count(*) from clara.trade_invoices where client_id=$1) as invoices,
            (select count(*) from clara.trade_invoice_status where client_id=$1) as statuses,
            (select count(*) from clara.accounting_work where client_id=$1) as works,
            (select count(*) from clara.audit_log) as audits`, [client])).rows[0];
  const before = await census();
  await probeTradeInvoiceDuplicates(ALICE(), {
    client, kind: TI_KIND.bill,
    particulars: billParticulars({ counterparty: cp, reference: "READ-0001" }),
  });
  assert.deepEqual(await census(), before,
    "p1007.probe.is_a_read: no row anywhere on this lane -- and no audit row -- was written by the probe");

  // (3) NO ROW LOCK. The probe runs inside an OPEN transaction on one session; a SECOND session
  // takes `for update nowait` on the very row it just reported. A row lock would raise 55P03.
  const locked = await withActor({ role: ROLES.authenticated, jwtSub: ALICE(), transaction: true },
    async (c) => {
      const probed = await c.query(
        "select clara.probe_trade_invoice_duplicates(p_client => $1::uuid, p_kind => $2::text,"
        + " p_particulars => $3::jsonb) as result",
        [client, TI_KIND.bill,
          JSON.stringify(billParticulars({ counterparty: cp, reference: "READ-0001" }))]);
      assert.equal(probed.rows[0].result.match_count, 1,
        "p1007.probe.is_a_read: the probe really did report the row this arm is about to lock");
      const r = await rootQuery(
        "select id from clara.trade_invoices where id = $1 for update nowait", [recorded.invoice_id]);
      return r.rows[0].id;
    });
  assert.equal(locked, recorded.invoice_id,
    "p1007.probe.is_a_read: a second session took a row lock on the reported invoice WHILE the probe's transaction was still open -- the probe holds none");
});
