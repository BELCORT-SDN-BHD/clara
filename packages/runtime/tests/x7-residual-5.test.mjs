// X7 — RECORDED RESIDUAL (5): SUFFIXED RELATIONAL PHRASES.
//
// The ONE residual that can still write a WRONG party rather than abstain, given its own file so
// it is impossible to miss. `NON_ADDRESSEE_MARKERS` enumerates the ELEVEN measured forms;
// reviewers constructed more and 23 of the 38 pinned forms still pass candidacy, 5 producing a wrong
// `customer_name` end-to-end. The base is validated by ABSENCE-of-known-bad — the same law that
// produced rounds 1-3 — and the case-discontinuity proposal was implemented, MEASURED and
// REJECTED (it closed 5/5 end-to-end but lost 4 legitimate title-case names and closed NONE once
// the phrases are ALL-CAPS, which is how Malaysian invoices are usually printed).
//
// HARM CEILING: a wrong DRAFT. Counterparty birth happens at HUMAN APPROVAL and no
// unattended-post path reaches `customer_name` — the same maker/checker wall that caught the
// original KONG CHENG defect. OWNER-VETOABLE at or before the ceremony.
//
// These cells DOCUMENT current behaviour rather than assert a fix, so the residual is measured on
// every run instead of remembered. Full veto-ready record with the measurement table and the
// four-part reachability precondition: docs/plan/extraction-slice-contract.md, X7.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";

const box = (x1, y1, x2, y2) => [x1, y1, x2, y1, x2, y2, x1, y2];
const L = (content, polygon) => ({ content, polygon });
const VENDOR = L("ROME SECRETARY SDN BHD", box(0.70, 0.65, 3.50, 0.81));
const BILL_TO = L("Bill To:", box(0.72, 2.10, 1.45, 2.24));

