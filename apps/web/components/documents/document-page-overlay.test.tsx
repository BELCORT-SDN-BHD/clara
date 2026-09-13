// THE OVERLAY'S OWN BYTE READ — the second read of the same document on the same panel, and the
// one that had no cells of its own.
//
// `document-source-actions.test.tsx` measures the preview and download controls: their client
// scope, their state ladder, their Retry gate. The page overlay beside them fetches the SAME
// document's bytes through the SAME door, with its own call site, and until this file existed
// nothing measured either half of it:
//
//   · THE SCOPE. `client: clientId` in `document-page-overlay.tsx` was deletable with the whole
//     web unit set staying green (measured: 85/85 across the eight #620 files under the revert).
//     Without it this one read is admitted on firm membership alone while the two controls beside
//     it require an active filing to THIS client — one document, one page, two different answers
//     to "may I read this", which is the kind of inconsistency a permission review has to chase
//     rather than read.
//   · THE LADDER. A refused read printed `overlayPageFailed` with the LIBRARY's own message
//     ("The page couldn't be loaded: document bytes failed") and offered nothing — untranslated,
//     undifferentiated, and with no Retry for the states that recover on their own. The controls
//     eighteen pixels away rendered the honest sentence and a Retry for the identical response.
//
// WHAT IS DELIBERATELY NOT HERE: the geometry. Polygon scaling, page-box derivation and the
// skip-rather-than-guess rule are `lib/documents/region-geometry.test.ts`'s and the browser walk's
// (a canvas painted by pdf.js exists in neither this environment nor a unit one). These cells are
// about the DOOR read this panel performs and what it renders for each answer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentPageOverlayContent } from "./document-page-overlay";
import messages from "../../messages/en.json";
import type { DocumentExtractResult } from "../../lib/documents/types";

// The panel mounts @base-ui/react-backed primitives, whose floating-ui internals feature-detect
// against `window.Element`/`Node` (test/domInspect.ts).
enableDomInspection();

const CLIENT = "c1111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "d1111111-1111-4111-8111-111111111111";

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children });
}

/** One extraction with a real page box and one drawable region — enough that the page pane is the
 *  arm under test rather than the "nothing was extracted" note. */
const EXTRACT = {
  document: {
    id: DOCUMENT_ID, sha256: "a".repeat(64), original_filename: "invoice-april.pdf",
    mime_type: "application/pdf", byte_size: 20480, bytes_verified_at: "2026-04-01T00:00:01Z",
    page_count: 1, extraction_status: "done", document_kind: "invoice", financial_date: "2026-04-01",
  },
  unassigned: false,
  filing: null,
  extractions: [{
    id: "ext-1", engine_id: "azure-di", engine_kind: "ocr", version_n: 1, status: "done",
    page_count: 1, extracted_at: "2026-04-01T00:00:00Z",
    envelope_text: JSON.stringify({ pages: [{ page_number: 1, width: 8.5, height: 11, unit: "inch" }] }),
    raw_sha256: null, normalization_version: null,
  }],
  regions: [{
    idx: 0, id: "r-total", extraction_id: "ext-1", engine_kind: "ocr", version_n: 1,
    extracted_at: "2026-04-01T00:00:00Z", locator_kind: "page_polygon",
    locator: { page: 1, polygon: [1, 1, 2, 1, 2, 2, 1, 2] },
    field_path: "invoice.total", text_content: "RM 1.00", engine_confidence: 0.9,
    monetary_raw: "1.00", monetary_cents: 100,
  }],
  max_chars: 20000,
} satisfies DocumentExtractResult;

/** The wire, the object-URL pair and the session, installed for one cell and always removed. */
async function withEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  globalThis.fetch = impl;
  URL.createObjectURL = () => "blob:fake-url";
  URL.revokeObjectURL = () => {};
  configureSessionTokenSource(async () => "tok");
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    resetSessionTokenSource();
  }
}

type StubNode = { tagName?: string; childNodes?: StubNode[]; getAttribute?: (n: string) => string | null };

function findButton(h: { find: (p: (n: StubNode) => boolean) => unknown }, label: string): StubNode | null {
  return h.find((n) => n.tagName === "BUTTON" && textOf(n as never).includes(label)) as StubNode | null;
}

/** The byte door's OWN refusal shape — `{error, reason}` and nothing else, exactly what the route
 *  answers (it never leaks SQL or vendor body text), so a cell cannot pass on a body production
 *  could not produce. */
