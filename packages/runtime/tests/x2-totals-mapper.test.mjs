// X2 — the MAPPER side: reconciling the totals reader against Azure's own typed fields, and
// proving the reader is a pure widening of v5. Pure unit tests, no DB.
//
// Every cell here exists because of a DB failure mode, not a style preference: 0016 (widened
// by 0022) forfeits the WHOLE extraction when one field_path carries two differing values, or
// when a monetary value is present but unparseable. Losing the new field would be a nuisance;
// losing the extraction destroys the working 29/29 `invoice.total` capture with it.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { normalizeAzureInvoice, NORMALIZATION_VERSION } from "../workflows/invoiceFacts.v1.azure.mjs";
import { line, byPath, BRIGHTPATH } from "./x2-totals-testkit.mjs";

/** A full analyzeResult carrying typed fields AND layout lines. */
function payloadWith(typedFields, lines, pageNumber = 2) {
  return {
    status: "succeeded",
    analyzeResult: { documents: [{ fields: typedFields }], pages: [{ pageNumber, lines }] },
  };
}

const TYPED_TOTAL = {
  content: "435,560.00",
  valueCurrency: { amount: 435560, currencyCode: "MYR" },
  boundingRegions: [{ pageNumber: 2, polygon: [7.1, 8.79, 7.7, 8.79, 7.7, 8.92, 7.1, 8.92] }],
  confidence: 0.656,
};

/** The measured tax row with its dash actually captured (the real page lost the glyph). */
const TAX_DASH_ROW = [
  line("Service Tax (6%)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
  line("-", [7.105, 8.2704, 7.2038, 8.2739, 7.2031, 8.3954, 7.1043, 8.3921]),
];

test("typed and reader agreeing on a figure yields ONE emission (the typed one)", () => {
  // Measured hazard: Azure typed SubTotal 435,560.40 on a fresh call to the very document
  // where the production extraction had none. The collision is real and nondeterministic.
  const out = normalizeAzureInvoice(
    payloadWith(
      {
        InvoiceTotal: TYPED_TOTAL,
        SubTotal: { content: "435,560.40", boundingRegions: [{ pageNumber: 2, polygon: [7.105, 8.27, 7.7, 8.27, 7.7, 8.4, 7.105, 8.4] }], confidence: 0.839 },
      },
      BRIGHTPATH,
    ),
  );
  const nets = out.fields.filter((f) => f.field_path === "invoice.total_excl_tax");
  assert.equal(nets.length, 1, "duplicate distinct facts forfeit the extraction — never emit two");
  assert.equal(nets[0].confidence, 0.839, "the TYPED row survives: it carries Azure's own region + score");
  assert.equal(out.envelope.totals_reader.typed_collapsed, 1);
  assert.equal(out.envelope.totals_reader.typed_disagreement, 0);
  // The reader still contributes the field Azure never typed.
  // BRIGHTPATH's rounding is refused: its face prints "- 0.40" with the minus in its own
  // column and OCR captured no minus anywhere, so the sign is unrecoverable.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.rounding"), undefined);
  assert.equal(out.envelope.totals_reader.sign_unknown, 1);
});

test("typed and reader DISAGREEING emits neither, and says so", () => {
  const out = normalizeAzureInvoice(
    payloadWith(
      { InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "435,999.99", confidence: 0.84 } },
      BRIGHTPATH,
    ),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.total_excl_tax"), false, "the typed row is withdrawn too");
  assert.equal(out.envelope.totals_reader.typed_disagreement, 1);
  // invoice.total is untouched — a disagreement on one field never costs the extraction.
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "435,560.00");
});

test("a typed field with a region but NO value is filled by the reader, not duplicated", () => {
  const out = normalizeAzureInvoice(
    payloadWith(
      { InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "", boundingRegions: [{ pageNumber: 2, polygon: [] }], confidence: 0.3 } },
      BRIGHTPATH,
    ),
  );
  const nets = out.fields.filter((f) => f.field_path === "invoice.total_excl_tax");
  assert.equal(nets.length, 1);
  assert.equal(nets[0].value_raw, "435,560.40", "an empty typed hit is a hole, not a disagreement");
  assert.equal(out.envelope.totals_reader.typed_recovered, 1);
});

// ======================================================================================
// CELL 6 — the mapper: a widening, not a change
// ======================================================================================

