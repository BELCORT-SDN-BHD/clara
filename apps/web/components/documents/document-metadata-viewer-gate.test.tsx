// C-07 / 裁-175 — the viewer gate AT THE FACE.
//
// `lib/documents/open-in-new-tab.test.ts` proves the library refuses. This
// proves the human is told the truth about it: a neutral, honest reason naming
// the type, NOT the red "could not open this document" failure banner — nothing
// failed — and a control that takes them to the view which CAN show the
// content. A gate that refuses correctly and then lies about why is half a fix.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentMetadata } from "./document-metadata";
import messages from "../../messages/en.json";
import type { DocumentRow } from "../../lib/documents/types";

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

const DOCUMENT: DocumentRow = {
  id: "doc-1", sha256: "abc123", original_filename: "e-invoice.xml", mime_type: "application/xml",
  byte_size: 2048, storage_path: "docs/doc-1.xml", uploaded_by: "user-1", created_at: "2026-04-01T00:00:00Z",
  bytes_verified_at: "2026-04-01T00:00:01Z", page_count: null, extraction_status: "done",
  document_kind: "e_invoice_xml", financial_date: "2026-04-01", retention_state: "unanchored", retain_until: null,
  retention_basis: null, legal_hold: false, legal_hold_reason: null,
};

type FakeTab = { closed: boolean; location: { href: string }; opener: unknown; close(): void; hrefSet: string | null; closedCalled: boolean };

function fakeTab(): FakeTab {
  const tab: FakeTab = {
    closed: false, location: { href: "about:blank" }, opener: {},
    hrefSet: null, closedCalled: false,
    close() { this.closedCalled = true; },
  };
  Object.defineProperty(tab.location, "href", {
    get() { return tab.hrefSet ?? "about:blank"; },
    set(v: string) { tab.hrefSet = v; },
  });
  return tab;
}

/** Installs what this component's click path needs: a fetch returning bytes of
 *  `mime`, the object-URL pair, a session token, and — added onto the harness's
 *  OWN `window` rather than a replacement for it — a `window.open`.
 *
 *  The distinction matters and cost a round: `renderComponent` builds a `window`
 *  stub carrying `HTMLElement`, `Element` and `Node` constructors that
 *  @base-ui/react's floating-ui internals feature-detect against
 *  (test/domInspect.ts:435-460). Replacing it wholesale with `{ open }` makes
 *  those `instanceof` checks throw "Right-hand side of 'instanceof' is not an
 *  object" from inside the primitives, nowhere near this file. So `open` is
 *  ADDED to the existing window, and removed again afterwards. */
async function withOpenEnv(mime: string, run: (tab: FakeTab) => Promise<void>): Promise<void> {
  const tab = fakeTab();
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;

  globalThis.fetch = (async () => new Response(new Blob(["x"]), { status: 200, headers: { "content-type": mime } })) as typeof fetch;
  URL.createObjectURL = () => "blob:fake-url";
  URL.revokeObjectURL = () => {};
  configureSessionTokenSource(async () => "tok");
  try {
    await run(tab);
  } finally {
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
    resetSessionTokenSource();
  }
}

/** Splices `open` onto the harness's live `window` (which only exists once
 *  `renderComponent` has run) and hands back the undo. */
function installWindowOpen(tab: FakeTab): () => void {
  const win = (globalThis as unknown as { window?: Record<string, unknown> }).window;
  assert.ok(win, "the render harness must have installed a window stub before this point");
  const had = Object.prototype.hasOwnProperty.call(win, "open");
  const previous = win.open;
  win.open = () => tab;
  return () => { if (had) win.open = previous; else delete win.open; };
}

test("[the defect] an XML document's Open is REFUSED at the face — the honest reason renders, the tab is never navigated", async () => {
  let shown = 0;
  await withOpenEnv("application/xml", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, {
      document: DOCUMENT, tasks: [], onShowExtraction: () => { shown += 1; },
    })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      const open = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open document"));
      assert.ok(open, "the open control must render");
      await clickButton(open!);
      for (let i = 0; i < 6; i++) await h.settle();

      // THE DISCRIMINATING POST-CONDITION. On the pre-gate code this href IS
      // "blob:fake-url" — a same-origin document carrying the user's session.
      assert.equal(tab.hrefSet, null, "no tab may ever be navigated to a non-viewable document's blob URL");
      assert.equal(tab.closedCalled, true, "the about:blank tab opened for the click is closed again");

      const text = h.text();
      assert.match(text, /can't be shown in a browser tab/, "the human is told what actually happened");
      assert.match(text, /application\/xml/, "…and the type is named verbatim, not guessed at");
      assert.doesNotMatch(text, /Could not open this document/, "this is NOT a failure — the red banner would misname the cause");
      assert.doesNotMatch(text, /blocked the new tab/, "…and it is NOT a pop-up problem, which would send the human to fix the wrong setting");
    } finally {
      undo();
      await h.unmount();
    }
  });
  assert.equal(shown, 0, "control: the alternative is offered, not auto-triggered");
});

test("the refusal OFFERS the structured view, and the control actually opens it", async () => {
  let shown = 0;
  await withOpenEnv("application/xml", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, {
      document: DOCUMENT, tasks: [], onShowExtraction: () => { shown += 1; },
    })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      await clickButton(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open document"))!);
      for (let i = 0; i < 6; i++) await h.settle();

      const alt = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Show what was extracted"));
      assert.ok(alt, "a refusal that names an alternative must render the control for it, not just describe it");
      await clickButton(alt!);
      await h.settle();
      assert.equal(shown, 1, "the control opens the structured extraction view on the same panel");
    } finally {
      undo();
      await h.unmount();
    }
  });
});

test("with NO alternative wired, the reason renders alone — never a control that does nothing", async () => {
  await withOpenEnv("application/xml", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, { document: DOCUMENT, tasks: [] })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      await clickButton(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open document"))!);
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /can't be shown in a browser tab/);
      assert.equal(
        h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Show what was extracted")),
        null,
        "a caller with no structured view must not render a dead button",
      );
    } finally {
      undo();
      await h.unmount();
    }
  });
});

test("VACUITY CONTROL: a PDF still opens — the gate refuses a TYPE, it does not break the feature", async () => {
  // Without this every cell above passes against a component whose Open button
  // was simply removed, or whose gate refuses everything.
  await withOpenEnv("application/pdf", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, {
      document: { ...DOCUMENT, mime_type: "application/pdf", original_filename: "invoice.pdf" }, tasks: [],
    })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      await clickButton(h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Open document"))!);
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(tab.hrefSet, "blob:fake-url", "a PDF must still reach the tab");
      assert.doesNotMatch(h.text(), /can't be shown in a browser tab/);
    } finally {
      undo();
      await h.unmount();
    }
  });
});
