// X7 — THE PR #220 REVIEW CELLS: two CONFIRMED wrong-party paths, closed.
//
// Codex reviewed the A1 field-test fix and returned NOT_READY on two findings, both reproduced
// here before anything was changed. They belong together because they are the same mistake in two
// vocabularies: THE SWEEP BROADENED GENERATION, AND TWO WALLS TURNED OUT TO BE NARROWER THAN THE
// CLASS THEY NAMED. `looksLikePartyName` refused eleven relational phrases but no seller CAPTION;
// the vendor-identity term refused an EXACT name but not the fragment Azure actually types.
//
// C1 IS WIDER THAN THE FINDING SAID. The review attributed it to the anchor sweep. Re-measured
// here, `Seller ACME SDN BHD` also overrode through the SAME-LINE and SPLIT-VALUE label seams —
// so the gap predates the sweep entirely; the sweep opened a third door onto a room that was
// already unlocked. Every cell below therefore probes ALL THREE surfaces, not just the new one.
//
// Both fixes are REFUSE-ONLY, so every over-refusal abstains visibly on a counted head rather
// than manufacturing a party.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";
import { ATTN, ATTN_BOX, BILL_TO, L, VENDOR, WITHDRAWN, box, run } from "./x7-scenario-kit.mjs";

/** The five executed seller captions. `From` is handled separately — see its own cell. */
const SELLER_CAPTIONS = [
  "Seller ACME SDN BHD",
  "Vendor ACME SDN BHD",
  "Sold By ACME SDN BHD",
  "Supplier ACME SDN BHD",
  "Issued By ACME SDN BHD",
];

const AT = (text) => L(text, box(0.72, 2.30, 4.60, 2.45));

test("C1: a SELLER CAPTION is never the addressee — on all THREE candidate surfaces", () => {
  // Executed and CONFIRMED on PR #220: each of these emitted as `invoice.customer_name` with
  // `outcome=attn_overridden` — a confident wrong party on a real-shaped page, which is the one
  // forbidden outcome. A caption naming the seller is a phrase ABOUT the seller.
  for (const caption of SELLER_CAPTIONS) {
    // (i) THE ANCHOR SWEEP — a label-less page, the surface the review found it on.
    const swept = run([VENDOR, AT(caption), ATTN], "Lim Xiao Shan");
    assert.equal(swept.customer, WITHDRAWN, `${caption} must not be swept in as the buyer`);
    assert.notEqual(swept.outcome, "attn_overridden");

    // (ii) THE SPLIT-VALUE SEAM, beneath a bare `Bill To:` — NOT part of the finding as filed,
    // and it leaked too. This is why the repair went into the shared name gate.
    const split = run([VENDOR, BILL_TO, AT(caption), ATTN], "Lim Xiao Shan");
    assert.equal(split.customer, WITHDRAWN, `${caption} must not override via the split seam`);

    // (iii) THE SAME-LINE SEAM — `Bill To: Seller ACME SDN BHD`. Also leaked.
    const sameLine = run([VENDOR, L(`Bill To: ${caption}`, box(0.72, 2.30, 4.60, 2.45)), ATTN], "Lim Xiao Shan");
    assert.equal(sameLine.customer, WITHDRAWN, `${caption} must not override via the same-line seam`);

    // …and it must not slip through the CONTACT door either. The polarity inversion means "not an
    // entity" is a POSITIVE contact signal, so a party-only rule would promote it here instead.
    assert.notEqual(split.contact, caption, `${caption} must not become a contact person`);
  }
});

test("C1: `From ACME SDN BHD` was ALREADY closed — by the stopword opener, one gate earlier", () => {
  // The one form of the six that held before this fix, and it is recorded rather than
  // double-covered: `from` is a STOPWORD_OPENER, so the phrase never reaches the marker list.
  // Pinned because the mechanism lives in a DIFFERENT list — a stopword edit made for some
  // unrelated reason would silently reopen a seller path, and nothing else would notice.
  const swept = run([VENDOR, AT("From ACME SDN BHD"), ATTN], "Lim Xiao Shan");
  assert.equal(swept.customer, WITHDRAWN);
  const split = run([VENDOR, BILL_TO, AT("From ACME SDN BHD"), ATTN], "Lim Xiao Shan");
  assert.equal(split.customer, WITHDRAWN);
  // The receipt names the gate that did the work: the name gate, not the entity-suffix wall.
  assert.equal(split.envelope.customer_identity.rejected_gate >= 1, true, "refused by the NAME gate");
});