function refusalFetch(status: number, body: Record<string, string>): typeof fetch {
  return (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as typeof fetch;
}

async function mount(): Promise<Awaited<ReturnType<typeof renderComponent>>> {
  const h = await renderComponent(App(createElement(DocumentPageOverlayContent, {
    data: EXTRACT, documentId: DOCUMENT_ID, clientId: CLIENT, mimeType: "application/pdf",
  })));
  for (let i = 0; i < 8; i++) await h.settle();
  return h;
}

test("THE OVERLAY'S BYTE READ CARRIES THE PAGE'S CLIENT SCOPE — the same scope the two controls beside it send", async () => {
  const urls: string[] = [];
  await withEnv(async (url) => {
    urls.push(String(url));
    return new Response(new Blob(["%PDF-1.4"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }, async () => {
    const h = await mount();
    try {
      assert.ok(urls.length >= 1, "the overlay must actually read the document's bytes");
      assert.match(
        urls[0]!, new RegExp(`^/api/runtime/documents/${DOCUMENT_ID}/bytes\\?client=${CLIENT}$`),
        "the scope must travel: without it the door admits this read on firm membership alone",
      );
      // A PREVIEW, and the door records the word: `disposition` is omitted because `inline` is the
      // route's own default and maps to `p_purpose='preview'` in `clara._audit`.
      assert.doesNotMatch(urls[0]!, /disposition=/, "the overlay is a preview, and writing a disposition would change the audited purpose");
      // SAME-ORIGIN, never a storage host — the browser holds no storage credential (PIN-DELTA-4).
      assert.ok(urls[0]!.startsWith("/api/runtime/"), "the read goes through this app's own proxy");
    } finally { await h.unmount(); }
  });
});

test("A REFUSED PAGE READ RENDERS THE LADDER, not the library's English — and Retry where a second attempt can answer", async () => {
  // THE IDENTICAL RESPONSE THE CONTROLS BESIDE THIS PANEL ALREADY HANDLE: the byte route's real
  // 502 `{error:"storage_error", reason:"unavailable"}`. Measured before the fix, for this very
  // mock: the overlay rendered "The page couldn't be loaded: document bytes failed" — the caught
  // error's own untranslated message — with no recovery control, while DocumentSourceActions
  // rendered "The document store couldn't be reached, so the file wasn't sent." with a Retry.
  // One document, one panel, one answer from the door, two different things said about it.
  let calls = 0;
  await withEnv(async (url) => {
    calls += 1;
    // First read refuses; a Retry that actually re-reaches the wire gets the bytes. Without the
    // second arm a cell could not tell a real second read from a repaint of the first outcome.
    if (calls === 1) return refusalFetch(502, { error: "storage_error", reason: "unavailable" })(url);
    return new Response(new Blob(["%PDF-1.4"]), { status: 200, headers: { "content-type": "application/pdf" } });
  }, async () => {
    const h = await mount();
    try {
      assert.match(
        h.text(), /The document store couldn't be reached, so the file wasn't sent\./,
        "the overlay must render the ladder's own sentence for this rung — the SAME one the controls beside it render",
      );
      assert.doesNotMatch(h.text(), /The page couldn't be loaded/, "`overlayPageFailed` belongs to pdf.js's failures, not to the door's");
      assert.doesNotMatch(h.text(), /document bytes failed/, "the library's internal message must never reach a reader");
      // …and the geometry note must not answer a question nobody got to ask.
      assert.doesNotMatch(h.text(), /Nothing was extracted from page/);

      const retry = findButton(h, "Retry");
      assert.ok(retry, "storage_unavailable recovers on its own — withholding Retry strands the reader on a failure that fixes itself");

      await clickButton(retry as never);
      for (let i = 0; i < 10; i++) await h.settle();
      assert.equal(calls, 2, "Retry must issue a SECOND read, not repaint the first one's outcome");
      assert.doesNotMatch(h.text(), /The document store couldn't be reached/, "a recovered read must clear the standing failure");
    } finally { await h.unmount(); }
  });
});

test("…and NO Retry on a rung a second attempt answers identically", async () => {
  // THE OTHER DIRECTION, which is the sharper half: a Retry beside "the stored bytes no longer
  // match the record Clara holds" is a control that cannot work — the next read returns the same
  // wrong bytes. The gate is `RETRYABLE_DOCUMENT_SOURCE_STATES` in bytes.ts, named once for both
  // faces rather than re-decided here.
  await withEnv(refusalFetch(502, { error: "checksum_mismatch" }), async () => {
    const h = await mount();
    try {
      assert.match(h.text(), /no longer matches the record Clara holds/);
      assert.equal(findButton(h, "Retry"), null, "integrity answers identically on a second attempt");
    } finally { await h.unmount(); }
  });
});
