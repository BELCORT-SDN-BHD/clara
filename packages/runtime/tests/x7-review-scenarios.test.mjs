// X7 — THE EXECUTED-PROBE REGRESSION CORPUS.
//
// Every scenario that a review lane actually RAN against this code across three rounds, pinned
// end-to-end through `normalizeAzureInvoice`. Nothing here is hypothetical: each row either
// produced a wrong `customer_name` on real-shaped input, or is the control proving the fix did
// not buy its safety by breaking the thing F7 exists to do.
//
// WHY THIS FILE EXISTS AT ALL. Twice I claimed a class was closed on the strength of
// grammar-level cells, and twice a reviewer disproved it by executing the real normalizer. The
// grammar functions do not decide what reaches `customer_name` — the reader and the reconciler
// do. So the corpus lives HERE, at the only altitude where the claim is checkable.
//
// SOURCES: round-1 native probes 1-5 · round-2 Codex findings 1-4 · round-3 native fresh1-4 ·
// round-3 Codex R2-A/R2-B. Fixture geometry follows x7-customer-testkit.mjs's A4 page; the
// honest limits on that geometry are stated in its header.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";

const box = (x1, y1, x2, y2) => [x1, y1, x2, y1, x2, y2, x1, y2];
const L = (content, polygon) => ({ content, polygon });

const VENDOR = L("ROME SECRETARY SDN BHD", box(0.70, 0.65, 3.50, 0.81));
const BILL_TO = L("Bill To:", box(0.72, 2.10, 1.45, 2.24));
const KONG_CHENG = L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 3.30, 2.45));
const ATTN = L("Attn : Lim Xiao Shan", box(0.72, 2.90, 2.20, 3.04));
const ATTN_BOX = box(0.72, 2.90, 2.20, 3.04);
const ITEM = L("To Secretarial fee for the year 2025", box(0.72, 3.80, 4.20, 3.95));

/** Run a page of lines through the REAL normalizer with a typed CustomerName at `tbox`. */
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
  return { customer: g("invoice.customer_name"), contact: g("invoice.contact_person"),
    outcome: out.envelope.customer_identity.outcome, rows: out.fields, envelope: out.envelope };
}

// ══════════════════════════════════════════════════════════════════════════════════════
// ROUND 1 — the native probes that opened the merge-blocker
// ══════════════════════════════════════════════════════════════════════════════════════