function run(lines, typed, tbox) {
  const out = normalizeAzureInvoice({ status: "succeeded", analyzeResult: {
    documents: [{ fields: {
      InvoiceTotal: { content: "2,800.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: box(6.5, 8.0, 7.7, 8.15) }], confidence: 0.93 },
      VendorName: { content: "ROME SECRETARY SDN BHD", boundingRegions: [{ pageNumber: 1, polygon: box(0.70, 0.65, 3.50, 0.81) }], confidence: 0.94 },
      CustomerName: { content: typed, boundingRegions: [{ pageNumber: 1, polygon: tbox }], confidence: 0.91 },
    } }],
    pages: [{ pageNumber: 1, unit: "inch", width: 8.2639, height: 11.6806, lines }],
  } });
  const g = (p) => out.fields.find((r) => r.field_path === p)?.value_raw;
  return { customer: g("invoice.customer_name"), outcome: out.envelope.customer_identity.outcome };
}

/**
 * THE PINNED CORPUS — 38 entries: 23 asserted ADMITTED (the open residual) and 15 asserted
 * REFUSED (closed by `NON_ADDRESSEE_MARKERS` or the stop-word openers).
 *
 * COUNTS CORRECTED. Earlier records called this "24 forms", conflating two different sets: the
 * CONSTRUCTED relational forms the path-A measurement ran over (23 distinct — see
 * `x7-path-a-rejected.mjs`, where "24" itself double-counted `trading as` across the two review
 * lanes) and THIS array, which also carries the 11 originally-measured forms plus their closed
 * siblings. Both numbers are now derived from the arrays rather than asserted in prose.
 *
 * `admits: true` = still passes candidacy and is part of the recorded residual; `false` = a rule
 * closes it. Documenting CURRENT behaviour, so a future change that moves any of them is visible.
 */
const RELATIONAL_FORMS = [
  ["c/o AMATERUS GROUP SDN BHD", false], ["C/O ACME SDN BHD", false],
  ["care of ACME SDN BHD", false], ["A subsidiary of AMATERUS GROUP SDN BHD", false],
  ["A member of ACME SDN BHD", false], ["Group Company: AMATERUS GROUP SDN BHD", false],
  ["Managed by ACME SDN BHD", false], ["Agent for ACME SDN BHD", false],
  ["Formerly known as OLD NAME SDN BHD", false], ["Payable to ROME SECRETARY SDN BHD", false],
  ["Cheque payable to ROME SECRETARY SDN BHD", false],
  ["on behalf of ACME SDN BHD", false], ["in trust for ACME SDN BHD", false],
  ["Please pay ACME SDN BHD", false], ["Attention ACME SDN BHD", false],
  // ── the OPEN residual: still admitted ──
  ["A division of ACME SDN BHD", true], ["A unit of ACME SDN BHD", true],
  ["An affiliate of ACME SDN BHD", true], ["Associate of ACME SDN BHD", true],
  ["o/b/o ACME SDN BHD", true], ["trading as ACME SDN BHD", true], ["t/a ACME SDN BHD", true],
  ["d/b/a ACME SDN BHD", true], ["Sub-contractor to ACME SDN BHD", true],
  ["Successor to ACME SDN BHD", true], ["Nominee for ACME SDN BHD", true],
  ["Representing ACME SDN BHD", true], ["wholly owned by ACME SDN BHD", true],
  ["Authorised dealer of ACME SDN BHD", true], ["Remit to ACME SDN BHD", true],
  ["Beneficiary ACME SDN BHD", true], ["Bankers ACME SDN BHD", true],
  ["Insured by ACME SDN BHD", true], ["Parent company ACME SDN BHD", true],
  ["A wholly-owned subsidiary ACME SDN BHD", true],
  ["acting on behalf of ACME SDN BHD", true], ["division of ACME SDN BHD", true],
  ["T/A ACME SDN BHD", true],
];

test("RESIDUAL (5): the corpus counts are DERIVED, not asserted", () => {
  assert.equal(RELATIONAL_FORMS.length, 38, "the array holds 38 entries");
  assert.equal(RELATIONAL_FORMS.filter(([, a]) => a).length, 23, "23 admitted — the open residual");
  assert.equal(RELATIONAL_FORMS.filter(([, a]) => !a).length, 15, "15 refused");
  assert.equal(new Set(RELATIONAL_FORMS.map(([f]) => f)).size, 38, "no duplicates");
});

test("RESIDUAL (5): every relational form's candidacy is PINNED, admitted or refused", async () => {
  const { looksLikePartyName } = await import("../lib/invoice-party-grammar.mjs");
  const { hasRegisteredEntitySuffix } = await import("../lib/invoice-entity-lexicon.mjs");
  const candidate = (s) => looksLikePartyName(s) && hasRegisteredEntitySuffix(s);
  for (const [form, admits] of RELATIONAL_FORMS) {
    assert.equal(candidate(form), admits,
      admits ? `${form} — RECORDED RESIDUAL: still admitted (see contract doc, residual 5)`
             : `${form} — closed by NON_ADDRESSEE_MARKERS; must stay closed`);
  }
  // `on behalf of` is closed only because `on` happens to be a stop-word opener — luck, not
  // design. Pinned so the coincidence is visible if the stop-word list ever moves.
  assert.equal(candidate("on behalf of ACME SDN BHD"), false);
  assert.equal(candidate("acting on behalf of ACME SDN BHD"), true, "…and the same phrase with a lead-in is NOT closed");
});

test("RESIDUAL (5): the five END-TO-END scenarios, asserting the behaviour that SHIPS", () => {
  // These produce a WRONG customer_name on a DRAFT. Harm ceiling: counterparty birth is at human
  // approval and no unattended-post path reaches customer_name. Recorded and owner-vetoable.
  for (const phrase of ["A division of AMATERUS GROUP SDN BHD", "t/a AMATERUS GROUP SDN BHD",
    "A wholly-owned subsidiary AMATERUS GROUP SDN BHD", "Parent company AMATERUS GROUP SDN BHD",
    "Successor to AMATERUS GROUP SDN BHD"]) {
    const r = run([VENDOR, BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)),
      L(phrase, box(0.72, 2.55, 3.40, 2.70)), L("Attn : Lim Xiao Shan", box(0.72, 2.80, 2.20, 2.94))],
    "Lim Xiao Shan", box(0.72, 2.80, 2.20, 2.94));
    assert.equal(r.customer, phrase, `RESIDUAL (5) as-shipped: ${phrase} still wins`);
    assert.equal(r.outcome, "attn_overridden");
  }
});

const PHRASE = "A division of AMATERUS GROUP SDN BHD";
const ATTN_BOX = box(0.72, 2.80, 2.20, 2.94);
const ATTN_LINE = L("Attn : Lim Xiao Shan", ATTN_BOX);

