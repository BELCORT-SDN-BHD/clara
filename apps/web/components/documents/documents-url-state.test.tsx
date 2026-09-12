// `?document=` — the Documents workbench's URL-state contract (#719's Documents half), measured at
// the face rather than only in the parser.
//
// WHAT WAS WRONG. Selecting a filed document set React state and nothing else: a refresh lost it, a
// link could not name a document, and Back left the tab entirely. Every claim below is about a
// property the parser alone cannot have — which History verb was used, what a reload restores, and
// where focus is standing afterwards.
//
// THE HISTORY VERBS ARE THE SUBJECT, not the resulting address. A push and a replace reach the same
// URL and differ only in what Back then does, so a cell that asserted the address would pass on the
// exact defect this file exists to catch. `makeNavigation` (documents-test-fixtures.ts) records the
// verb of every navigation, and these cells assert on that sequence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentsWorkbench } from "./documents-workbench";
import { DOCUMENT_HEADING_ID } from "./document-detail";
import {
  DOCUMENTS_CLIENT, DOC_PDF, DOC_XML, DOC_ROWS,
  documentsApp, documentsFetch, makeNavigation, type Navigation,
} from "./documents-test-fixtures";

// The detail panel mounts @base-ui/react primitives (DocumentAdmin's Select, the door dialogs)
// whose floating-ui internals feature-detect against `window.Element`/`Node` — see
// test/domInspect.ts:435-460.
enableDomInspection();

type StubNode = { tagName?: string; childNodes?: StubNode[]; getAttribute?: (n: string) => string | null };

type Harness = Awaited<ReturnType<typeof renderComponent>> & { sync: () => Promise<void>; nav: Navigation };

