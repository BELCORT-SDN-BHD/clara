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
  gateTiTin, vendor, billParticulars, billBasis, admitTradeInvoiceWork, invoiceRow,
  ensureTiChart, buildWorkWorld, freshWorkClient, endPool,
  TI_REASON, invoiceCount, entryCount, committedReceiptCount, assertPair, rootQuery,
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
