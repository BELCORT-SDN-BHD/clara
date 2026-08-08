// X7 — RECORDED RESIDUAL (5): SUFFIXED RELATIONAL PHRASES.
//
// The ONE residual that can still write a WRONG party rather than abstain, given its own file so
// it is impossible to miss. `NON_ADDRESSEE_MARKERS` enumerates the ELEVEN measured forms;
// reviewers constructed more and 20 still pass candidacy, 5 of them producing a wrong
// `customer_name` end-to-end. The base is validated by ABSENCE-of-known-bad — the same law that
// produced rounds 1-3 — and the case-discontinuity proposal was implemented, MEASURED and
// REJECTED (it closed 5/5 end-to-end but lost 4 legitimate title-case names and closed 0/24 once
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

/** The 24 constructed relational forms. `admits: true` = this form STILL passes candidacy and is
 *  part of the recorded residual; `false` = a rule already closes it. Documenting CURRENT
 *  behaviour, so a future change that moves any of them is visible rather than silent. */
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
  // The four-part reachability precondition, each part individually necessary — remove any one
  // and the residual is unreachable. (1) the real buyer is UNSUFFIXED:
  const suffixedBuyer = run([VENDOR, BILL_TO, L("SIFU LAB SDN BHD", box(0.72, 2.30, 2.60, 2.45)),
    L("A division of AMATERUS GROUP SDN BHD", box(0.72, 2.55, 3.40, 2.70)),
    L("Attn : Lim Xiao Shan", box(0.72, 2.80, 2.20, 2.94))], "Lim Xiao Shan", box(0.72, 2.80, 2.20, 2.94));
  assert.equal(suffixedBuyer.customer, "SIFU LAB SDN BHD", "a suffixed real buyer wins first");
  // (4) typed is exactly the Attn person — a real typed name instead holds or withdraws:
  const realTyped = run([VENDOR, BILL_TO, L("SIFU LAB", box(0.72, 2.30, 1.90, 2.45)),
    L("A division of AMATERUS GROUP SDN BHD", box(0.72, 2.55, 3.40, 2.70)),
    L("Attn : Lim Xiao Shan", box(0.72, 2.80, 2.20, 2.94))], "AMATERUS GROUP SDN BHD", box(0.72, 2.80, 2.20, 2.94));
  assert.notEqual(realTyped.outcome, "attn_overridden", "no override without the Attn coincidence");
});

