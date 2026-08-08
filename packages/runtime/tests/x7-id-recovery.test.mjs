// The invoice_id recovery module's MOVE CONTRACT — pinned rather than asserted in prose.
//
// The F6–F9 fix batch moved this machinery out of invoiceFacts.v1.azure.mjs (the repo's
// 500-line file limit, when X7's wiring landed). The first header claimed the move was
// "byte-for-byte"; a reviewer correctly called that inaccurate — it adds exports, injects
// `firstRegion`, and changed two signatures and their call site. The header now declares those
// deltas exactly, and this file is what keeps the declaration true.
//
// The one behavioural delta that mattered: with a REQUIRED `firstRegion`, a caller that omitted
// it THREW on a perfectly valid key-value hit. The parameter now defaults to an equivalent
// fallback — which is a second definition of the adapter's helper, and therefore a drift hazard
// admitted on purpose. It is converted into a pinned invariant here, the same technique X6 uses
// to pin `registrationKey` against `normalizeRegistration`.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { firstRegion } from "../workflows/invoiceFacts.v1.azure.mjs";
import { recoverInvoiceId, looksLikeInvoiceNumber, INVOICE_ID_LABEL, __defaultFirstRegionForTest as fallback }
  from "../lib/invoice-id-recovery.mjs";

/** Every region shape the Azure payload actually produces, including the degenerate ones. */
const REGION_SHAPES = [
  undefined,
  null,
  {},
  { boundingRegions: [] },
  { boundingRegions: null },
  { boundingRegions: [{ pageNumber: 3, polygon: [] }] },
  { boundingRegions: [{ pageNumber: 3 }] },
  { boundingRegions: [{ polygon: [1, 2, 3, 4, 5, 6, 7, 8] }] },
  { boundingRegions: [{ pageNumber: 2, polygon: [1, 2, 3, 4, 5, 6, 7, 8] }] },
  { boundingRegions: [{ pageNumber: "2", polygon: ["1", "2", "3", "4"] }] },
];

test("the fallback firstRegion is INDISTINGUISHABLE from the adapter's — the two cannot drift", () => {
  for (const shape of REGION_SHAPES) {
    assert.deepEqual(fallback(shape), firstRegion(shape), `region shape ${JSON.stringify(shape)}`);
  }
  // And it never fabricates geometry (W3 / finding 3): an absent or empty region is an EMPTY
  // polygon, which the DB's _invoice_fact_state refuses to corroborate.
  assert.deepEqual(fallback(undefined), { page: 1, polygon: [] });
  assert.deepEqual(fallback({ boundingRegions: [{ pageNumber: 3, polygon: [] }] }), { page: 3, polygon: [] });
});

test("recoverInvoiceId WITHOUT an injected firstRegion behaves as the pre-move code did", () => {
  // The declared delta that had teeth: omitting the parameter used to throw on a valid KV hit.
  const kv = {
    keyValuePairs: [{
      key: { content: "Invoice No" },
      value: { content: "RSINV-2506/01", boundingRegions: [{ pageNumber: 2, polygon: [1, 2, 3, 2, 3, 4, 1, 4] }] },
      confidence: 0.8,
    }],
  };
  const injected = recoverInvoiceId(kv, firstRegion);
  const omitted = recoverInvoiceId(kv);
  assert.deepEqual(omitted, injected, "the default must reproduce the injected behaviour exactly");
  assert.deepEqual(injected, { value: "RSINV-2506/01", page: 2, polygon: [1, 2, 3, 2, 3, 4, 1, 4], confidence: 0.8 });
});

test("the recovery order and gates are unchanged by the move: KV first, then the content scan", () => {
  const both = {
    keyValuePairs: [{ key: { content: "Invoice No" }, value: { content: "FROM-KV-001" }, confidence: 0.7 }],
    content: "Invoice No: FROM-CONTENT-002",
  };
  assert.equal(recoverInvoiceId(both).value, "FROM-KV-001", "the model's own structure wins");
  assert.equal(recoverInvoiceId({ content: "Invoice No: FROM-CONTENT-002" }).value, "FROM-CONTENT-002");
  // The next-line print shape, and the plausibility gate that keeps a total or a date out.
  assert.equal(recoverInvoiceId({ content: "Invoice No:\nINV2510/10" }).value, "INV2510/10");
  assert.equal(recoverInvoiceId({ content: "Invoice No: 1,350.00" }), null);
  assert.equal(recoverInvoiceId({ content: "Invoice No: 2025-10-14" }), null);
  assert.equal(recoverInvoiceId({}), null);
  // The exported gates are the same ones the adapter used.
  assert.equal(looksLikeInvoiceNumber("RSINV-2506/01"), true);
  assert.equal(looksLikeInvoiceNumber("RM 1,350.00"), false);
  assert.equal(INVOICE_ID_LABEL.test("Tax Invoice No."), true);
  assert.equal(INVOICE_ID_LABEL.test("Purchase Order No."), false, "PO labels stay excluded — the dup-bill key depends on it");
});
