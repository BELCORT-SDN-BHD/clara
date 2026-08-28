// GATE (b) — structural a11y scan of T6's new documents-half surfaces: the
// document-extract content (fixed-prop, documents-a11y.test.tsx's own
// pattern — never the self-fetching wrapper) and the extended DocumentAdmin/
// DocumentFilingsHistory sections (re-extraction, consent evidence,
// autodraft), each with its outcome banner ACTUALLY SHOWING — driven
// through the real dialog interaction + a mocked fetch (F1, independent
// review, fix-required: a prior pass claimed this in the header without a
// single test actually populating `reextractOutcome`/`consentOutcome`/
// `autodraftOutcomes`; the banners are new user-facing surface and earn
// their own scan, not just fixed-prop coverage of the surrounding sections).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { DocumentExtractContent, DocumentExtractPanel } from "./document-extract-panel";
import { DocumentAdmin } from "./document-admin";
import { DocumentFilingsHistory } from "./document-filings-history";
import type { DocumentExtractResult, DocumentRow, FilingRow } from "../../lib/documents/types";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** DocumentAdmin/DocumentFilingsHistory's own governed writers ride the
 *  BLESSED `sessionTokenAccessor` singleton directly, not a test-injected
 *  session — its `getAccessToken()` parks for up to 5s waiting for
 *  `configureSessionTokenSource` before resolving `null` (session-
 *  accessor.ts's own header). Without configuring it here, the mocked
 *  `fetch` below is never reached inside this file's settle budget and the
 *  door dialog never closes — close-a11y.test.tsx's own precedent for
 *  exercising a REAL confirm-click-through-a-door flow. */
function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

type Node = { tagName?: string; childNodes?: Node[] };

/** The open dialog's own content portals to `document.body`, OUTSIDE
 *  `h.container` (documents-governance-keyboard.test.tsx's own precedent,
 *  itself following close-keyboard.test.tsx's) — `h.find` alone cannot see
 *  the reason field or the confirm control while the dialog is open. */
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function body(): Node {
  return (globalThis as unknown as { document: { body: Node } }).document.body;
}

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

// F2 PANEL branch (independent review, mutation D — the reads.ts/types.ts
// test above pins the MODULE's null passthrough; it does not pin the PANEL's
// own null-branch rendering, which is where the original defect actually
// lived). Mounts the REAL self-fetching `DocumentExtractPanel` (not the pure
// `DocumentExtractContent`), opens it via its own toggle (a plain button in
// `h.container`, no portal involved), mocks `get_document_extract` to return
// the DB's own legitimate `null` (a document filed to a different client),
// and asserts the honest not-available copy actually renders — never a
// silent blank under an open toggle.
test("DocumentExtractPanel has zero violations and renders the honest not-available state when get_document_extract legitimately returns null", async () => {
  await withMockedFetch(
    async () => jsonResponse(null),
    async () => {
      const h = await renderComponent(App(ambient(createElement(DocumentExtractPanel, { documentId: "doc-1", clientId: "other-client" }))));
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const toggle = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^View extraction text$/) !== null);
        assert.ok(toggle, "the toggle must render as a real button, reachable without any portal");
        await h.fireEvent(toggle!, "click");
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /isn't available for this client/, "the panel must render the honest not-available state, never a silent blank");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// --- F1: the outcome banners, driven through a real dialog + a mocked door -----

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

test("DocumentAdmin has zero violations with the re-extraction outcome banner actually showing", async () => {
  await withMockedFetch(
    async () => jsonResponse({ task_id: "task-2", document_id: "doc-1", version_n: 2, status: "queued", reused: false, admission: "reextraction" }),
    async () => {
      const h = await renderComponent(
        App(ambient(createElement(DocumentAdmin, { document: DOCUMENT, busy: false, act: async (fn) => { await fn(); }, onCorrect: () => {} }))),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Request re-extraction$/) !== null);
        assert.ok(trigger, "the re-extraction trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
        assert.ok(reasonField, "the reason field must render");
        await h.act(() => { setFieldValue(reasonField as never, "engine misread the invoice total"); });
        const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Request re-extraction$/) !== null && n !== trigger);
        assert.ok(confirmButton, "the confirm control must render once enabled");
        // `h.fireEvent` dispatches only through `container`'s own delegated
        // listeners — the confirm button lives in the Dialog's OPEN portal
        // content (document.body), a separate delegation root it never
        // reaches (hookHarness.ts's `clickButton` header has the full
        // story). `clickButton` reads the node's own `onClick` prop
        // directly instead.
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(textOf(b as never), /Superseding a prior extraction/, "the outcome banner must actually be showing, with the real admission label");
        const violations = checkAccessibility(b as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        const bodyEl = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
      }
    },
  );
});

test("DocumentAdmin has zero violations with the consent-evidence outcome banner actually showing", async () => {
  await withMockedFetch(
    async () => jsonResponse({ document_id: "doc-1", document_kind: "consent_evidence", prior_kind: "other" }),
    async () => {
      const h = await renderComponent(
        App(ambient(createElement(DocumentAdmin, { document: DOCUMENT, busy: false, act: async (fn) => { await fn(); }, onCorrect: () => {} }))),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Classify as consent evidence$/) !== null);
        assert.ok(trigger, "the consent-evidence trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
        assert.ok(reasonField, "the reason field must render");
        await h.act(() => { setFieldValue(reasonField as never, "client's signed PDPA consent letter"); });
        const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Classify as consent evidence$/) !== null && n !== trigger);
        assert.ok(confirmButton, "the confirm control must render once enabled");
        // `h.fireEvent` dispatches only through `container`'s own delegated
        // listeners — the confirm button lives in the Dialog's OPEN portal
        // content (document.body), a separate delegation root it never
        // reaches (hookHarness.ts's `clickButton` header has the full
        // story). `clickButton` reads the node's own `onClick` prop
        // directly instead.
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(textOf(b as never), /Was: other/, "the outcome banner must actually be showing, with the real prior kind");
        const violations = checkAccessibility(b as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        const bodyEl = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
      }
    },
  );
});