test("C1: a legitimate name is not eaten by the caption vocabulary", () => {
  // The three noun captions are `^`-anchored precisely so a real trading name that CONTAINS one
  // keeps its candidacy. Without the anchor these two would be lost to catch a caption.
  for (const name of ["PREFERRED VENDOR SOLUTIONS SDN BHD", "BEST SELLER BOOKS SDN BHD"]) {
    const r = run([VENDOR, BILL_TO, L(name, box(0.72, 2.30, 4.60, 2.45)), ATTN], "Lim Xiao Shan");
    assert.equal(r.customer, name, `${name} is a real name and must still be readable`);
    assert.equal(r.outcome, "attn_overridden");
  }
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// C2 — the SUBSET-NO-REMAINDER rule, at its four calibration points.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** A page with an explicitly-chosen typed VendorName, so the vendor half is the variable. */
function withVendor(vendorContent, lines) {
  return normalizeAzureInvoice({ status: "succeeded", analyzeResult: {
    documents: [{ fields: {
      VendorName: { content: vendorContent, boundingRegions: [{ pageNumber: 1, polygon: box(0.70, 0.30, 2.80, 1.10) }], confidence: 0.9 },
      CustomerName: { content: "Lim Xiao Shan", boundingRegions: [{ pageNumber: 1, polygon: ATTN_BOX }], confidence: 0.9 },
    } }],
    pages: [{ pageNumber: 1, unit: "inch", width: 8.2639, height: 11.6806, lines }],
  } });
}
const buyerLine = (name) => L(name, box(0.72, 2.30, 3.90, 2.45));
const ATTN_LINE = L("Attn : Lim Xiao Shan", ATTN_BOX);
const customerOf = (out) => out.fields.find((f) => f.field_path === "invoice.customer_name")?.value_raw;

test("C2 calibration 1: a PARTIAL-LOGO vendor still refuses its own full name", () => {
  // The reviewer's executed probe. Typed VendorName is the fragment `A\nACME`; the seller's full
  // legal name prints nearby as `ACME SDN BHD`. Exact key equality saw two different companies
  // and emitted THE SELLER as the customer. Subset sees {acme} ⊆ {a, acme} — the `a` is a logo
  // fragment, not a distinction.
  const out = withVendor("A\nACME", [
    L("A", box(0.70, 0.30, 1.00, 0.60)), L("ACME", box(1.05, 0.30, 2.80, 0.60)),
    buyerLine("ACME SDN BHD"), ATTN_LINE,
  ]);
  assert.equal(customerOf(out), undefined, "the seller is never the buyer");
  assert.equal(out.envelope.customer_identity.is_vendor_name, 1);
});

test("C2 calibration 2: a FRANCHISE/BRANCH keeps its distinguishing token and is ADMITTED", () => {
  // The direction that must NOT be refused, and the reason the rule is one-directional. A
  // franchisee is a different legal person that may genuinely be the buyer; `PENANG` is the token
  // that says so. Verified green by the reviewer before this change — it must stay green after.
  const out = withVendor("ROME SECRETARY SDN BHD", [buyerLine("ROME SECRETARY (PENANG) SDN BHD"), ATTN_LINE]);
  assert.equal(customerOf(out), "ROME SECRETARY (PENANG) SDN BHD");
  assert.equal(out.envelope.customer_identity.is_vendor_name, 0);
});

test("C2 calibration 3: the REAL-CAPTURE mirror — the radius's accidental protection, made designed", () => {
  // THE POINT OF THIS CELL, stated plainly. On the live documents the seller's full legal name
  // `ROME SECRETARY SDN BHD` sits 2.205in from the customer anchor, outside the 1.0in radius, so
  // the crown cell passes without this wall ever firing. That is LUCK: the same document with a
  // slightly taller header, or a slightly larger radius, would have emitted the seller as the
  // buyer. Here the same name is placed INSIDE the radius against the real typed logo value.
  const out = withVendor("M\nROME\nSECRETARY", [buyerLine("ROME SECRETARY SDN BHD"), ATTN_LINE]);
  assert.equal(customerOf(out), undefined, "{rome,secretary} ⊆ {m,rome,secretary} — no remainder");
  assert.equal(out.envelope.customer_identity.is_vendor_name, 1);
  // …and the CONTROL: the real buyer, against the same real logo, is untouched by the rule.
  const real = withVendor("M\nROME\nSECRETARY", [buyerLine("KONG CHENG RESTAURANTS SDN BHD"), ATTN_LINE]);
  assert.equal(customerOf(real), "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(real.envelope.customer_identity.is_vendor_name, 0);
});

test("C2 calibration 4: the NAMED RESIDUAL — a buyer whose name is a subset of the seller's HOLDS", () => {
  // EYES-OPEN OVER-REFUSAL, recorded as a cell so it is a decision and not a surprise. `ACME
  // SDN BHD` really can be billed by `ACME HOLDINGS SDN BHD` — a distinct legal person — and this
  // rule refuses it. The cost is a HOLD (`customer_name_missing`, where a human already looks);
  // the alternative is admitting the shape that emitted the seller as the customer on live-shaped
  // input. It abstains VISIBLY on `is_vendor_name`, so the receipt can be mined for how often the
  // trade actually bites.
  const out = withVendor("ACME HOLDINGS SDN BHD", [buyerLine("ACME SDN BHD"), ATTN_LINE]);
  assert.equal(customerOf(out), undefined);
  assert.equal(out.envelope.customer_identity.is_vendor_name, 1);
});

test("C2: with NO typed VendorName the subset term cannot fire at all", () => {
  // Fail-open would be the bug here: an absent vendor is NO EVIDENCE, not a match against the
  // empty set. Without this guard every candidate would be "a subset of nothing" and refuse.
  const out = normalizeAzureInvoice({ status: "succeeded", analyzeResult: {
    documents: [{ fields: {
      CustomerName: { content: "Lim Xiao Shan", boundingRegions: [{ pageNumber: 1, polygon: ATTN_BOX }], confidence: 0.9 },
    } }],
    pages: [{ pageNumber: 1, unit: "inch", width: 8.2639, height: 11.6806, lines: [buyerLine("ACME SDN BHD"), ATTN_LINE] }],
  } });
  assert.equal(customerOf(out), "ACME SDN BHD");
  assert.equal(out.envelope.customer_identity.is_vendor_name, 0);
});
