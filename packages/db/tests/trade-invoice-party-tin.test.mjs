// #982 — THE TIN IS A RESOLUTION KEY FOR A TRADE-INVOICE COUNTERPARTY, AT THE REGISTRATION TIER.
//
// Owner's ruling (2026-09-20, on the ticket): "TIN becomes a real resolution key for a
// trade-invoice counterparty, at the same tier as the normalised registration number, and when a
// TIN and a registration number point at two different live counterparties Clara stops and lets
// the person choose." LHDN MyInvois requires the buyer TIN and BRN and validates both from
// 2026-08-01, so a document whose clearest printed identifier is a TIN is an ordinary case.
//
// THE SEAM IS THE DOOR, NEVER THE RESOLVER. Every cell here drives
// `clara.admit_trade_invoice_work` as `clara_runtime` (the one role that holds it) and reads the
// result back through `clara.trade_invoices`. `clara._trade_invoice_resolve_party` is an
// UNGRANTED internal — 0225's tail asserts that — so a cell that called it directly would be
// testing a private function, which WORK-ORDER rule 4 forbids.
//
// The cells are named `p982.*`. They live in their own file rather than in
// `trade-invoice.test.mjs` so #982's frontier (migration 0274) can skip independently of #655's
// (0225), exactly as `trade-invoice-fixtures.mjs` says about #634/#638/#643.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  gateTiTin, gateTiDup, vendor, billParticulars, billBasis, admitTradeInvoiceWork, invoiceRow,
  ensureTiChart, buildWorkWorld, freshWorkClient, endPool,
  TI_REASON, TI_KIND, customer, invoiceParticulars, invoiceBasis,
  invoiceCount, entryCount, committedReceiptCount, assertPair, rootQuery,
} from "./trade-invoice-fixtures.mjs";
import { printLaneNotes, printSkipCount } from "./wave-a-helpers.mjs";

let world;
before(async () => { world = await buildWorkWorld(); });
after(async () => {
  printLaneNotes("trade-invoice-party-tin");
  printSkipCount("trade-invoice-party-tin");
  await endPool();
});

const ALICE = () => world.users.alice;      // owner of firm A

/** A dedicated client of firm A carrying the trade-invoice chart. Resolution is client-scoped, so
 *  a fresh client per cell is what makes each cell's counterparty population exactly what it says
 *  it is. */
async function tiClient(tag) {
  const client = await freshWorkClient(ALICE(), tag);
  await ensureTiChart(ALICE(), client, tag);
  return client;
}

/** A MyInvois-shaped TIN, unique within a cell. `C` + eleven digits is the shape LHDN issues to a
 *  company; nothing in this lane validates it, and #982 keeps format explicitly out of scope. */
const newTin = () => `C${randomUUID().replace(/[^0-9]/g, "").padEnd(11, "0").slice(0, 11)}`;

/** A refusal leaves NOTHING behind: no Work, no trade invoice, no entry, no committed receipt —
 *  `trade-invoice.test.mjs`'s own discipline, restated here because this file admits through the
 *  same door and a refusal that wrote a row would be a worse finding than the wrong reason. */
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

test("p982.tin.resolves a submission whose ONLY identifier is a TIN resolves to the one live party of the wanted kind that holds it", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-one");
  const tin = newTin();
  const held = await vendor(ALICE(), { client, tin });
  // A second vendor with NO TIN, so the cell proves a match rather than "there is only one row".
  await vendor(ALICE(), { client });

  const ok = await admitTradeInvoiceWork({
    client, author: ALICE(),
    particulars: billParticulars({ counterparty: null, tin }),
    basis: billBasis(),
  });
  assert.equal((await invoiceRow(ok.invoice_id)).counterparty_id, held,
    "p982.tin.resolves: the TIN printed on the document resolved the party the books already hold");
});

test("p982.tin.ambiguous a TIN held by TWO live parties of the wanted kind refuses with BOTH candidates, never a pick", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-many");
  const tin = newTin();
  // Nothing in the estate constrains a TIN to one party (uq_counterparties_client_registration
  // constrains the REGISTRATION number and there is no TIN twin), so two live vendors may hold
  // one TIN — a data-entry fact a person has to settle, not one Clara may settle for them.
  const one = await vendor(ALICE(), { client, tin });
  const two = await vendor(ALICE(), { client, tin });

  const amb = await refusesTi(client, "CLR10", TI_REASON.partyAmbiguous,
    () => admitTradeInvoiceWork({
      client, author: ALICE(),
      particulars: billParticulars({ counterparty: null, tin }),
      basis: billBasis(),
    }),
    "p982.tin.ambiguous: two vendors hold one TIN");
  assert.equal(amb.detail.candidates.length, 2,
    "p982.tin.ambiguous: the candidate list is CARRIED, so the person picks from what the books hold");
  assert.deepEqual(new Set(amb.detail.candidates.map((c) => c.counterparty_id)), new Set([one, two]));
  assert.ok(amb.detail.candidates.every((c) => c.tin === tin),
    "p982.tin.ambiguous: …each candidate carrying the identifier that was matched on");
});

