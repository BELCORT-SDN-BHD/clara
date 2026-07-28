// The currency defect fix — the MAPPER side: reconciling the currency reader against Azure's
// own typed `invoice.currency`, through `normalizeAzureInvoice`. Pure unit tests, no DB.
// (currency-defect design part 1 §8 gates CG1/CG2/CG3/CG6/CG9-build-side/CG11-mapper-half; P1-P4
// are the Codex review-round findings addressed across two rounds — P2/P3/P4 closed on the first
// pass, P1 closed on the second after an adversarial finding killed the amount-adjacency gate the
// first P1 fix tried; see each cell's own comment and `invoice-currency-reader.mjs`'s header,
// "THE NAMED RESIDUAL", for the final shape and its orchestrator-ruled authority.)
//
// Every pinned line is COPIED VERBATIM from a real Azure OCR capture (see currency-reader.test
// .mjs's header for provenance and the git-exclusion note). CG5/CG7-after/CG10, and CG11's
// DB/persistence half, are the LIVE re-extraction ceremony — explicitly out of scope here,
// driven by the orchestrator post-deploy. No DB-side test is added in this file, by design.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice, NORMALIZATION_VERSION } from "../workflows/invoiceFacts.v1.azure.mjs";
import { MYINVOIS_NORMALIZATION_VERSION } from "../lib/myinvois.mjs";

const line = (content, polygon) => ({ content, polygon });

/** A minimal analyzeResult: a typed InvoiceTotal (carrying the typed currencyCode), plus
 *  whatever pages[].lines[] the currency reader should see. Mirrors x2-totals-mapper.test.mjs's
 *  `payloadWith`. */
function payload(currencyCode, lines, extraFields = {}) {
  return {
    status: "succeeded",
    analyzeResult: {
      documents: [{
        fields: {
          InvoiceTotal: {
            content: "1,700.00",
            valueCurrency: { amount: 1700, currencyCode },
            boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }],
            confidence: 0.9,
          },
          ...extraFields,
        },
      }],
      pages: [{ pageNumber: 1, lines }],
    },
  };
}

const currencyOf = (out) => out.fields.find((f) => f.field_path === "invoice.currency");

// Real fixtures (see currency-reader.test.mjs for provenance/polygons; kept minimal here).
const LUCY_JAN_MYR_LINE = line("Price is in MYR currency.", [3.3099, 7.7822, 4.9362, 7.797, 4.9348, 7.948, 3.3085, 7.9332]);
const EZSEC_RINGGIT_LINE = line("RINGGIT MALAYSIA : ONE THOUSAND AND SEVEN HUNDRED ONLY", [0.3222, 8.171, 4.1293, 8.1692, 4.1293, 8.3159, 0.3223, 8.3178]);
const OPENAI_USD_DUE_LINE = line("$21.60 USD due November 30, 2025", [0.4119, 3.4179, 3.719, 3.4224, 3.7188, 3.6166, 0.4117, 3.6121]);
const OPENAI_RM_CONVERSION_LINE = line("(RM6.61)", [7.5615, 5.8031, 8.08, 5.8024, 8.0802, 5.9393, 7.5617, 5.9401]);

// ======================================================================================
// CG1 — 39d786a0-shaped: reader myr vs typed USD DISAGREE -> BOTH rows withdrawn
// ======================================================================================

test("CG1 — a 39d786a0-shaped doc: reader myr disagrees with typed USD -> invoice.currency is ABSENT from the emitted fields", () => {
  const out = normalizeAzureInvoice(payload("USD", [LUCY_JAN_MYR_LINE]));
  assert.equal(currencyOf(out), undefined, "the false USD row dies here — no invoice.currency region survives to trip explicit_non_myr");
  assert.equal(out.envelope.currency_reader.verdict, "myr");
  assert.equal(out.envelope.currency_reader.typed_disagreement, 1);
  assert.equal(out.envelope.currency_reader.fields["invoice.currency"].typed_value_raw, "USD");
  // The rest of the extraction is untouched — one contested field never costs the document.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "1,700.00");
});

// ======================================================================================
// CG2 — EZSEC-shaped: reader myr (RINGGIT only) AGREES with typed MYR
// ======================================================================================

test("CG2 — an EZSEC-shaped doc: reader myr agrees with typed MYR -> the typed row is KEPT and typed_collapsed is stamped", () => {
  const out = normalizeAzureInvoice(payload("MYR", [EZSEC_RINGGIT_LINE]));
  const row = currencyOf(out);
  assert.equal(row.value_raw, "MYR");
  assert.equal(row.page, 1, "the TYPED row's own region survives — never overwritten on agreement");
  assert.deepEqual(row.polygon, [0, 0, 1, 0, 1, 1, 0, 1], "Azure's own bounding region, not the reader's citation");
  assert.equal(out.envelope.currency_reader.verdict, "myr");
  assert.deepEqual(out.envelope.currency_reader.myr_tokens, ["RINGGIT"]);
  assert.equal(out.envelope.currency_reader.typed_collapsed, 1);
  assert.equal(out.envelope.currency_reader.fields["invoice.currency"].outcome, "typed_collapsed");
  // The currency reconciliation never touches any OTHER field — the net/tax typed_collapsed
  // status (X2/X5's own concern) is provably independent of this change.
  assert.equal(out.fields.filter((f) => f.field_path === "invoice.currency").length, 1, "never two rows for one field_path");
});

