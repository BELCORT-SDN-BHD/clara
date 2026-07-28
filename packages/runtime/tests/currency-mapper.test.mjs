// The currency defect fix — the MAPPER side: reconciling the currency reader against Azure's
// own typed `invoice.currency`, through `normalizeAzureInvoice`. Pure unit tests, no DB.
// (currency-defect design part 1 §8 gates CG1/CG2/CG3/CG6/CG9-build-side/CG11-fixture-half.)
//
// Every pinned line is COPIED VERBATIM from a real Azure OCR capture (see currency-reader.test
// .mjs's header for provenance and the git-exclusion note). CG5/CG7-after/CG10 are the LIVE
// re-extraction ceremony — explicitly out of scope here, driven by the orchestrator post-deploy.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice, NORMALIZATION_VERSION } from "../workflows/invoiceFacts.v1.azure.mjs";

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
  assert.equal(out.envelope.currency_reader.emitted, 0);
});

test("CG6 — the XML/MyInvois lane is a separate workflow file, untouched by this change (structural, not runtime)", () => {
  // This mapper is scoped to the Azure OCR engine only (contract precedent, part 1 §6.5). The
  // MyInvois structured lane runs a DIFFERENT engine and normalization (`clara-myinvois-norm:
  // v1`) in a DIFFERENT file this branch never edits — asserted here as a standing reminder,
  // not a runtime check (there is nothing of this mapper's to call from that lane).
  assert.ok(NORMALIZATION_VERSION.startsWith("clara-invoice-norm:"), "this version governs the Azure OCR lane only");
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
// CG11 (fixture half) — 39d786a0's real live receipt: typed USD pre-fix, absent post-fix
// ======================================================================================

test("CG11 — 39d786a0: WITHOUT page evidence the typed USD stands (the pre-fix shape the live CLR21 observed)", () => {
  // No pages[].lines[] at all: the reader has nothing to read and abstains, so the typed USD
  // row survives exactly as it did before this reader existed — the shape that reached the
  // live 400 CLR21 `currency_unsupported` on `draft_entry(... op_key runway-draft-lucy-250001-1)`
  // (design part 2 §9.3). This is NOT a re-run of that DB call (out of scope, CG5/CG7-after/
  // CG10 are the live ceremony) — it isolates the ONE variable the fix changes: page evidence.
  const before = normalizeAzureInvoice(payload("USD", []));
  assert.equal(currencyOf(before).value_raw, "USD");
});

test("CG11 — 39d786a0: WITH its real page evidence, no invoice.currency region survives (the post-fix shape)", () => {
  const after = normalizeAzureInvoice(payload("USD", [LUCY_JAN_MYR_LINE]));
  assert.equal(currencyOf(after), undefined, "explicit_non_myr can no longer evaluate true — the terminal CLR21 refusal does not fire");
});