async function withWorkbench(
  opts: { search?: string; docs?: Record<string, Record<string, unknown>> },
  run: (h: Harness) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = documentsFetch({ docs: opts.docs });
  configureSessionTokenSource(async () => "tok");

  const nav = makeNavigation(opts.search ?? "");
  const tree = () => documentsApp(createElement(DocumentsWorkbench, { clientId: DOCUMENTS_CLIENT }), nav);
  const base = await renderComponent(tree());
  const h: Harness = Object.assign(base, {
    nav,
    sync: async () => {
      await base.rerender(tree());
      for (let i = 0; i < 8; i++) await base.settle();
    },
  });
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    await run(h);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

function rowFor(h: Harness, filename: string): StubNode {
  const row = h.find((n) => n.tagName === "TR" && textOf(n).includes(filename));
  assert.ok(row, `the filed row for ${filename} must render`);
  return row as unknown as StubNode;
}

async function openRow(h: Harness, filename: string): Promise<StubNode> {
  const row = rowFor(h, filename);
  await h.fireEvent(row as never, "click");
  for (let i = 0; i < 6; i++) await h.settle();
  await h.sync();
  return row;
}

test("[the defect] selecting a document PUSHES ?document=<uuid> — the address names what is open", async () => {
  await withWorkbench({}, async (h) => {
    assert.equal(h.nav.search(), "", "control: nothing is selected on a bare load");
    assert.match(h.text(), /Select a document to see its evidence/);

    await openRow(h, "invoice-april.pdf");

    assert.equal(h.nav.search(), `document=${DOC_PDF}`);
    assert.deepEqual(h.nav.kinds(), ["push"], "opening a document must be a real history entry, or Back cannot close it");
    assert.match(h.text(), /invoice-april\.pdf/);
    assert.doesNotMatch(h.text(), /Select a document to see its evidence/, "the empty state must be gone once a document is open");
  });
});

test("a reload at ?document=<uuid> RESTORES the selection — the property React state could never have", async () => {
  await withWorkbench({ search: `document=${DOC_PDF}` }, async (h) => {
    // No click anywhere: this is a fresh mount at that address, exactly what a refresh or a shared
    // link produces.
    assert.match(h.text(), /invoice-april\.pdf/);
    assert.deepEqual(h.nav.kinds(), [], "restoring a selection from the URL must not itself navigate");
  });
});

test("stepping to ANOTHER document REPLACES — Back returns to the list, not backwards through every row clicked", async () => {
  await withWorkbench({}, async (h) => {
    await openRow(h, "invoice-april.pdf");
    await openRow(h, "myinvois-e-invoice.xml");

    assert.equal(h.nav.search(), `document=${DOC_XML}`);
    assert.deepEqual(
      h.nav.kinds(),
      ["push", "replace"],
      "the first open is a place to come back to; changing what the one panel shows is not",
    );
  });
});

test("Back closes the detail and returns focus to the row that opened it", async () => {
  await withWorkbench({}, async (h) => {
    const row = await openRow(h, "invoice-april.pdf");
    assert.match(h.text(), /invoice-april\.pdf/);

    const close = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Close");
    assert.ok(close, "an open detail must offer a close control — Escape and the browser Back are not the only ways out");
    await clickButton(close!);
    for (let i = 0; i < 6; i++) await h.settle();
    await h.sync();

    assert.deepEqual(h.nav.kinds(), ["push", "back"], "closing a pushed detail must POP that entry, never write a third one");
    assert.equal(h.nav.search(), "", "…and the address stops naming a document that is no longer open");
    assert.match(h.text(), /Select a document to see its evidence/);

    // FOCUS. The harness has no real focus manager, so what is asserted is the honest claim every
    // other dialog cell in this repo makes: focus is not STRANDED on the document body. The row is
    // back on the page and reachable.
    const active = activeElement();
    assert.notEqual(active, null, "focus must not be stranded after the detail closes");
    assert.ok(
      active === (row as unknown) || textOf(row as never).includes("invoice-april.pdf"),
      "the originating row must still be on the page for focus to return to",
    );
  });
});

test("a page loaded DIRECTLY at ?document= closes by REPLACE — there is no entry to pop, and Back must not leave the tab", async () => {
  await withWorkbench({ search: `document=${DOC_PDF}` }, async (h) => {
    const close = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Close");
    assert.ok(close);
    await clickButton(close!);
    for (let i = 0; i < 6; i++) await h.settle();
    await h.sync();

    assert.deepEqual(h.nav.kinds(), ["replace"], "a bookmark has no history entry of its own to pop");
    assert.equal(h.nav.search(), "");
  });
});

test("a MALFORMED id renders the not-available state and CLEARS the parameter", async () => {
  await withWorkbench({ search: "document=not-a-uuid" }, async (h) => {
    await h.sync();
    assert.match(h.text(), /That document isn't available in this client/);
    assert.equal(h.nav.search(), "", "the address must stop repeating an id it cannot mean");
    assert.deepEqual(h.nav.kinds(), ["replace"], "clearing a bad address is a correction, never a new place to come back to");
    // …and it is NOT the ordinary empty state, which would be an answer to a question nobody asked.
    assert.doesNotMatch(h.text(), /Select a document to see its evidence/);
  });
});

test("an UNKNOWN but well-formed id — another client's document — renders the same not-available state and clears the parameter", async () => {
  // The door collapses absent / another firm's / not-filed-to-this-client into ONE shape on
  // purpose (no existence oracle), so the surface must not claim to know which of the three it is.
  const onlyXml = { [DOC_XML]: DOC_ROWS[DOC_XML]! };
  await withWorkbench({ search: `document=${DOC_PDF}`, docs: onlyXml }, async (h) => {
    for (let i = 0; i < 8; i++) await h.settle();
    await h.sync();
    assert.match(h.text(), /That document isn't available in this client/);
    assert.equal(h.nav.search(), "");
  });
});

test("the detail exports a heading id, and it is on the document's own name", async () => {
  // The workbench moves focus to this element on open (documents-workbench.tsx). An id that names
  // nothing is a focus target that silently does not exist, which is precisely the "focus drops to
  // body" class the exported-heading-id idiom was introduced to close.
  await withWorkbench({ search: `document=${DOC_PDF}` }, async (h) => {
    const heading = h.find((n) => (n as StubNode).getAttribute?.("id") === DOCUMENT_HEADING_ID);
    assert.ok(heading, `the detail must render an element with id="${DOCUMENT_HEADING_ID}"`);
    assert.match(textOf(heading!), /invoice-april\.pdf/, "the heading a reader lands on must name the DOCUMENT, not the panel");
  });
});