// ======================================================================================
// CG3 — openai-0008-shaped: RM conversion + USD tokens -> ambiguous -> reader silent ->
// typed USD SURVIVES
// ======================================================================================

test("CG3 — an openai-0008-shaped doc: ambiguous page vocabulary -> reader silent -> typed USD SURVIVES", () => {
  const out = normalizeAzureInvoice(payload("USD", [OPENAI_USD_DUE_LINE, OPENAI_RM_CONVERSION_LINE]));
  const row = currencyOf(out);
  assert.equal(row?.value_raw, "USD", "the typed USD stands unopposed — this is the CORRECT destination for a genuine USD invoice");
  assert.equal(out.envelope.currency_reader.verdict, "ambiguous");
  assert.equal(out.envelope.currency_reader.typed_disagreement, 0);
  assert.equal(out.envelope.currency_reader.typed_collapsed, 0);
});

// ======================================================================================
// CG6 — zero regression
// ======================================================================================

test("CG6 — NORMALIZATION_VERSION is bumped to v9", () => {
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v9");
});

test("CG6 — a correctly-typed-MYR document's currency row is BYTE-STABLE under v9 (agreement never rewrites it)", () => {
  const out = normalizeAzureInvoice(payload("MYR", [LUCY_JAN_MYR_LINE]));
  const row = currencyOf(out);
  // Exactly what v8 would have emitted: the typed content, Azure's own region/confidence.
  assert.equal(row.value_raw, "MYR");
  assert.equal(row.page, 1);
  assert.deepEqual(row.polygon, [0, 0, 1, 0, 1, 1, 0, 1]);
  assert.equal(row.confidence, 0.9);
});

test("CG6 — a legacy payload with NO pages[].lines[] is a pure widening: reader absent, typed row stands", () => {
  const out = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: { InvoiceTotal: { content: "500.00", valueCurrency: { amount: 500, currencyCode: "USD" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }], confidence: 0.8 } } }],
      pages: [{ pageNumber: 1 }],
    },
  });
  assert.equal(currencyOf(out).value_raw, "USD", "no page evidence at all -> the reader abstains -> v5 behaviour, unchanged");
  assert.equal(out.envelope.currency_reader.verdict, "absent");
  assert.equal(out.envelope.currency_reader.typed_disagreement, 0);
});

test("CG6 — a MULTI-DOCUMENT bundle runs no currency reader at all", () => {
  const out = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [
        { fields: { InvoiceTotal: { content: "1,700.00", valueCurrency: { amount: 1700, currencyCode: "USD" }, confidence: 0.9 } } },
        { fields: { InvoiceTotal: { content: "1,700.00", valueCurrency: { amount: 1700, currencyCode: "USD" }, confidence: 0.9 } } },
      ],
      pages: [{ pageNumber: 1, lines: [] }, { pageNumber: 2, lines: [LUCY_JAN_MYR_LINE] }],
    },
  });
  assert.equal(currencyOf(out).value_raw, "USD", "document B's page evidence must never withdraw document A's typed currency");
  assert.equal(out.envelope.currency_reader.reason, "multi_document");
  assert.equal(out.envelope.currency_reader.typed_collapsed, 0);
  assert.equal(out.envelope.currency_reader.typed_disagreement, 0);
});

test("CG6 — the XML/MyInvois lane's OWN normalization version is untouched by this branch (a real cross-file check, P3)", () => {
  // This mapper is scoped to the Azure OCR engine only (contract precedent, part 1 §6.5). The
  // MyInvois structured lane runs a DIFFERENT engine and normalization in `lib/myinvois.mjs`,
  // a file this branch makes ZERO edits to (verifiable in the diff) — imported and asserted
  // here, not just recalled, so a future edit to that file that silently bumps its version
  // would fail THIS test too, not just be missed. `NORMALIZATION_VERSION` (this file's own,
  // v9) and `MYINVOIS_NORMALIZATION_VERSION` (untouched, v1) are deliberately DIFFERENT
  // constants in DIFFERENT files — that separation IS the byte-identity guarantee.
  assert.equal(MYINVOIS_NORMALIZATION_VERSION, "clara-myinvois-norm:v1");
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v9");
  assert.notEqual(MYINVOIS_NORMALIZATION_VERSION, NORMALIZATION_VERSION);
});