test("R1: a Malaysian INFINITIVE line item never becomes the customer (probes 2 and 3)", () => {
  // probe2: `To supply and install air-conditioning system` was BORN as customer_name through
  // the override branch — strictly worse than the held state F7 exists to fix.
  const supply = L("To supply and install air-conditioning system", box(0.72, 3.80, 4.60, 3.95));
  const p2 = run([VENDOR, KONG_CHENG, L("No 12, Jalan Ampang", box(0.72, 2.50, 2.60, 2.64)), ATTN, supply], "Lim Xiao Shan");
  assert.equal(p2.customer, "Lim Xiao Shan", "typed stands; the line item is not an identity");
  assert.equal(p2.outcome, "absent");

  // probe3-A: the F7 vehicle as fixtured — the fix still fires.
  const a = run([VENDOR, BILL_TO, KONG_CHENG, ATTN], "Lim Xiao Shan");
  assert.equal(a.customer, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(a.contact, "Lim Xiao Shan");
  assert.equal(a.outcome, "attn_overridden");

  // probe3-B: the SAME vehicle with one line item present. This read `ambiguous` before the fix,
  // i.e. F7 silently failed on its own target document.
  const b = run([VENDOR, BILL_TO, KONG_CHENG, ATTN, ITEM], "Lim Xiao Shan");
  assert.equal(b.customer, "KONG CHENG RESTAURANTS SDN BHD", "a line item must not disturb the real party");
  assert.equal(b.outcome, "attn_overridden");

  // probe3-C: no bill-to label, line item only, typed EMPTY — the reader must author nothing.
  const c = run([VENDOR, KONG_CHENG, ATTN, ITEM], "");
  assert.equal(c.customer, "", "an empty typed row stays empty — sole authorship is refused");
  assert.equal(c.contact, "Lim Xiao Shan");
});

test("R1: a CORRECT typed name survives (probe 5) — the 19-of-22 shape", () => {
  // The reader destroyed a correct Azure name whenever furniture was the only candidate.
  const p5 = run([
    VENDOR,
    L("AMATERUS GROUP SDN BHD", box(0.72, 2.30, 3.30, 2.45)),
    L("50450 Kuala Lumpur", box(0.72, 2.50, 2.40, 2.64)),
    L("To Secretarial fee for the year 2025", box(0.72, 3.20, 4.20, 3.35)),
  ], "AMATERUS GROUP SDN BHD", box(0.72, 2.30, 3.30, 2.45));
  assert.equal(p5.customer, "AMATERUS GROUP SDN BHD");
});

test("R1: a TWO-COLUMN header still finds the party (probe 4)", () => {
  const p4 = run([
    VENDOR, BILL_TO,
    L("Invoice No: RSINV-0041", box(5.20, 2.10, 7.60, 2.24)),
    KONG_CHENG,
    L("Date: 14/10/2025", box(5.20, 2.30, 6.80, 2.45)),
    ATTN,
  ], "KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 3.30, 2.45));
  assert.equal(p4.customer, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(p4.outcome, "matched", "the reader read the party; the reconciler then collapsed it against the agreeing typed row");
  assert.equal(p4.envelope.customer_identity.typed_collapsed, 1);
  // ONE skip, not two: the scan steps over the interleaved `Invoice No` and finds the party on
  // the very next line, so the second right-column row is never examined. Pinned as measured
  // rather than as assumed — the first draft of this assertion guessed 2 and was wrong.
  assert.equal(p4.envelope.customer_identity.column_skipped, 1);
});

// ══════════════════════════════════════════════════════════════════════════════════════
// ROUND 2 — Codex, all four executed against an EMPTY-but-regioned typed CustomerName
// ══════════════════════════════════════════════════════════════════════════════════════

test("R2-Codex: nothing may fill an EMPTY typed CustomerName — contact, caption, address, spaced label", () => {
  const attnLabel = L("Attention:", box(0.72, 2.25, 1.60, 2.39));
  const person = L("Lim Xiao Shan", box(0.72, 2.40, 2.20, 2.54));
  // #1 — a SPLIT Attn label whose value line was still a live party candidate.
  const split = run([BILL_TO, attnLabel, person, L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.55, 3.30, 2.69))], "");
  assert.equal(split.customer, "", "the contact never becomes the customer");
  assert.equal(split.contact, "Lim Xiao Shan");
  assert.equal(split.outcome, "sole_authorship_refused");
  // #3 — captions, English addresses and spaced-out contact labels.
  for (const furniture of ["Name:", "12, Main Road", "A T T N : Lim Xiao Shan"]) {
    const r = run([BILL_TO, L(furniture, box(0.72, 2.30, 3.30, 2.45))], "");
    assert.equal(r.customer, "", `${furniture} must never fill an empty typed field`);
    assert.equal(r.contact, undefined);
  }
});

test("R2-Codex #2: two Chinese company names are a CONTEST, not one party matched twice", () => {
  // The ASCII key collapsed both to `sdnbhd` and the reader emitted `"?? SDN BHD"`.
  const r = run([
    L("Bill To: 鑫旺 SDN BHD", box(0.72, 2.10, 3.00, 2.24)),
    L("Customer: 宏达 SDN BHD", box(0.72, 2.30, 3.00, 2.44)),
  ], "", box(0.80, 2.20, 3.00, 2.35));
  assert.equal(r.customer, "", "no party is emitted, and none authored");
  assert.equal(r.outcome, "contested");
  assert.equal(r.envelope.customer_identity.contested, 1);
});

test("R2-Codex #4: a CONTEST withdraws a typed row that equals one of the two", () => {
  const r = run([
    L("Bill To: WRONG HOLDING SDN BHD", box(0.72, 2.15, 3.60, 2.29)),
    L("Customer : ACTUAL SUBSIDIARY SDN BHD", box(0.72, 2.32, 3.90, 2.46)),
  ], "WRONG HOLDING SDN BHD", box(0.72, 2.15, 3.60, 2.29));
  assert.equal(r.customer, undefined, "a coin toss that already landed is not evidence");
  assert.equal(r.outcome, "contested");
  assert.equal(r.envelope.customer_identity.typed_vs_contested, 1);
});

// ══════════════════════════════════════════════════════════════════════════════════════
// ROUND 3 — the class, not another instance
// ══════════════════════════════════════════════════════════════════════════════════════

test("R3-1: FURNITURE remainders never reach customer_name, on either seam", () => {
  // Fifteen of these became live party candidates in one probe. `Customer's Ref: PO-8891` even
  // survived the possessive tokenizer as a party literally named `'s Ref: PO-8891`.
  const FURNITURE = [
    "Customer's Ref: PO-8891", "Client's Ref : DO-2231", "Buyer Signature", "Customer Signature",
    "Client Declaration", "Buyer's Order dated 01/09/2025", "Customer Since 2019",
    "Client Portal login required", "Customer Rating AAA", "Client Advisory Note",
    "Charge To Master Account", "Buyer Beware", "Customer Feedback Form",
    "Pelanggan Yang Dihormati", "Kepada Sesiapa Yang Berkenaan", "DELIVERY ADDRESS",
    "MAILING ADDRESS", "Delivery Note", "Payment Terms", "Signature", "Remarks",
  ];
  for (const f of FURNITURE) {
    // (i) the OVERRIDE seam — typed is the Attn person, the only branch that can write a party.
    const sameLine = run([VENDOR, L(f, box(0.72, 2.30, 4.60, 2.45)), ATTN], "Lim Xiao Shan");
    assert.equal(sameLine.customer, "Lim Xiao Shan", `${f} must not override via the same-line seam`);
    assert.notEqual(sameLine.outcome, "attn_overridden");
    // (ii) the SPLIT-VALUE seam — a bare `Bill To:` whose value line is the furniture.
    const splitValue = run([VENDOR, BILL_TO, L(f, box(0.72, 2.30, 4.60, 2.45)), ATTN], "Lim Xiao Shan");
    assert.equal(splitValue.customer, "Lim Xiao Shan", `${f} must not override via the split-value seam`);
    assert.notEqual(splitValue.outcome, "attn_overridden");
  }
});

test("R3-2: a caption ABOVE the party no longer hides it — the reviewer's own two-column layout", () => {
  // Created BY the round-2 skip repair: `DELIVERY ADDRESS` won on this exact page. The entity
  // gate kills it WITHOUT a prefer-last heuristic — the caption simply is not a candidate, the
  // scan steps over it, and the suffixed line beneath is found.
  const r = run([
    VENDOR, BILL_TO,
    L("Invoice No: RS-0041", box(5.20, 2.10, 7.60, 2.24)),
    L("DELIVERY ADDRESS", box(0.72, 2.30, 2.60, 2.45)),
    L("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.55, 3.30, 2.70)),
    ATTN,
  ], "Lim Xiao Shan");
  assert.equal(r.customer, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(r.contact, "Lim Xiao Shan");
  assert.equal(r.outcome, "attn_overridden", "and the F7 fix still fires on this layout");
  const accepted = r.envelope.customer_identity.candidates.filter((c) => c.outcome === "accepted" && c.kind === "party");
  assert.deepEqual(accepted.map((c) => c.key), ["kongchengrestaurantssdnbhd"], "exactly one accepted party, and it is the right one");
});

test("R3-3: `SDN BHD` and `S/B` are ONE company — no contest, the typed name survives", () => {
  const r = run([
    VENDOR,
    L("Bill To: KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 4.60, 2.45)),
    L("Customer : KONG CHENG RESTAURANTS S/B", box(0.72, 2.60, 4.20, 2.75)),
  ], "KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.30, 3.30, 2.45));
  assert.equal(r.customer, "KONG CHENG RESTAURANTS SDN BHD", "a correct typed name is no longer destroyed");
  assert.equal(r.outcome, "matched");
  assert.equal(r.envelope.customer_identity.occurrences, 2);
});

test("R3-Codex R2-A: the split-VALUE path is entity-gated too, not only top-level candidates", () => {
  // A bare `To:` whose value line is an infinitive line item, and a five-line scan that reaches
  // the caption `Payment Terms` past four skipped right-column rows. Both overwrote the typed
  // Attn person through the privileged override branch.
  const a1 = run([
    VENDOR, L("To:", box(0.72, 2.10, 1.10, 2.24)),
    L("To supply and install air-conditioning system", box(0.72, 2.30, 4.60, 2.45)), ATTN,
  ], "Lim Xiao Shan");
  assert.equal(a1.customer, "Lim Xiao Shan");
  assert.notEqual(a1.outcome, "attn_overridden");

  const a2 = run([
    VENDOR, BILL_TO,
    L("Invoice No: RS-0041", box(5.20, 2.12, 7.60, 2.26)),
    L("Date: 14/10/2025", box(5.20, 2.20, 6.80, 2.34)),
    L("Terms: 30 days", box(5.20, 2.28, 6.80, 2.42)),
    L("Page 1 of 1", box(5.20, 2.36, 6.40, 2.50)),
    L("Payment Terms", box(0.72, 2.44, 2.20, 2.58)),
    ATTN,
  ], "Lim Xiao Shan");
  assert.equal(a2.customer, "Lim Xiao Shan");
  assert.notEqual(a2.outcome, "attn_overridden");
});

test("R3-Codex R2-B: a COMPANY is never persisted as a contact person", () => {
  // `Bill To:` → `Attention:` → `ACME SDN BHD` emitted the company as BOTH customer_name and
  // contact_person. One lexicon, two polarities: a party carries the entity signal, a contact
  // must not.
  const lines = [VENDOR, BILL_TO, L("Attention:", box(0.72, 2.25, 1.60, 2.39)),
    L("ACME SDN BHD", box(0.72, 2.40, 2.60, 2.54))];
  const r = run(lines, "Lim Xiao Shan", box(0.72, 2.40, 2.60, 2.54));
  assert.equal(r.contact, undefined, "an entity-suffixed string is never a person");
  // It competes on the PARTY path instead — proven positively by a typed value that AGREES.
  const agree = run(lines, "ACME SDN BHD", box(0.72, 2.40, 2.60, 2.54));
  assert.equal(agree.customer, "ACME SDN BHD");
  assert.equal(agree.outcome, "matched", "read as a PARTY and collapsed against the agreeing typed row");
  assert.equal(agree.envelope.customer_identity.typed_collapsed, 1);
  assert.equal(agree.contact, undefined);
});

test("THE CONTROL: F7's own measured defect still fixes, and the honest narrowing is real", () => {
  // (c) the reason this reader exists — KONG CHENG RESTAURANTS SDN BHD carries the entity signal.
  const fixed = run([VENDOR, BILL_TO, KONG_CHENG, ATTN], "Lim Xiao Shan");
  assert.equal(fixed.customer, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(fixed.contact, "Lim Xiao Shan");
  assert.equal(fixed.outcome, "attn_overridden");
  // (d) the narrowing, pinned so it is a recorded decision: an UNSUFFIXED buyer never overrides.
  // `SIFU LAB` is a real customer on this client's books (acceptance-h1 row 13).
  const narrowed = run([VENDOR, L("Bill To: SIFU LAB", box(0.72, 2.30, 2.60, 2.45)), ATTN], "Lim Xiao Shan");
  assert.equal(narrowed.customer, "Lim Xiao Shan", "abstains — typed stands, exactly today's behaviour");
  assert.notEqual(narrowed.outcome, "attn_overridden");
});
