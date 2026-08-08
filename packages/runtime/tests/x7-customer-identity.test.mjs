// X7 — the deterministic customer-identity READER. Pure unit tests, no DB.
//
// THE DANGEROUS DIRECTION HERE IS NOT A MISSING FACT — it is the WRONG PARTY filed as the
// customer, which on a sales invoice births a counterparty on real client books and poisons every
// receipt, statement and ageing line downstream. A missing customer_name merely returns the lane
// to `customer_name_missing`, where a human already has to look. So the majority of these cells
// assert that nothing is emitted.
//
// ── WHAT IS PINNED WHERE, stated because an earlier version of this claim was overstated ──────
// This file pins the READER: which line wins, which wall refused, and what the receipt says.
// SPELLING lives in `x7-party-grammar.test.mjs`, and since round 3 spelling DOES NOT decide party
// candidacy — `hasRegisteredEntitySuffix` does. END-TO-END behaviour lives in
// `x7-customer-mapper.test.mjs`, through `normalizeAzureInvoice`; EVERY executed review-probe
// scenario from all three rounds is pinned THERE, because reviewers twice disproved a claim of
// mine that rested on grammar-level cells alone.
//
// Fixture provenance and its honest limits: see x7-customer-testkit.mjs's header.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  readCustomerIdentityFromLines,
  splitBillToLabel,
  splitAttnLabel,
  looksLikePartyName,
} from "../lib/invoice-customer-identity.mjs";
import {
  ANCHORS, ATTN_PERSON, BILL_TO_LABEL, KONG_CHENG, KONG_CHENG_BLOCK,
  ADDRESS_STREET, ADDRESS_CITY, VENDOR_LETTERHEAD, box, line, page,
} from "./x7-customer-testkit.mjs";

const read = (lines, anchors = ANCHORS, opts) => readCustomerIdentityFromLines([page(lines)], anchors, opts);
const partyOf = (r) => r.fields.find((f) => f.field_path === "invoice.customer_name");
const contactOf = (r) => r.fields.find((f) => f.field_path === "invoice.contact_person");

// ======================================================================================
// THE F7 SHAPE ITSELF
// ======================================================================================

