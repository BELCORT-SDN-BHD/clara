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
import { identityComparisonTokens, partyKey } from "../lib/invoice-entity-lexicon.mjs";
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

// ══════════════════════════════════════════════════════════════════════════════════════════════
// N1 — FRAGMENTED VENDOR GLYPHS. The re-verify round's HIGH finding: token segmentation defeated
// the subset test, so a seller whose typed name arrived split emitted as the customer on every
// surface. The repair is the comparison fold's own territory — comparison MERGES.
// ══════════════════════════════════════════════════════════════════════════════════════════════

/** The same buyer line on all three candidate surfaces, against a chosen typed VendorName. */
function onAllSurfaces(vendorContent, buyerName) {
  const page = (lines) => withVendor(vendorContent, lines);
  return {
    sweep: customerOf(page([buyerLine(buyerName), ATTN_LINE])),
    split: customerOf(page([BILL_TO, buyerLine(buyerName), ATTN_LINE])),
    sameLine: customerOf(page([L(`Bill To: ${buyerName}`, box(0.72, 2.30, 3.90, 2.45)), ATTN_LINE])),
  };
}

test("N1: a FRAGMENTED vendor name still refuses its own full spelling — all three surfaces", () => {
  // Executed and CONFIRMED: each of these emitted THE SELLER as customer_name with
  // is_vendor_name=0, because the tokens compared were `{a,c,m,e}` against `{acme}`. Both
  // DIRECTIONS are probed — the fragment can arrive on either side, since OCR splits the page
  // line just as readily as Azure splits the typed field.
  const FRAGMENTED = [
    ["A\nC\nM\nE", "ACME SDN BHD"],       // line-split Latin, the reported shape
    ["A.C.M.E.", "ACME SDN BHD"],         // dotted initials, same tokens by a different route
    ["ACME", "A.C.M.E. SDN BHD"],         // the REVERSE — fragmentation on the candidate side
    ["鑫\n旺", "鑫旺 SDN BHD"],              // line-split CJK: the case `\b` could not see
    ["鑫旺", "鑫 旺 SDN BHD"],              // …and its reverse
  ];
  for (const [vendor, buyer] of FRAGMENTED) {
    const r = onAllSurfaces(vendor, buyer);
    assert.equal(r.sweep, undefined, `${JSON.stringify(vendor)} vs ${buyer} — swept in as buyer`);
    assert.equal(r.split, undefined, `${JSON.stringify(vendor)} vs ${buyer} — split seam`);
    assert.equal(r.sameLine, undefined, `${JSON.stringify(vendor)} vs ${buyer} — same-line seam`);
  }
});

test("N1 CONTROL: joining must not manufacture false vendor-refusals of initialed buyers", () => {
  // The cost side of the same fold. An initialed or punctuated buyer name joins too, so it must
  // still be ADMITTED when the seller is a different company — otherwise the repair for a
  // wrong-party path becomes a lost identity on every `D&D`-shaped customer in the book.
  for (const buyer of ["D&D SDN BHD", "A-B TRADING SDN BHD", "A/B TRADING SDN BHD", "D & D ENTERPRISE SDN BHD"]) {
    const r = onAllSurfaces("ROME SECRETARY SDN BHD", buyer);
    assert.equal(r.sweep, buyer, `${buyer} is a real buyer and must be readable`);
    assert.equal(r.split, buyer);
    assert.equal(r.sameLine, buyer);
  }
});

test("N1: the four calibration points survive the join UNCHANGED", () => {
  // The run-of-two bound exists for these two rows: join a run of ONE forward and both invert.
  assert.equal(onAllSurfaces("A\nACME", "ACME SDN BHD").sweep, undefined, "partial logo still refuses");
  assert.equal(onAllSurfaces("M\nROME\nSECRETARY", "ROME SECRETARY SDN BHD").sweep, undefined, "mirror still refuses");
  assert.equal(onAllSurfaces("ROME SECRETARY SDN BHD", "ROME SECRETARY (PENANG) SDN BHD").sweep,
    "ROME SECRETARY (PENANG) SDN BHD", "franchise still admitted");
  assert.equal(onAllSurfaces("M\nROME\nSECRETARY", "KONG CHENG RESTAURANTS SDN BHD").sweep,
    "KONG CHENG RESTAURANTS SDN BHD", "the real buyer still admitted");
});

// ══════════════════════════════════════════════════════════════════════════════════════════════
// N2 — THE DECLARED SAFE-HOLDS. Two shapes the comparison fold merges and the CONTEST key does
// not. Pinned here so the divergence is a proven property of the design, not a latent surprise.
// ══════════════════════════════════════════════════════════════════════════════════════════════

test("N2: the comparison fold is DELIBERATELY coarser than the contest key", () => {
  // ADMISSION NARROWS, COMPARISON MERGES. `partyKey` decides whether two readings CONTEST, where
  // a false merge is WRONG-SILENT — so it keeps these pairs apart. `identityComparisonTokens`
  // decides whether to REFUSE a candidate as the seller, where a false merge is a visible HOLD —
  // so it merges them. Opposite failure modes, opposite precision. Asserted BOTH ways, because
  // the claim is the divergence itself: proving only one half would prove nothing about the law.
  for (const [a, b] of [["A/B TRADING SDN BHD", "A-B TRADING SDN BHD"], ["ACME SDN BHD", "ACME BERHAD"]]) {
    assert.notEqual(partyKey(a), partyKey(b), `${a} vs ${b}: the CONTEST key must keep them apart`);
    assert.deepEqual([...identityComparisonTokens(a)].sort(), [...identityComparisonTokens(b)].sort(),
      `${a} vs ${b}: the COMPARISON fold must merge them`);
  }
});

test("N2: both declared safe-holds HOLD, visibly, on is_vendor_name", () => {
  // (b) PUNCTUATION CLASS and (c) LEGAL SUFFIX from the residual list. Each is an over-refusal:
  // the buyer really is a different registered entity from the seller, and the lane holds anyway.
  // The price of a coarse fold, paid deliberately — the alternative admits `ACME BERHAD` (the
  // seller in its other lawful form) as the buyer, and a wrong counterparty outranks a hold.
  const punctuation = withVendor("A-B TRADING SDN BHD", [buyerLine("A/B TRADING SDN BHD"), ATTN_LINE]);
  assert.equal(customerOf(punctuation), undefined);
  assert.equal(punctuation.envelope.customer_identity.is_vendor_name, 1, "the hold is COUNTED, not silent");

  const suffix = withVendor("ACME BERHAD", [buyerLine("ACME SDN BHD"), ATTN_LINE]);
  assert.equal(customerOf(suffix), undefined);
  assert.equal(suffix.envelope.customer_identity.is_vendor_name, 1, "the hold is COUNTED, not silent");
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