test("DocumentAdmin has zero violations with the consent-evidence outcome banner showing a NULL prior kind honestly (never blank)", async () => {
  await withMockedFetch(
    async () => jsonResponse({ document_id: "doc-1", document_kind: "consent_evidence", prior_kind: null }),
    async () => {
      const h = await renderComponent(
        App(ambient(createElement(DocumentAdmin, { document: DOCUMENT, busy: false, act: async (fn) => { await fn(); }, onCorrect: () => {} }))),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Classify as consent evidence$/) !== null);
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(reasonField as never, "unclassified document, now consent evidence"); });
        const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Classify as consent evidence$/) !== null && n !== trigger);
        // `h.fireEvent` dispatches only through `container`'s own delegated
        // listeners — the confirm button lives in the Dialog's OPEN portal
        // content (document.body), a separate delegation root it never
        // reaches (hookHarness.ts's `clickButton` header has the full
        // story). `clickButton` reads the node's own `onClick` prop
        // directly instead.
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(textOf(b as never), /Was: unclassified/, "a NULL prior_kind must render the honest 'unclassified' label, never a blank");
        const violations = checkAccessibility(b as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        const bodyEl = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
      }
    },
  );
});

test("DocumentFilingsHistory has zero violations with the autodraft outcome banner actually showing", async () => {
  await withMockedFetch(
    async () => jsonResponse({ outcome: "admitted", task_id: "task-1" }),
    async () => {
      const h = await renderComponent(
        App(ambient(createElement(DocumentFilingsHistory, { filings: [FILING], busy: false, act: async (fn) => { await fn(); } }))),
      );
      const b = body();
      (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
      try {
        for (let i = 0; i < 2; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Request autodraft$/) !== null);
        assert.ok(trigger, "the autodraft trigger must render");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Request autodraft$/) !== null && n !== trigger);
        assert.ok(confirmButton, "the confirm control must render");
        // `h.fireEvent` dispatches only through `container`'s own delegated
        // listeners — the confirm button lives in the Dialog's OPEN portal
        // content (document.body), a separate delegation root it never
        // reaches (hookHarness.ts's `clickButton` header has the full
        // story). `clickButton` reads the node's own `onClick` prop
        // directly instead.
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(textOf(b as never), /Admitted/, "the outcome banner must actually be showing");
        const violations = checkAccessibility(b as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
        const bodyEl = b as unknown as { removeChild: (c: unknown) => void; childNodes?: unknown[] };
        if (bodyEl.childNodes?.includes(h.container)) bodyEl.removeChild(h.container);
      }
    },
  );
});