test("the KONG CHENG shape: the BOXED PARTY is the customer, the Attn person is the CONTACT", () => {
  const { fields, receipt } = read(KONG_CHENG_BLOCK);
  assert.equal(fields.length, 2, "one party, one contact — the two facts the block states");
  assert.equal(partyOf({ fields }).value_raw, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(contactOf({ fields }).value_raw, "Lim Xiao Shan");
  assert.equal(receipt.outcome, "matched");
  assert.equal(receipt.matched, 1);
  assert.equal(receipt.attn_matched, 1);
  // Word boundaries survive in the key (round 4): punctuation folds to a SPACE, never to nothing,
  // so `A-B SDN BHD` and `AB SDN BHD` cannot silently become one identity.
  assert.equal(receipt.attn_key, "lim xiao shan", "the contact key is what the mapper's override branch tests against");
  // The emission rides the PARTY LINE's own polygon — never the label's, never fabricated.
  assert.deepEqual(partyOf({ fields }).polygon, KONG_CHENG.polygon);
  assert.deepEqual(contactOf({ fields }).polygon, ATTN_PERSON.polygon);
  assert.equal(partyOf({ fields }).confidence, null, "Azure returns no confidence on lines[]");
});

test("the ADDRESS between the name and the Attn line is never promoted to a party", () => {
  // The split-line scan's whole risk. `No 12, Jalan Ampang` reaches the gate and is refused twice
  // over (a numbered unit AND a street noun); `50450 Kuala Lumpur` by its postcode.
  assert.equal(looksLikePartyName("No 12, Jalan Ampang"), false);
  assert.equal(looksLikePartyName("50450 Kuala Lumpur"), false);
  // With the party line REMOVED, the block states no party at all and the reader says so.
  const { fields, receipt } = read([VENDOR_LETTERHEAD, BILL_TO_LABEL, ADDRESS_STREET, ADDRESS_CITY, ATTN_PERSON]);
  assert.equal(partyOf({ fields }), undefined, "an address is not an identity");
  // BOTH address lines are now examined (a non-candidate is a SKIP, not a stop) and both are
  // refused by the NAME gate rather than the entity gate — the receipt says which wall fired.
  assert.equal(receipt.rejected_gate, 2);
  assert.equal(receipt.no_entity_suffix, 0);
  assert.equal(receipt.split_line_exhausted, 1);
  assert.equal(receipt.outcome, "absent");
  // The contact still reads — it is an independent fact about the same block.
  assert.equal(contactOf({ fields }).value_raw, "Lim Xiao Shan");
});

test("an Attn line printed ABOVE the party name is skipped, not taken", () => {
  // The ranking is structural: the person is never a party candidate, whatever the print order.
  const attnFirst = line("Attn : Lim Xiao Shan", box(0.72, 2.30, 2.20, 2.45));
  const partySecond = line("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.50, 3.30, 2.65));
  const { fields, receipt } = read([BILL_TO_LABEL, attnFirst, partySecond]);
  assert.equal(partyOf({ fields }).value_raw, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(contactOf({ fields }).value_raw, "Lim Xiao Shan");
  assert.equal(receipt.reserved_skipped, 1, "claimed by the contact pass, so the party scan steps over it");
});

test("a SPLIT `Attention:` label RESERVES its value line — the contact can never become the party", () => {
  // The contact read runs as its own pass precisely for this shape. Under a single interleaved
  // pass a bare `Attention:` reserved only its LABEL line, so the name beneath it stayed a live
  // party candidate — and with an empty-but-regioned typed CustomerName the reader emitted
  // `Lim Xiao Shan` as customer_name, manufacturing a wrong identity where pass-through had none.
  const attnLabel = line("Attention:", box(0.72, 2.25, 1.60, 2.39));
  const person = line("Lim Xiao Shan", box(0.72, 2.40, 2.20, 2.54));
  const party = line("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.55, 3.30, 2.69));
  const { fields, receipt } = read([BILL_TO_LABEL, attnLabel, person, party]);
  assert.equal(contactOf({ fields }).value_raw, "Lim Xiao Shan", "the split form still reads the contact");
  assert.equal(partyOf({ fields }).value_raw, "KONG CHENG RESTAURANTS SDN BHD", "and the party beneath it still reads");
  assert.ok(receipt.reserved_skipped >= 1, "the reserved value line was stepped over, not consumed");
  // Even when attribution REFUSES the contact, the line stays reserved: the document labelled it
  // a contact, and attribution failing says something about geometry, not about what the line IS.
  const noAnchor = read([BILL_TO_LABEL, attnLabel, person, party], { vendor: null, customer: { page: 1, xmin: 0.72, xmax: 3.30, ymin: 2.55, ymax: 2.69 } });
  assert.notEqual(partyOf(noAnchor)?.value_raw, "Lim Xiao Shan", "a contact is never promoted, however attribution lands");
});

test("the SAME-LINE bill-to form reads too — `Bill To: ACME` and `M/s ACME`", () => {
  for (const text of ["Bill To: KONG CHENG RESTAURANTS SDN BHD", "M/s KONG CHENG RESTAURANTS SDN BHD"]) {
    const { fields } = read([line(text, box(0.72, 2.30, 4.60, 2.45))]);
    assert.equal(partyOf({ fields })?.value_raw, "KONG CHENG RESTAURANTS SDN BHD", text);
  }
});

// ======================================================================================
// THE LABEL VOCABULARY — and the word boundary that makes it safe
// ======================================================================================

test("`to` MUST NOT match `TOTAL PAYABLE` — the boundary is the only thing standing here", () => {
  // Without the word-boundary check the vocabulary entry `to` matches the folded `total payable`
  // and this reader emits `TAL PAYABLE` as the customer of record. That is the first thing that
  // happens if the check is removed, which is why it has its own cell.
  assert.equal(splitBillToLabel("TOTAL PAYABLE : 2,800.00"), null);
  assert.equal(splitBillToLabel("Total"), null);
  assert.equal(splitBillToLabel("Tolak Diskaun"), null);
  // The genuine BARE form still reads — and only the bare form (see the next cell).
  assert.equal(splitBillToLabel("To:").remainder, "");
  assert.equal(splitBillToLabel("To").remainder, "");
  // And the same boundary on the Attn side.
  assert.equal(splitAttnLabel("ATTNXYZ SDN BHD"), null);
  assert.equal(splitAttnLabel("Attention: Ms Tan").remainder, "Ms Tan");
});

test("`to` IS BARE-LABEL ONLY — Malaysian invoices print their LINE ITEMS in the infinitive", () => {
  // The merge-blocking defect of the first cut, and the reason the entry is now restricted.
  // `To supply and install…` is a legal `to` hit whose remainder opens with a CONTENT word, so
  // the stop-word guard never fires — and the line item became a live party candidate. Executed,
  // it births a line-item string as customer_name, destroys correct typed names, and makes the
  // F7 fix itself read `contested` on its own target document.
  for (const item of [
    "To supply and install air-conditioning system",
    "To Secretarial fee for the year 2025",
    "To Professional fee for incorporation of company",
    "To render professional secretarial services",
    "To carry out annual audit",
    "TO SUPPLY LABOUR AND MATERIAL",
    "To Annual Return filing fee",
  ]) {
    assert.equal(splitBillToLabel(item), null, `${item} must not be a label hit at all`);
    // …and it must produce ZERO party candidates through the READER, not merely the grammar.
    const { fields, receipt } = read([line(item, box(0.72, 2.30, 4.60, 2.45)), ATTN_PERSON]);
    assert.equal(partyOf({ fields }), undefined, `${item} must never become a party`);
    assert.equal(receipt.outcome, "absent");
  }
  // The cost, stated: a same-line `To : ACME` no longer reads. Abstaining is the safe direction —
  // Azure's typed value stands, which is exactly the pre-X7 behaviour.
  assert.equal(splitBillToLabel("To : ACME SDN BHD"), null);
  // Every OTHER label still takes a same-line remainder; only `to` is restricted.
  assert.equal(splitBillToLabel("Bill To: ACME SDN BHD").remainder, "ACME SDN BHD");
});

test("a label CONTINUATION refuses the line outright — `Customer Service` is not a customer", () => {
  for (const text of ["Customer Service : 03-1234 5678", "Bill To Address : 12 Jalan Ampang",
    "Customer No. 8011408205", "Customer Ref: PO-9001", "Client Account : 5123"]) {
    const hit = splitBillToLabel(text);
    assert.equal(hit?.continuation, true, `${text} must be flagged as a continuation`);
  }
  const { fields, receipt } = read([line("Customer Service : 03-1234 5678", box(0.72, 2.30, 3.30, 2.45))]);
  assert.equal(partyOf({ fields }), undefined);
  assert.equal(receipt.label_continuation, 1);
  assert.equal(receipt.outcome, "absent");
});

test("PARTY CANDIDACY needs the ENTITY SIGNAL — furniture and captions never reach the party path", () => {
  // The round-3 design law, exercised through the READER (the grammar-level half lives in
  // x7-party-grammar.test.mjs, and a green cell there proves nothing about this).
  for (const furniture of ["Name:", "12, Main Road", "A T T N : Lim Xiao Shan", "DELIVERY ADDRESS",
    "MAILING ADDRESS", "Payment Terms", "Signature", "Delivery Note", "鑫旺有限公司"]) {
    const { fields, receipt } = read([BILL_TO_LABEL, line(furniture, box(0.72, 2.30, 3.30, 2.45))]);
    assert.equal(partyOf({ fields }), undefined, `${furniture} must never become a party`);
    assert.equal(receipt.outcome, "absent");
  }
  // A SUFFIXED name in the same position reads — the gate admits on evidence, not on shape luck.
  const { fields } = read([BILL_TO_LABEL, line("ACME SDN BHD", box(0.72, 2.30, 3.30, 2.45))]);
  assert.equal(partyOf({ fields }).value_raw, "ACME SDN BHD");
});

test("ONE LEXICON, TWO POLARITIES — a party must carry the signal, a contact must not", () => {
  // Executed before this rule: `Bill To:` → `Attention:` → `ACME SDN BHD` emitted the company as
  // BOTH customer_name and contact_person, persisting a real party as a human being.
  const attnLabel = line("Attention:", box(0.72, 2.25, 1.60, 2.39));
  const company = line("ACME SDN BHD", box(0.72, 2.40, 2.60, 2.54));
  const { fields, receipt } = read([BILL_TO_LABEL, attnLabel, company]);
  assert.equal(contactOf({ fields }), undefined, "an entity-suffixed string is never a person");
  // …and it is not merely dropped: it competes on the PARTY path, where it belongs.
  assert.equal(partyOf({ fields }).value_raw, "ACME SDN BHD");
  assert.equal(receipt.attn_rejected_gate, 1, "the contact pass examined the company and refused it");
  assert.equal(receipt.attn_no_value, 1, "…and then reported that the bare label found no contact at all");
  // The true F7 shape still yields BOTH fields — the person a person, the company a company.
  const real = read(KONG_CHENG_BLOCK);
  assert.equal(partyOf(real).value_raw, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(contactOf(real).value_raw, "Lim Xiao Shan");
});

test("SUFFIX SPELLINGS collapse; two genuinely different entities still contest", () => {
  // `KONG CHENG…SDN BHD` vs `KONG CHENG…S/B` is one company written two lawful ways. Keying them
  // apart made the reader declare a contest and WITHDRAW a correct typed name.
  const s1 = line("Bill To: KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.15, 4.60, 2.29));
  const s2 = line("Customer : KONG CHENG RESTAURANTS S/B", box(0.72, 2.32, 4.20, 2.46));
  const same = read([s1, s2]);
  assert.equal(same.receipt.outcome, "matched");
  assert.equal(same.receipt.occurrences, 2);
  assert.equal(partyOf(same).value_raw, "KONG CHENG RESTAURANTS SDN BHD");
  // The residual, held EYES-OPEN: two genuinely different registered buyers still contest.
  const a = line("Bill To: WRONG HOLDING SDN BHD", box(0.72, 2.15, 3.60, 2.29));
  const b = line("Customer : ACTUAL SUBSIDIARY SDN BHD", box(0.72, 2.32, 3.90, 2.46));
  assert.equal(read([a, b]).receipt.outcome, "contested");
});

test("the identity key is UNICODE-AWARE — two Chinese company names are two parties", () => {
  // The ASCII key deleted every non-ASCII letter, so `鑫旺 SDN BHD` and `宏达 SDN BHD` both keyed
  // to `sdnbhd`: uniqueness-or-nothing read ONE party matched twice instead of a contest, and
  // the reader emitted `"?? SDN BHD"`. A key that cannot tell two names apart is not a defense.
  // Two distinct Chinese parties are a CONTEST, not a match with two occurrences.
  const a = line("Bill To: 鑫旺 SDN BHD", box(0.72, 2.30, 3.30, 2.45));
  const b = line("Customer: 宏达 SDN BHD", box(0.72, 2.50, 3.30, 2.65));
  const { fields, receipt } = read([a, b]);
  assert.equal(partyOf({ fields }), undefined);
  assert.equal(receipt.outcome, "contested");
  assert.deepEqual(receipt.distinct_keys.sort(), ["宏达 sdnbhd", "鑫旺 sdnbhd"].sort());
  // …while the SAME Chinese name printed twice is still one candidate.
  const twice = read([a, line("Bill To: 鑫旺 Sdn Bhd", box(0.72, 2.50, 3.30, 2.65))]);
  assert.equal(partyOf(twice).value_raw, "鑫旺 SDN BHD");
  assert.equal(twice.receipt.occurrences, 2);
});

// ======================================================================================
// UNIQUENESS-OR-NOTHING (defense a)
// ======================================================================================

test("TWO DISTINCT labelled parties is a CONTEST — no identity beats the wrong identity", () => {
  const second = line("Bill To: SOME OTHER BUYER SDN BHD", box(0.72, 2.55, 3.80, 2.70));
  const { fields, receipt } = read([BILL_TO_LABEL, KONG_CHENG, second, ATTN_PERSON]);
  assert.equal(partyOf({ fields }), undefined);
  assert.equal(receipt.outcome, "contested", "a measured contest, not an abstention");
  assert.equal(receipt.contested, 1);
  assert.deepEqual(receipt.distinct_keys.sort(), ["kong cheng restaurants sdnbhd", "some other buyer sdnbhd"]);
  // The contact read is INDEPENDENT: a contested party says nothing about who the Attn person is.
  assert.equal(contactOf({ fields }).value_raw, "Lim Xiao Shan");
});

test("the SAME party printed twice collapses to ONE emission", () => {
  const repeat = line("Bill To: KONG CHENG RESTAURANTS SDN. BHD.", box(0.72, 2.55, 4.60, 2.70));
  const { fields, receipt } = read([BILL_TO_LABEL, KONG_CHENG, repeat]);
  assert.equal(fields.filter((f) => f.field_path === "invoice.customer_name").length, 1);
  assert.equal(receipt.occurrences, 2, "read twice, one fact — punctuation is not a second party");
  assert.equal(receipt.outcome, "matched");
});

test("TWO DISTINCT Attn persons emit no contact at all", () => {
  const second = line("Attn : Tan Wei Ming", box(0.72, 3.10, 2.20, 3.24));
  const { fields, receipt } = read([BILL_TO_LABEL, KONG_CHENG, ATTN_PERSON, second]);
  assert.equal(contactOf({ fields }), undefined, "two named contacts is not a fact about one person");
  assert.equal(receipt.attn_ambiguous, 1);
  assert.equal(receipt.attn_key, undefined, "no contact key means the mapper's override branch is unreachable");
  assert.equal(partyOf({ fields }).value_raw, "KONG CHENG RESTAURANTS SDN BHD", "the party read is unaffected");
});

test("a page-2 repeat carries no attribution evidence and is refused, page 1 still reads", () => {
  // Azure types CustomerName on page 1 only, so a page-2 candidate has no anchor — X6's exact
  // shape, and the same answer: refused rather than assumed.
  const { fields, receipt } = readCustomerIdentityFromLines(
    [page(KONG_CHENG_BLOCK, 1), page([BILL_TO_LABEL, KONG_CHENG], 2)],
    ANCHORS,
  );
  assert.equal(partyOf({ fields }).value_raw, "KONG CHENG RESTAURANTS SDN BHD");
  assert.equal(partyOf({ fields }).page, 1);
  assert.equal(receipt.occurrences, 1);
  assert.equal(receipt.no_customer_anchor, 1);
});

// ======================================================================================
// CUSTOMER-BLOCK ATTRIBUTION (defense c) — the wall that makes an emission EVIDENCED
// ======================================================================================

test("attribution FAILS CLOSED — no typed CustomerName region means no evidence, so no emission", () => {
  const { fields, receipt } = read(KONG_CHENG_BLOCK, { vendor: ANCHORS.vendor, customer: null });
  assert.equal(fields.length, 0, "neither the party nor the contact may be asserted without an anchor");
  assert.equal(receipt.no_customer_anchor, 1);
  assert.equal(receipt.attn_unattributed, 1);
  assert.equal(receipt.outcome, "absent");
  // A customer region on ANOTHER page is not evidence about this one.
  const otherPage = read(KONG_CHENG_BLOCK, { vendor: null, customer: { ...ANCHORS.customer, page: 2 } });
  assert.equal(otherPage.fields.length, 0);
  assert.equal(otherPage.receipt.no_customer_anchor, 1);
});

test("a labelled party NEARER THE SELLER is refused — both attribution terms are load-bearing", () => {
  // The mirror of X6's wrong-party path. Geometry chosen so ONLY the second term can refuse it:
  // 0.95in from the customer anchor (INSIDE the 1.0in gap, so the gap alone would let it through)
  // but 0.91in from the vendor's. Nearer the seller means it is the seller's.
  const nearerSeller = line("Bill To: ROME SECRETARY SDN BHD", box(0.72, 1.72, 3.30, 1.95));
  const { fields, receipt } = read([VENDOR_LETTERHEAD, nearerSeller, KONG_CHENG, ATTN_PERSON]);
  assert.equal(partyOf({ fields }), undefined, "the seller's own name is never the buyer");
  assert.equal(receipt.closer_to_vendor, 1);
  assert.equal(receipt.customer_anchor_far, 0, "the gap alone would have let this through");
  assert.equal(receipt.outcome, "absent");

  // A `To:` line further up, INSIDE the letterhead, is refused one wall earlier — the same
  // ordering X6 records for its own buyer-block cell, and worth pinning so a threshold change
  // that reshuffles the two walls is visible rather than silent.
  const inLetterhead = line("Bill To: ROME SECRETARY SDN BHD", box(0.70, 0.85, 3.50, 1.00));
  const higher = read([VENDOR_LETTERHEAD, inLetterhead, ATTN_PERSON]);
  assert.equal(higher.receipt.customer_anchor_far, 1);
  assert.equal(higher.receipt.closer_to_vendor, 0);
});

test("a candidate beyond the anchor gap is refused, and the gap is an OPT not a law", () => {
  const farDown = line("Bill To: ACME SDN BHD", box(0.72, 6.00, 3.30, 6.15));
  const { fields, receipt } = read([farDown]);
  assert.equal(fields.length, 0);
  assert.equal(receipt.customer_anchor_far, 1);
  // The thresholds are UNMEASURED (see the module header), so every one of them is re-measurable
  // rather than argued about. Relaxed, the same document reads.
  const relaxed = read([farDown], { vendor: null, customer: ANCHORS.customer }, { customerAnchorGapIn: 4.0 });
  assert.equal(relaxed.fields.length, 1);
  assert.equal(relaxed.fields[0].value_raw, "ACME SDN BHD");
});

test("proximity is TWO-DIMENSIONAL — a party far to the RIGHT is not adjacent", () => {
  // A y-only gap calls a name on the left and a name on the right "adjacent", distance 0. X6
  // learned this the expensive way; the rule is imported in spirit and pinned here.
  const farX = line("Bill To: ACME SDN BHD", box(6.00, 2.90, 8.10, 3.04));
  const { fields, receipt } = read([farX]);
  assert.equal(fields.length, 0, "same band, four inches away, is not the bill-to box");
  assert.equal(receipt.customer_anchor_far, 1);
});

// ======================================================================================
// GEOMETRY HYGIENE — the refusals that must never become silent
// ======================================================================================

test("a recognised label with unusable geometry is COUNTED, never silently dropped", () => {
  const { fields, receipt } = read([line("Bill To: ACME SDN BHD", [])]);
  assert.equal(fields.length, 0);
  assert.equal(receipt.no_geometry, 1, "a readable document must not look like one that printed nothing");
  assert.deepEqual(receipt.candidates, [{ label: "bill to", outcome: "no_geometry", page: 1, kind: "party" }]);
  assert.deepEqual(readCustomerIdentityFromLines(null, ANCHORS).fields, []);
  assert.deepEqual(readCustomerIdentityFromLines([], ANCHORS).fields, []);
  assert.deepEqual(read([line("Bill To: ACME SDN BHD", [1, 2, 3, 4])]).fields, []);
});

test("a PIXEL page reads exactly what the same geometry in inches reads", () => {
  // The X2 unit lesson, inherited rather than re-learned: an inch threshold compared against raw
  // pixels makes a legitimate 2px gap look like a 2-inch one and refuses every photographed bill.
  const scale = 1100 / 8.2639;
  const px = (l) => line(l.content, l.polygon.map((n) => n * scale));
  const pixelAnchors = {
    vendor: { page: 1, xmin: 0.70 * scale, xmax: 3.50 * scale, ymin: 0.65 * scale, ymax: 0.81 * scale },
    customer: { page: 1, xmin: 1.10 * scale, xmax: 2.20 * scale, ymin: 2.90 * scale, ymax: 3.04 * scale },
  };
  const inches = read(KONG_CHENG_BLOCK);
  const pixels = readCustomerIdentityFromLines(
    [{ pageNumber: 1, lines: KONG_CHENG_BLOCK.map(px), unit: "pixel", width: 1100, height: 11.6806 * scale }],
    pixelAnchors,
  );
  assert.equal(pixels.fields.length, 2, "same document, same reading, whichever unit the engine chose");
  assert.equal(partyOf(pixels).value_raw, partyOf(inches).value_raw);
  assert.equal(contactOf(pixels).value_raw, contactOf(inches).value_raw);
  // Polygons stay in the page's OWN coordinates — scaling is internal to the comparison.
  assert.equal(partyOf(pixels).polygon[0], 0.72 * scale);
});

test("a pixel page with no usable width is refused, not measured in the wrong unit", () => {
  const scale = 1100 / 8.2639;
  const { fields, receipt } = readCustomerIdentityFromLines(
    [{ pageNumber: 1, lines: KONG_CHENG_BLOCK.map((l) => line(l.content, l.polygon.map((n) => n * scale))), unit: "pixel", height: 11.6806 * scale }],
    ANCHORS,
  );
  assert.equal(fields.length, 0);
  assert.equal(receipt.unit_unresolved, 2, "both the party label and the Attn line are refused, and both are counted");
});

test("the split-line scan STOPS at the block boundary and the column, and SKIPS within it", () => {
  const anchors = { vendor: null, customer: ANCHORS.customer };
  // (i) too far below the label — the block has ended. A STOP.
  const farBelow = line("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 3.20, 3.30, 3.35));
  assert.equal(read([BILL_TO_LABEL, farBelow], anchors).receipt.split_line_exhausted, 1);
  // (ii) a line in another COLUMN is a SKIP, not a stop — see the interleave cell below — but a
  // block whose ONLY following line is in another column still finds no party.
  const otherColumn = line("KONG CHENG RESTAURANTS SDN BHD", box(5.00, 2.30, 7.50, 2.45));
  const only = read([BILL_TO_LABEL, otherColumn], anchors);
  assert.equal(only.receipt.split_line_exhausted, 1);
  assert.equal(only.receipt.column_skipped, 1, "skipped and counted, not silently dropped");
});

test("a TWO-COLUMN header interleaves the right column — the party is still found", () => {
  // Azure emits lines in READING ORDER, so a two-column header alternates left/right between the
  // `Bill To:` label and the party beneath it. The first cut BROKE on the first non-overlapping
  // line: fail-closed, but it meant the fix might never FIRE on a real KONG CHENG layout, and it
  // made a line item far more likely to be the document's only candidate.
  const lines = [
    VENDOR_LETTERHEAD,
    BILL_TO_LABEL,
    line("Invoice No: RSINV-0041", box(5.20, 2.10, 7.60, 2.24)),   // right column, same row
    KONG_CHENG,
    line("Date: 14/10/2025", box(5.20, 2.30, 6.80, 2.45)),          // right column again
    ATTN_PERSON,
  ];
  const { fields, receipt } = read(lines);
  assert.equal(partyOf({ fields }).value_raw, "KONG CHENG RESTAURANTS SDN BHD", "the interleave no longer hides the party");
  assert.equal(contactOf({ fields }).value_raw, "Lim Xiao Shan");
  assert.equal(receipt.outcome, "matched");
  assert.equal(receipt.split_line_exhausted, 0);
  assert.ok(receipt.column_skipped >= 1, "the right-column line was stepped over, and counted");
});

test("the lookahead budget still TERMINATES a pathological page", () => {
  // Skipping spends budget where it used to end the scan, so the bound is the only thing that
  // stops a page of interleaved noise. It is a wall, not a suggestion.
  const anchors = { vendor: null, customer: ANCHORS.customer };
  const noise = (y) => line("Invoice No: RSINV-0041", box(5.20, y, 7.60, y + 0.10));
  const lines = [BILL_TO_LABEL];
  for (let k = 0; k < 12; k++) lines.push(noise(2.26 + k * 0.02));
  lines.push(line("KONG CHENG RESTAURANTS SDN BHD", box(0.72, 2.52, 3.30, 2.66)));
  const { fields, receipt } = read(lines, anchors);
  assert.equal(partyOf({ fields }), undefined, "beyond the budget is out of reach, whatever it is");
  assert.equal(receipt.split_line_exhausted, 1);
  assert.equal(receipt.column_skipped, 5, "exactly maxLookaheadLines steps were taken, then it stopped");
});