test("RESIDUAL (5): the TRUE reachability — which parts are load-bearing, and which are NOT", () => {
  // The earlier record claimed FOUR coincidences, "each individually necessary". A reviewer
  // disproved two of them and it was right; this cell re-measures each by removal, AFTER the
  // round-6 fixes, and pins the counterexamples so the record cannot drift back.
  const wrong = (r) => r.outcome === "attn_overridden" && r.customer === PHRASE;

  // ── LOAD-BEARING (proven by removal) ──────────────────────────────────────────────────────
  // (A) The phrase must sit inside the bounded scan window. Past the block gap it is unreachable.
  assert.equal(wrong(run([VENDOR, BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)),
    L(PHRASE, box(0.72, 3.60, 3.40, 3.75)), ATTN_LINE], "Lim Xiao Shan", ATTN_BOX)), false);
  // (B) Azure's typed CustomerName must be EXACTLY the Attn person this reader itself read.
  for (const typed of ["AMATERUS GROUP SDN BHD", ""]) {
    assert.equal(wrong(run([VENDOR, BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)),
      L(PHRASE, box(0.72, 2.55, 3.40, 2.70)), ATTN_LINE], typed, ATTN_BOX)), false, `typed=${JSON.stringify(typed)}`);
  }
  assert.equal(wrong(run([VENDOR, BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)),
    L(PHRASE, box(0.72, 2.55, 3.40, 2.70))], "Lim Xiao Shan", ATTN_BOX)), false, "no Attn line at all");
  // (C) WHEN a typed VendorName anchor EXISTS, the phrase must be closer to the buyer than to it.
  assert.equal(wrong(run([VENDOR, BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)),
    L(PHRASE, box(0.72, 1.05, 3.40, 1.20)), ATTN_LINE], "Lim Xiao Shan", ATTN_BOX)), false);

  // ── NOT LOAD-BEARING (counterexamples, verbatim) ──────────────────────────────────────────
  // (i) "the real buyer is UNSUFFIXED" is FALSE as stated. A SUFFIXED real buyer printed AFTER
  // the phrase still loses — the scan takes the FIRST qualifying line, so what actually matters
  // is that no suffixed candidate appears EARLIER, not that none exists.
  const afterPhrase = run([VENDOR, BILL_TO, L(PHRASE, box(0.72, 2.30, 3.40, 2.45)),
    L("SIFU LAB SDN BHD", box(0.72, 2.55, 2.60, 2.70)), ATTN_LINE], "Lim Xiao Shan", ATTN_BOX);
  assert.equal(wrong(afterPhrase), true, "a suffixed buyer printed AFTER the phrase does NOT save it");
  // …and the same buyer printed BEFORE the phrase does win, which is the ordering, not the suffix.
  const beforePhrase = run([VENDOR, BILL_TO, L("SIFU LAB SDN BHD", box(0.72, 2.30, 2.60, 2.45)),
    L(PHRASE, box(0.72, 2.55, 3.40, 2.70)), ATTN_LINE], "Lim Xiao Shan", ATTN_BOX);
  assert.equal(beforePhrase.customer, "SIFU LAB SDN BHD");

  // (ii) "attribution compares the phrase against the SELLER" is FALSE when Azure typed no
  // VendorName: `customerAttributionFailure` compares against the vendor ONLY IF that anchor
  // exists, so with no anchor there is no comparison and the override fires.
  const noVendorAnchor = normalizeAzureInvoice({ status: "succeeded", analyzeResult: {
    documents: [{ fields: {
      InvoiceTotal: { content: "2,800.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: box(6.5, 8.0, 7.7, 8.15) }], confidence: 0.93 },
      CustomerName: { content: "Lim Xiao Shan", boundingRegions: [{ pageNumber: 1, polygon: ATTN_BOX }], confidence: 0.91 },
    } }],
    pages: [{ pageNumber: 1, unit: "inch", width: 8.2639, height: 11.6806, lines: [
      BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)), L(PHRASE, box(0.72, 2.55, 3.40, 2.70)), ATTN_LINE,
    ] }],
  } });
  assert.equal(noVendorAnchor.fields.find((f) => f.field_path === "invoice.customer_name")?.value_raw, PHRASE,
    "with NO typed VendorName the seller comparison never runs, and the override still fires");

  // THE HONEST STATEMENT: the residual needs TWO firm conditions (the scan window, and typed ==
  // the reader's own Attn person) plus a SCAN-ORDER condition (no suffixed candidate earlier in
  // the block). The vendor comparison narrows it only on documents where Azure typed a
  // VendorName. That is WIDER than the retired four-coincidence story.
});