test("p982.tin.conflict a TIN and a registration number naming DIFFERENT live parties refuse with a reason of their own, carrying both", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-conflict");
  const tin = newTin();
  const byReg = await vendor(ALICE(), { client, registration: "200101000982" });
  const byTin = await vendor(ALICE(), { client, tin });

  const clash = await refusesTi(client, "CLR10", TI_REASON.partyIdentifierConflict,
    () => admitTradeInvoiceWork({
      client, author: ALICE(),
      particulars: billParticulars({ counterparty: null, registration: "200101000982", tin }),
      basis: billBasis(),
    }),
    "p982.tin.conflict: the document's two identifiers name two different live vendors");
  assert.equal(clash.detail.candidates.length, 2,
    "p982.tin.conflict: BOTH sides are carried, so the person chooses rather than being told");
  assert.deepEqual(new Set(clash.detail.candidates.map((c) => c.counterparty_id)),
    new Set([byReg, byTin]));
  // …and each candidate says WHICH identifier reached it, because the person is choosing between
  // the document's two identifiers and not between two parties one identifier reaches.
  const by = Object.fromEntries(clash.detail.candidates.map((c) => [c.counterparty_id, c.matched_on]));
  assert.equal(by[byReg], "registration");
  assert.equal(by[byTin], "tin");
});

// ===========================================================================================
// WHAT #982 DELIBERATELY DID NOT CHANGE (AC4), and the two scoping promises the new arm makes.
// These cells pin behaviour rather than drive it: each was GREEN on its first run against the
// arm the three cells above built, which is the claim — a submission that did not rely on the
// TIN leaves this door exactly as 0225 left it. Their non-vacuity is proved in the report by a
// deliberate break of the subject (the `cp.kind = v_want` predicate), which turns
// p982.tin.kind_scoped red and nothing else.
// ===========================================================================================

test("p982.tin.agree identifiers that AGREE resolve, and a TIN that matched nothing is not a conflict", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-agree");
  const tin = newTin();
  // ONE party carries both identifiers; a SECOND live party shares only the TIN. The
  // registration-matched row is the only one satisfying BOTH, so it resolves rather than
  // refusing — Clara is not choosing between identifiers here, it is reading their intersection.
  const both = await vendor(ALICE(), { client, registration: "200101000983", tin });
  await vendor(ALICE(), { client, tin });

  const agreed = await admitTradeInvoiceWork({
    client, author: ALICE(),
    particulars: billParticulars({ counterparty: null, registration: "200101000983", tin }),
    basis: billBasis(),
  });
  assert.equal((await invoiceRow(agreed.invoice_id)).counterparty_id, both,
    "p982.tin.agree: the two identifiers agree on one party, so the submission resolves");

  // AND a TIN nobody holds leaves the registration arm's own outcome alone (0225's behaviour).
  const unmatched = await admitTradeInvoiceWork({
    client, author: ALICE(),
    particulars: billParticulars({ counterparty: null, registration: "200101000983", tin: newTin() }),
    basis: billBasis(),
  });
  assert.equal((await invoiceRow(unmatched.invoice_id)).counterparty_id, both,
    "p982.tin.agree: a TIN that reached nobody is not a disagreement, so the registration still resolves");
});

test("p982.tin.kind_scoped a TIN held only by a CUSTOMER leaves a supplier bill unresolved, and the mirror holds", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-kind");
  const tin = newTin();
  const buyer = await customer(ALICE(), { client, tin });

  await refusesTi(client, "CLR10", TI_REASON.partyUnresolved,
    () => admitTradeInvoiceWork({
      client, author: ALICE(), kind: TI_KIND.bill,
      particulars: billParticulars({ counterparty: null, tin }),
      basis: billBasis(),
    }),
    "p982.tin.kind_scoped: a supplier bill is owed TO a vendor, and no vendor holds this TIN");

  // THE MIRROR, so the cell proves a KIND filter rather than "the TIN arm never matches": the
  // same TIN resolves the sales invoice the customer is owed on.
  const sold = await admitTradeInvoiceWork({
    client, author: ALICE(), kind: TI_KIND.sales,
    particulars: invoiceParticulars({ counterparty: null, tin }),
    basis: invoiceBasis(),
  });
  assert.equal((await invoiceRow(sold.invoice_id)).counterparty_id, buyer,
    "p982.tin.kind_scoped: …and the same TIN resolves the invoice whose kind wants a customer");
});

