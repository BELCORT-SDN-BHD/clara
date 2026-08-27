// GATE (b) — structural a11y scan of the documents workbench (owner ruling
// Q7). See test/domInspect.ts's header for why this rides a hand-written
// rule engine (test/a11yRules.ts) rather than real axe-core, and what that
// substitution does and doesn't cover.
//
// Every component here is mounted with FIXED fixture props (the same
// pattern components/close/close-components.test.tsx and
// components/reports/reports-components.test.tsx already use) — none of
// these are self-fetching, so no fetch mock is needed; `act` callbacks are
// no-ops that never call their `fn` argument (a real door call is out of
// scope for a structural a11y scan — lib/documents/doors.test.ts already
// proves those wire calls).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility, type A11yViolation } from "../../test/a11yRules";
import messages from "../../messages/en.json";
import { FiledDocumentList } from "./filed-document-list";
import { OpenCandidateList } from "./open-candidate-list";
import { UploadPanel } from "./upload-panel";
import { DocumentMetadata } from "./document-metadata";
import { DocumentEvidence } from "./document-evidence";
import { DocumentEntries } from "./document-entries";
import { DocumentFilingsHistory } from "./document-filings-history";
import { DocumentAdmin } from "./document-admin";
import type { DocumentRow, FilingRow, CandidateRow, RegionRow, ProcessingTaskRow, JournalEntryRow } from "../../lib/documents/types";

enableDomInspection();

const noopAct = async (fn: () => Promise<void>) => {
  void fn; // deliberately never called — a real door call is out of scope for a structural a11y scan
};

const DOCUMENT: DocumentRow = {
  id: "doc-1", sha256: "abc123", original_filename: "invoice-april.pdf", mime_type: "application/pdf",
  byte_size: 20480, storage_path: "docs/doc-1.pdf", uploaded_by: "user-1", created_at: "2026-04-01T00:00:00Z",
  bytes_verified_at: "2026-04-01T00:00:01Z", page_count: 2, extraction_status: "done",
  document_kind: "invoice", financial_date: "2026-04-01", retention_state: "unanchored", retain_until: null,
  retention_basis: null, legal_hold: false, legal_hold_reason: null,
};

const FILING: FilingRow = {
  id: "filing-1", document_id: "doc-1", client_id: "client-1", filed_at: "2026-04-02T00:00:00Z",
  filed_by: "user-1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "rev-1",
};

const CANDIDATE: CandidateRow = {
  id: "cand-1", attempt_id: "att-1", client_id: "client-1", rank: 1, rule_kind: "name_exact",
  disposition: "open", created_at: "2026-04-01T00:00:00Z",
};

const REGION: RegionRow = {
  id: "region-1", extraction_id: "ext-1", locator_kind: "page_polygon", field_path: "total",
  text_content: "RM 100.00", engine_confidence: 0.95, monetary_raw: "100.00", monetary_cents: 10000,
};

const TASK: ProcessingTaskRow = {
  id: "task-1", document_id: "doc-1", lane: "ocr" as ProcessingTaskRow["lane"], status: "done" as ProcessingTaskRow["status"],
  version_n: 1, attempt_count: 1, error_code: null, created_at: "2026-04-01T00:00:00Z",
  started_at: "2026-04-01T00:00:00Z", finished_at: "2026-04-01T00:00:02Z", updated_at: "2026-04-01T00:00:02Z",
};

const ENTRY: JournalEntryRow = {
  id: "je-1", client_id: "client-1", status: "approved", posting_date: "2026-04-01", memo: "April invoice",
  origin: "document", document_id: "doc-1", is_opening_balance: false, tax_affecting: true,
  approved_at: "2026-04-02T00:00:00Z", reversal_of: null, reversed_by: null, created_at: "2026-04-01T00:00:00Z",
};

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

async function scan(el: ReturnType<typeof createElement>): Promise<A11yViolation[]> {
  const h = await renderComponent(App(el));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    return checkAccessibility(h.container as never);
  } finally {
    await h.unmount();
  }
}

test("documents workbench: FiledDocumentList has zero violations (filed table, one row)", async () => {
  const violations = await scan(
    createElement(FiledDocumentList, { entries: [{ filing: FILING, document: DOCUMENT }], selectedId: null, onSelect: () => {} }),
  );
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

test("documents workbench: OpenCandidateList has zero violations (one open candidate)", async () => {
  const violations = await scan(
    createElement(OpenCandidateList, {
      entries: [{ candidate: CANDIDATE, document: DOCUMENT }],
      busy: false, err: null, clr: null, act: noopAct,
    }),
  );
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

test("documents workbench: UploadPanel has zero violations", async () => {
  const violations = await scan(createElement(UploadPanel, { clientId: "client-1", onFiled: () => {} }));
  assert.deepEqual(violations, [], JSON.stringify(violations));
});

test("documents workbench: DocumentMetadata + DocumentEvidence + DocumentEntries + DocumentFilingsHistory + DocumentAdmin together have zero violations", async () => {
  // Wrapped in the SAME <h1> the real page (documents-workbench.tsx) renders
  // above these — DocumentMetadata's own <h2> is a valid section heading
  // under that page h1 in production; testing it standalone without that
  // ambient h1 would flag a heading-order violation that is an artifact of
  // this test's own composition, not a real defect in any of these
  // components (own note found running this scan the first time).
  //
  // P3 finale (fold-seam truing): a SECOND ambient heading is needed too —
  // <h2>Detail</h2>, matching documents-workbench.tsx's own <aside> (its
  // SectionHeader level={2} "detailHeading", rendered immediately before
  // DocumentDetail, which is what actually composes these five components
  // together). Without it, DocumentMetadata's own SectionHeader level={3}
  // (a real, correct h3 one rung below its real aside-level h2 ancestor)
  // reads as an h1 -> h3 skip in this fixture alone — the polish moved
  // DocumentMetadata's heading onto the shared SectionHeader component
  // (previously unstyled/non-semantic text), which is a real improvement;
  // this fixture's missing ambient h2 is what needed truing, not the
  // component's level={3}.
  const violations = await scan(
    createElement(
      "div",
      null,
      createElement("h1", null, "Documents"),
      createElement("h2", null, "Detail"),
      createElement(DocumentMetadata, { document: DOCUMENT, tasks: [TASK] }),
      createElement(DocumentEvidence, { regions: [REGION] }),
      createElement(DocumentEntries, { entries: [ENTRY] }),
      createElement(DocumentFilingsHistory, { filings: [FILING], busy: false, act: noopAct }),
      createElement(DocumentAdmin, { document: DOCUMENT, busy: false, act: noopAct, onCorrect: () => {} }),
    ),
  );
  assert.deepEqual(violations, [], JSON.stringify(violations));
});