test("the mapper merges reader emissions and folds the receipt into the envelope at v6", () => {
  const out = normalizeAzureInvoice(payloadWith({ InvoiceTotal: TYPED_TOTAL }, BRIGHTPATH));
  const got = byPath(out.fields);
  assert.equal(got["invoice.total"].value_raw, "435,560.00", "the typed total is untouched");
  assert.equal(got["invoice.currency"].value_raw, "MYR");
  assert.equal(got["invoice.total_excl_tax"].value_raw, "435,560.40", "the reader supplies what Azure never typed");
  assert.equal(got["invoice.rounding"], undefined, "the rounding sign was never OCR'd — refused, not assumed");
  assert.equal(got["invoice.tax_total"], undefined);
  assert.equal(out.normalizationVersion, "clara-invoice-norm:v7");
  assert.equal(NORMALIZATION_VERSION, "clara-invoice-norm:v7");
  assert.equal(out.envelope.totals_reader.emitted, 1);
  assert.equal(out.envelope.totals_reader.sst_rate, 8);
  assert.equal(out.pagesUsed, 1, "pagesUsed still counts pages, not lines");
});

test("a payload with NO pages[].lines[] behaves exactly as v5 plus an all-absent receipt", () => {
  // Every pre-X2 fixture and every non-layout engine result has this shape. The reader must
  // be a PURE WIDENING: same fields, same order, same geometry, no throw.
  const legacy = {
    status: "succeeded",
    analyzeResult: {
      documents: [{ fields: {
        InvoiceTotal: { content: "435,560.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }], confidence: 0.98 },
        InvoiceId: { content: "BINV202510-018", confidence: 0.9 },
        SubTotal: { content: "410,000.00", confidence: 0.9 },
        TotalTax: { content: "25,560.00", confidence: 0.9 },
      } }],
      pages: [{ pageNumber: 1 }],
    },
  };
  const out = normalizeAzureInvoice(legacy);
  assert.deepEqual(
    out.fields.map((f) => [f.field_path, f.value_raw]),
    [
      ["invoice.total", "435,560.00"],
      ["invoice.invoice_id", "BINV202510-018"],
      ["invoice.total_excl_tax", "410,000.00"],
      ["invoice.tax_total", "25,560.00"],
      ["invoice.currency", "MYR"],
    ],
    "typed vocabulary, values and ORDER are byte-for-byte what v5 produced",
  );
  const receipt = out.envelope.totals_reader;
  assert.deepEqual(
    { matched: receipt.matched, absent: receipt.absent, ambiguous: receipt.ambiguous, unparseable: receipt.unparseable, emitted: receipt.emitted },
    { matched: 0, absent: 0, ambiguous: 0, unparseable: 0, emitted: 0 },
  );
  assert.deepEqual(receipt.fields, {});
  assert.equal(out.pagesUsed, 1);
});

test("the reader never touches the corroboration-ineligibility envelope", () => {
  const credit = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [{ docType: "invoice.creditNote", fields: { InvoiceTotal: TYPED_TOTAL } }],
      pages: [{ pageNumber: 2, lines: BRIGHTPATH }],
    },
  });
  assert.equal(credit.envelope.corroboration_ineligible, "credit_note");
  assert.equal(credit.envelope.totals_reader.emitted, 1, "facts are still captured; the DB decides eligibility");
});

// ======================================================================================
// CELL 7 — the adversarial-review regressions
// ======================================================================================

test("a printed DASH withdraws a typed JUNK value that would forfeit the extraction", () => {
  // Typed `TotalTax="N/A"` normalizes to NULL at the DB, and 0022's present-but-malformed
  // check then refuses the WHOLE persist — losing the good invoice.total with it. The reader
  // sees the document print a dash there, so the typed row is withdrawn and the rest survives.
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, TotalTax: { content: "N/A", confidence: 0.4 } }, TAX_DASH_ROW),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.tax_total"), false);
  assert.equal(out.envelope.totals_reader.typed_vs_dash, 1);
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "435,560.00", "the good total survives");
});

test("a printed DASH withdraws a typed FIGURE the document contradicts", () => {
  // Typed 5.66 against a face that prints a dash. Persisting it hands a supplier entry an SST
  // leg that ties to a number the document does not state — the ratified law is that a
  // disagreement emits neither, and a dash is a reading like any other.
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, TotalTax: { content: "5.66", confidence: 0.9 } }, TAX_DASH_ROW),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.tax_total"), false);
  assert.equal(out.envelope.totals_reader.typed_vs_dash, 1);
});