test("p982.tin.id_wins a submission that NAMES the counterparty id keeps 0225's outcome, whatever its TIN says", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-id");
  const tin = newTin();
  const named = await vendor(ALICE(), { client });
  await vendor(ALICE(), { client, tin });   // a different live vendor, holding the submitted TIN

  const ok = await admitTradeInvoiceWork({
    client, author: ALICE(),
    particulars: billParticulars({ counterparty: named, tin }),
    basis: billBasis(),
  });
  assert.equal((await invoiceRow(ok.invoice_id)).counterparty_id, named,
    "p982.tin.id_wins: the id arm returns before the identifier tier, exactly as 0225 wrote it");
});

test("p982.tin.normalised a TIN printed with spaces and dashes resolves the party whose stored TIN carries none", async (t) => {
  if (await gateTiTin(t)) return;
  const client = await tiClient("tin-norm");
  const tin = newTin();
  const held = await vendor(ALICE(), { client, tin });
  // The estate has exactly ONE identifier normalisation, and 0274 reads a TIN through it because
  // the ruling puts the TIN on the registration number's own tier. A document printing
  // `C 1234-5678901` names the party stored as `C12345678901`.
  const printed = `${tin.slice(0, 1)} ${tin.slice(1, 5)}-${tin.slice(5)}`;

  const ok = await admitTradeInvoiceWork({
    client, author: ALICE(),
    particulars: billParticulars({ counterparty: null, tin: printed }),
    basis: billBasis(),
  });
  assert.equal((await invoiceRow(ok.invoice_id)).counterparty_id, held,
    "p982.tin.normalised: the punctuation a printer added is not part of the identifier");
});

// ===========================================================================================
// FIX ROUND (wave 3, lane 02): THE NAME PRINTED BESIDE A SHARED TIN (ADV-982-1).
//
// These two cells gate on #1007's frontier, not #982's: the body they drive is recut by
// 0275_trade_invoice_duplicate_probe, because `CLARA_MIGRATION_REDO` (#957) takes the HIGHEST
// applied version only and 0275 sits above 0274 on every lane database. The migration's own
// header says the same thing, and packages/db/README.md's 0275 section records it.
// ===========================================================================================

test("p982.tin.shared_with_a_name a TIN several parties hold does not silently outrank the name printed beside it: the chooser carries the NAMED party too, and says which identifier reached each one", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("tin-named");
  const tin = newTin();
  // The party the DOCUMENT names, holding no TIN at all: before 0274 this submission resolved to
  // it, because a TIN was not a key.
  const named = await vendor(ALICE(), { client, name: `Gamma Works ${randomUUID().slice(0, 8)}` });
  const holderOne = await vendor(ALICE(), { client, tin });
  const holderTwo = await vendor(ALICE(), { client, tin });
  const namedRow = await rootQuery("select name from clara.counterparties where id=$1", [named]);

  const amb = await refusesTi(client, "CLR10", TI_REASON.partyAmbiguous,
    () => admitTradeInvoiceWork({
      client, author: ALICE(),
      particulars: billParticulars({ counterparty: null, name: namedRow.rows[0].name, tin }),
      basis: billBasis(),
    }),
    "p982.tin.shared_with_a_name: a shared TIN has not identified anybody");
  assert.deepEqual(new Set(amb.detail.candidates.map((c) => c.counterparty_id)),
    new Set([named, holderOne, holderTwo]),
    "p982.tin.shared_with_a_name: the chooser offers the party the document NAMES as well as the two that hold the number");
  const by = Object.fromEntries(amb.detail.candidates.map((c) => [c.counterparty_id, c.matched_on]));
  assert.equal(by[named], "name",
    "p982.tin.shared_with_a_name: …saying which identifier reached the named party");
  assert.equal(by[holderOne], "tin");
  assert.equal(by[holderTwo], "tin");
});

test("p982.tin.shared_name_decides when the name printed beside a shared TIN answers to ONE of the parties holding it, the two identifiers agree on that party and the document resolves", async (t) => {
  if (await gateTiDup(t)) return;
  const client = await tiClient("tin-decides");
  const tin = newTin();
  const wanted = await vendor(ALICE(), { client, name: `Delta One ${randomUUID().slice(0, 8)}`, tin });
  const other = await vendor(ALICE(), { client, name: `Delta Two ${randomUUID().slice(0, 8)}`, tin });
  const wantedRow = await rootQuery("select name from clara.counterparties where id=$1", [wanted]);

  const ok = await admitTradeInvoiceWork({
    client, author: ALICE(),
    particulars: billParticulars({ counterparty: null, name: wantedRow.rows[0].name, tin }),
    basis: billBasis(),
  });
  assert.equal((await invoiceRow(ok.invoice_id)).counterparty_id, wanted,
    "p982.tin.shared_name_decides: the name settled which of the two parties holding that TIN the document is about");
  assert.notEqual(wanted, other,
    "p982.tin.shared_name_decides: …and the other holder of the same TIN is a real, live, different party");
});
