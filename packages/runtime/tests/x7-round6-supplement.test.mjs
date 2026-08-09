// X7 — THE ROUND-6 SUPPLEMENT, end-to-end.
//
// Three boundary failures around the CLAIM rule, each found by executing the round-6 code and
// each folded back here so the boundary stays pinned:
//   C6-2  a punctuation-variant contact label (`Att'n`, `Att.n`, `Att-n`, `Att/n`) was not
//         recognized, so its line was never CLAIMED — and the whole contact-labelled string won
//         the override. The colon rule could not catch it: it only fires on a line carrying a
//         colon, and `Att'n ACME SDN BHD` has none.
//   C6-3  a split CONTACT scan crossed an intervening `Bill To:` label, claimed the buyer, and
//         left the party scan with nothing — fail-closed, but the F7 repair missed the buyer.
//   C6-4  `U+02BC` is category Lm, so `foldKey` preserved it while the other apostrophe
//         renderings folded to a space — one company, two keys, a false contest.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";

const box = (x1, y1, x2, y2) => [x1, y1, x2, y1, x2, y2, x1, y2];
const L = (content, polygon) => ({ content, polygon });
const VENDOR = L("ROME SECRETARY SDN BHD", box(0.70, 0.65, 3.50, 0.81));
const BILL_TO = L("Bill To:", box(0.72, 2.10, 1.45, 2.24));
const KONG_CHENG = L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 3.30, 2.45));
const ATTN_BOX = box(0.72, 2.90, 2.20, 3.04);
const ATTN = L("Attn : Lim Xiao Shan", ATTN_BOX);

function run(lines, typed, tbox = ATTN_BOX) {
  const out = normalizeAzureInvoice({ status: "succeeded", analyzeResult: {
    documents: [{ fields: {
      InvoiceTotal: { content: "2,800.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: box(6.5, 8.0, 7.7, 8.15) }], confidence: 0.93 },
      VendorName: { content: "ROME SECRETARY SDN BHD", boundingRegions: [{ pageNumber: 1, polygon: box(0.70, 0.65, 3.50, 0.81) }], confidence: 0.94 },
      CustomerName: { content: typed, boundingRegions: [{ pageNumber: 1, polygon: tbox }], confidence: 0.91 },
    } }],
    pages: [{ pageNumber: 1, unit: "inch", width: 8.2639, height: 11.6806, lines }],
  } });
  const g = (p) => out.fields.find((r) => r.field_path === p)?.value_raw;
  return { customer: g("invoice.customer_name"), contact: g("invoice.contact_person"), outcome: out.envelope.customer_identity.outcome };
}

test("C6-2 end-to-end: a punctuation-variant contact label claims its line, both seams", () => {
  // Before: the variant was unrecognized, so the line was never claimed, and the whole
  // contact-labelled string won the override — `customer_name = "Att'n ACME SDN BHD"`.
  for (const lbl of ["Att'n", "Att.n", "Att-n", "Att/n"]) {
    const leak = run([VENDOR, BILL_TO, L(`${lbl} ACME SDN BHD`, box(0.72, 2.30, 3.60, 2.45)), ATTN], "Lim Xiao Shan");
    // Ruling 2: no party is written AND the typed person is withdrawn, not passed through.
    assert.equal(leak.customer, undefined, `${lbl} must not write a party`);
    assert.equal(leak.contact, "Lim Xiao Shan", `${lbl} still reads as a contact label`);
    assert.notEqual(leak.outcome, "attn_overridden");
    // …and the same variant on the SAME-LINE seam reads as a genuine contact, F7 intact.
    const ok = run([VENDOR, BILL_TO, KONG_CHENG, L(`${lbl} : Lim Xiao Shan`, ATTN_BOX)], "Lim Xiao Shan");
    assert.equal(ok.customer, "KONG CHENG RESTAURANTS SDN BHD", `${lbl} must still read as a contact label`);
    assert.equal(ok.contact, "Lim Xiao Shan");
  }
});

test("C6-3 end-to-end: a LABEL terminates a split scan — the buyer below it is read", () => {
  // `Attention:` / `Bill To:` / `ACME SDN BHD`: the CONTACT scan used to walk past `Bill To:`,
  // claim ACME and reserve it, leaving the party scan with nothing — fail-closed, but the F7
  // repair MISSED the actual buyer. A label starts a new block; a claim never crosses into it.
  const r = run([VENDOR,
    L("Attention:", box(0.72, 2.10, 1.60, 2.24)),
    L("Bill To:", box(0.72, 2.28, 1.45, 2.42)),
    L("ACME SDN BHD", box(0.72, 2.46, 2.60, 2.60)),
    ATTN,
  ], "Lim Xiao Shan");
  assert.equal(r.customer, "ACME SDN BHD", "the bill-to block owns its own value");
  assert.equal(r.contact, "Lim Xiao Shan", "and the contact is still read from the Attn line");
  assert.equal(r.outcome, "attn_overridden", "the F7 repair works on this layout");
});

test("C6-4 end-to-end: two apostrophe renderings of ONE name no longer contest", () => {
  const r = run([VENDOR,
    L("Bill To: O'BRIEN SDN BHD", box(0.72, 2.15, 3.60, 2.29)),
    L("Customer : OʼBRIEN SDN BHD", box(0.72, 2.32, 3.60, 2.46)),
  ], "O'BRIEN SDN BHD", box(0.72, 2.15, 3.60, 2.29));
  assert.equal(r.outcome, "matched", "one company, two renderings — not a contest");
  assert.equal(r.customer, "O'BRIEN SDN BHD", "the correct typed name survives");
});