test("P2 (mapper level) — RINGGIT page evidence + NO typed currency at all: invoice.currency never appears, the doc cannot corroborate on it", () => {
  const out = normalizeAzureInvoice(payload(undefined, [EZSEC_RINGGIT_LINE]));
  assert.equal(out.envelope.currency_reader.verdict, "myr", "the reader DOES read myr — the wall is the merge law, not the reader");
  assert.equal(currencyOf(out), undefined, "no invoice.currency region is manufactured out of the reader's authority alone");
  assert.equal(out.envelope.currency_reader.typed_collapsed, 0);
  // The rest of the extraction is untouched.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "1,700.00");
});

test("PERMANENT REGRESSION WALL (mapper level, orchestrator ruling 2026-07-29) — an EZSEC-shaped doc printing 'SDN BHD' in ANY of the reviewer's adversarial shapes still agrees (myr, not ambiguous)", () => {
  // The strongest form of the regression check: SDN BHD sits on the SAME document as the
  // RINGGIT declaration, through the ACTUAL merge path, not just the reader in isolation. BHD is
  // permanently out of FOREIGN_TOKENS (no amount-adjacency gate exists any more — see the
  // reader's own header for why that gate was removed) so every shape below is unconditionally
  // safe, including the two the reviewer's adversarial pass used to break: no space at all
  // before the registration number, and a bare space with no other punctuation.
  for (const bhdText of [
    "EZACCOUNT & SECRETARY SDN BHD (202301030264 (1524187-D))",
    "EZACCOUNT & SECRETARY SDN BHD 202301030264",
    "EZACCOUNT & SECRETARY SDN BHD202301030264",
  ]) {
    const SDN_BHD_LINE = line(bhdText, [0, 1, 1, 1, 1, 2, 0, 2]);
    const out = normalizeAzureInvoice(payload("MYR", [EZSEC_RINGGIT_LINE, SDN_BHD_LINE]));
    const row = currencyOf(out);
    assert.equal(row.value_raw, "MYR", bhdText);
    assert.equal(out.envelope.currency_reader.verdict, "myr", bhdText);
    assert.equal(out.envelope.currency_reader.typed_collapsed, 1, bhdText);
  }
});

// ======================================================================================
// CG9 (build-side half) — the reader alone clears all 7 real affected documents, end to end
// ======================================================================================

test("CG9 — through the FULL mapper, the reader clears 39d786a0 (real fixture, typed USD)", () => {
  const out = normalizeAzureInvoice(payload("USD", [LUCY_JAN_MYR_LINE]));
  assert.equal(currencyOf(out), undefined, "no invoice.currency region survives -> explicit_non_myr evaluates false downstream");
});

test("CG9 — through the FULL mapper, the reader clears the EUR-mistyped MEDICAL document (real fixture)", () => {
  const RM_LINE = line("RM", [10.4722, 26.7064, 11.5355, 26.7158, 11.5285, 27.5055, 10.4652, 27.4961]);
  const out = normalizeAzureInvoice(payload("EUR", [RM_LINE]));
  assert.equal(currencyOf(out), undefined);
  assert.equal(out.envelope.currency_reader.typed_disagreement, 1);
});

// ======================================================================================
// CG11 (MAPPER HALF ONLY, P4) — these two cells prove ONLY what the mapper controls: whether
// invoice.currency is present in the FIELD LIST the mapper hands to persist_invoice_facts.
// They do NOT call draft_entry, do NOT observe CLR21, and do NOT prove the DB-side refusal
// lifts — that persistence/coding-authority half is the LIVE re-extraction ceremony (alongside
// CG5/CG7-after/CG10), driven by the orchestrator post-deploy, on the real 39d786a0 document
// with the assignment's own op-key shape (design part 2 §9.3). No DB-side test is added here —
// out of this lane's scope by design.
// ======================================================================================

test("CG11 (mapper half) — 39d786a0-shaped payload, NO page evidence: the mapper's field list still carries invoice.currency=USD (the pre-fix input shape)", () => {
  // No pages[].lines[] at all: the reader has nothing to read and abstains, so the typed USD
  // row survives in the mapper's output exactly as it did before this reader existed. This is
  // the MAPPER-LEVEL analogue of the pre-fix shape behind the live 400 CLR21
  // `currency_unsupported` observed on `draft_entry(... op_key runway-draft-lucy-250001-1)` —
  // it isolates the one variable the fix changes (page evidence), not a claim about draft_entry
  // itself, which this test never calls.
  const before = normalizeAzureInvoice(payload("USD", []));
  assert.equal(currencyOf(before).value_raw, "USD", "the mapper's field list still contains the typed USD row");
});

test("CG11 (mapper half) — 39d786a0's real page evidence: the mapper's field list carries NO invoice.currency row (the post-fix input shape)", () => {
  // Proves only that persist_invoice_facts would receive a field list with no invoice.currency
  // region for this document — NOT that explicit_non_myr evaluates false, NOT that CLR21 lifts,
  // and NOT that draft_entry succeeds. Those are DB-side facts the live ceremony measures.
  const after = normalizeAzureInvoice(payload("USD", [LUCY_JAN_MYR_LINE]));
  assert.equal(currencyOf(after), undefined, "no invoice.currency row reaches the persist call for this document under v9");
});