test("an AMBIGUOUS or UNPARSEABLE reader outcome leaves the typed row alone (v5 behaviour)", () => {
  // Those are the reader failing to read, not the document stating something — so they carry
  // no authority to withdraw a typed value. Two labels, two different figures => ambiguous.
  const conflicting = [
    line("Service Tax (6%)", [5.0, 8.25, 6.0, 8.25, 6.0, 8.4, 5.0, 8.4]),
    line("5.66", [6.5, 8.26, 6.9, 8.26, 6.9, 8.39, 6.5, 8.39]),
    line("Service Tax (6%)", [5.0, 9.25, 6.0, 9.25, 6.0, 9.4, 5.0, 9.4]),
    line("9.99", [6.5, 9.26, 6.9, 9.26, 6.9, 9.39, 6.5, 9.39]),
  ];
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, TotalTax: { content: "5.66", confidence: 0.9 } }, conflicting),
  );
  assert.equal(out.fields.find((f) => f.field_path === "invoice.tax_total").value_raw, "5.66", "the typed row stands");
  assert.equal(out.envelope.totals_reader.ambiguous, 1);
  assert.equal(out.envelope.totals_reader.typed_vs_dash, 0);
});

test("a MULTI-DOCUMENT result runs no reader at all", () => {
  // Typed fields come only from documents[0] while pages span the whole scan, so a label on
  // document B's page would be filed as a component of document A — two bills fused into one
  // fact set. corroboration_ineligible blocks Tier A but does not stop the region persisting
  // or being shown to a human coder.
  const out = normalizeAzureInvoice({
    status: "succeeded",
    analyzeResult: {
      documents: [
        { fields: { InvoiceTotal: { content: "100.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 0, 1, 1, 0, 1] }], confidence: 0.9 } } },
        { fields: { InvoiceTotal: { content: "999.99", valueCurrency: { currencyCode: "MYR" }, confidence: 0.9 } } },
      ],
      pages: [{ pageNumber: 1, lines: [] }, { pageNumber: 2, lines: BRIGHTPATH }],
    },
  });
  assert.equal(out.fields.some((f) => f.field_path === "invoice.total_excl_tax"), false, "no cross-document facts");
  assert.equal(out.envelope.corroboration_ineligible, "multi_document");
  assert.equal(out.envelope.totals_reader.reason, "multi_document", "and the receipt says why it read nothing");
  assert.equal(out.envelope.totals_reader.emitted, 0);
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "100.00", "typed stays v5");
});

test("a typed value that is blank to JS but PRESENT to the DB is withdrawn by a dash", () => {
  // `btrim` strips spaces, not tabs, so typed "\t" survives it, normalizes to NULL cents and
  // trips 0022's present-but-malformed refusal — forfeiting the whole extraction. JS `trim()`
  // calls it blank, which would have left it standing.
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, TotalTax: { content: "\t", confidence: 0.5 } }, TAX_DASH_ROW),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.tax_total"), false);
  assert.equal(out.envelope.totals_reader.typed_vs_dash, 1);
  assert.equal(out.fields.find((f) => f.field_path === "invoice.total").value_raw, "435,560.00", "the good total survives");
});

test("a typed value carrying a Unicode space never collapses against a clean reader value", () => {
  // Both parse to the same cents under a Unicode-aware trim, so the typed row would have been
  // KEPT — with bytes PostgreSQL normalizes to NULL, forfeiting the persist.
  const rows = [
    line("Sub Total (Excluding Tax)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
    line("435,560.40", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
  ];
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "\uFEFF435,560.40", confidence: 0.84 } }, rows),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.total_excl_tax"), false, "neither survives");
  assert.equal(out.envelope.totals_reader.typed_collapsed, 0);
  assert.equal(out.envelope.totals_reader.typed_disagreement, 1);
});

test("two typed/reader readings a SEN apart are a disagreement, not a collapse", () => {
  const rows = [
    line("Sub Total (Excluding Tax)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
    line("90,071,992,547,409.91", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
  ];
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "90,071,992,547,409.90", confidence: 0.84 } }, rows),
  );
  assert.equal(out.fields.some((f) => f.field_path === "invoice.total_excl_tax"), false);
  assert.equal(out.envelope.totals_reader.typed_disagreement, 1);
  assert.equal(out.envelope.totals_reader.typed_collapsed, 0);
});

test("a safe-range agreement still collapses to one emission", () => {
  const rows = [
    line("Sub Total (Excluding Tax)", [5.3297, 8.257, 6.8238, 8.2669, 6.8229, 8.3988, 5.3288, 8.389]),
    line("435,560.40", [7.105, 8.2704, 7.7038, 8.2739, 7.7031, 8.3954, 7.1043, 8.3921]),
  ];
  const out = normalizeAzureInvoice(
    payloadWith({ InvoiceTotal: TYPED_TOTAL, SubTotal: { content: "RM 435,560.40", confidence: 0.84 } }, rows),
  );
  const nets = out.fields.filter((f) => f.field_path === "invoice.total_excl_tax");
  assert.equal(nets.length, 1, "agreement on cents, not on text");
  assert.equal(nets[0].value_raw, "RM 435,560.40", "the typed row survives");
  assert.equal(out.envelope.totals_reader.typed_collapsed, 1);
});
