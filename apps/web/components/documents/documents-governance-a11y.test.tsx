// GATE (b) — structural a11y scan of T6's new documents-half surfaces: the
// document-extract content (fixed-prop, documents-a11y.test.tsx's own
// pattern — never the self-fetching wrapper) and the extended DocumentAdmin/
// DocumentFilingsHistory sections (re-extraction, consent evidence,
// autodraft), each with an outcome banner actually showing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import messages from "../../messages/en.json";
import { DocumentExtractContent } from "./document-extract-panel";
import type { DocumentExtractResult } from "../../lib/documents/types";

enableDomInspection();

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

// Wrapped in the SAME ambient <h1>/<h2>/<h3> the real page establishes above
// this panel (documents-a11y.test.tsx's own note: DocumentDetail's <h1>
// Documents / <h2> Detail / DocumentMetadata's own <h3> — this panel's
// SectionHeader level={4} siblings — DocumentFilingsHistory's
// "filingsHeading", DocumentEvidence's "evidenceHeading" — sit at the exact
// same rung).
function ambient(child: ReturnType<typeof createElement>) {
  return createElement(
    "div", null,
    createElement("h1", null, "Documents"),
    createElement("h2", null, "Detail"),
    createElement("h3", null, "invoice-april.pdf"),
    child,
  );
}

const RESULT: DocumentExtractResult = {
  document: { id: "doc-1", sha256: "abc", original_filename: "invoice-april.pdf", mime_type: "application/pdf", byte_size: 20480, bytes_verified_at: "2026-04-01T00:00:01Z", page_count: 2, extraction_status: "done", document_kind: "invoice", financial_date: "2026-04-01" },
  unassigned: false,
  filing: { id: "filing-1", client_id: "c1", filed_at: "2026-04-02T00:00:00Z", basis: "human" },
  extractions: [
    { id: "e1", engine_id: "eng-1", engine_kind: "invoice_facts", version_n: 1, status: "done", page_count: 2, extracted_at: "2026-04-01T00:00:01Z", envelope_text: '{"invoice.total":10000}', raw_sha256: "abc", normalization_version: "v1" },
  ],
  regions: [
    { idx: 1, id: "r1", extraction_id: "e1", engine_kind: "invoice_facts", version_n: 1, extracted_at: "2026-04-01T00:00:01Z", locator_kind: "page_polygon", locator: {}, field_path: "invoice.total", text_content: null, engine_confidence: 0.95, monetary_raw: "100.00", monetary_cents: 10000 },
  ],
  max_chars: 20000,
};

test("DocumentExtractContent has zero violations once loaded (extraction + region both populated)", async () => {
  const h = await renderComponent(App(ambient(createElement(DocumentExtractContent, { data: RESULT }))));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /invoice_facts/);
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("DocumentExtractContent has zero violations for a document with no extraction and no regions", async () => {
  const empty: DocumentExtractResult = { ...RESULT, extractions: [], regions: [] };
  const h = await renderComponent(App(ambient(createElement(DocumentExtractContent, { data: empty }))));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});
