// C-07 / 裁-175 — the viewer gate AT THE FACE.
//
// `lib/documents/open-in-new-tab.test.ts` proves the LIBRARY refuses a type a browser tab cannot
// show inertly, and that library gate is the security wall (a `blob:` URL inherits this app's
// origin, so a script-bearing type navigated into one runs as the firm member). This file proves
// what the face does about it.
//
// WHAT CHANGED WITH THE SOURCE-CUSTODY PASS, and why these cells now assert the ABSENCE of a
// control rather than the refusal that followed pressing one. Before it, "Open document" rendered
// for every type and an XML's refusal appeared only AFTER a click — the person was told about the
// wall by being walked into it, and the only other thing on offer was "read the extraction
// instead", which is true and is not the same thing as being given the file. Now:
//
//   · the Open control is OFFERED only for a type the wall admits (the row's own `mime_type`);
//   · the honest reason for every other type STANDS on the page, before anybody presses anything;
//   · "Download original" is there for all of them, which is the actual answer to "I need this
//     file" and is what the C-07 refusal never had.
//
// THE WALL ITSELF IS UNTOUCHED and is still measured — by the library's own suite, where it
// belongs, and by the drift cell in `lib/documents/bytes.test.ts` that pins the viewer list
// against the fetch list and against the runtime's intake table. A gate enforced in a component
// is a gate a second caller bypasses; these cells are about the OFFER, not about the wall.

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

const CLIENT = "c11e0000-1111-4111-8111-111111111111";

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

const findButton = (h: { find: (p: (n: { tagName?: string }) => boolean) => unknown }, label: string) =>
  h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && textOf(n as never).includes(label));

test("[the defect] an XML document is NEVER OFFERED the tab — the control is absent and the honest reason stands without a click", async () => {
  let shown = 0;
  await withOpenEnv("application/xml", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, {
      document: DOCUMENT, tasks: [], clientId: CLIENT, onShowExtraction: () => { shown += 1; },
    })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();

      // THE DISCRIMINATING POST-CONDITION, and it is stronger than the one this cell used to
      // carry: on the pre-gate code the control existed and its click set `tab.location.href` to
      // a same-origin blob carrying the user's session. There is now no control to press at all.
      assert.equal(findButton(h, "Open original"), null, "a type the wall refuses must not be offered a tab");
      assert.equal(tab.hrefSet, null, "no tab may ever be navigated to a non-viewable document's blob URL");

      const text = h.text();
      assert.match(text, /can't be shown in a browser tab/, "the human is told what actually happened");
      assert.match(text, /application\/xml/, "…and the type is named verbatim, not guessed at");
      assert.doesNotMatch(text, /Could not open this document/, "this is NOT a failure — a red banner would misname the cause");
      assert.doesNotMatch(text, /blocked the new tab/, "…and it is NOT a pop-up problem, which would send the human to fix the wrong setting");

      // AND THE THING THE REFUSAL NEVER HAD: the file itself is still obtainable.
      assert.ok(findButton(h, "Download original"), "an un-previewable document must still be downloadable — that is the whole point of the second affordance");
    } finally {
      undo();
      await h.unmount();
    }
  });
  assert.equal(shown, 0, "control: the alternative is offered, not auto-triggered");
});

test("the standing reason OFFERS the structured view, and the control actually opens it", async () => {
  let shown = 0;
  await withOpenEnv("application/xml", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, {
      document: DOCUMENT, tasks: [], clientId: CLIENT, onShowExtraction: () => { shown += 1; },
    })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      const alt = findButton(h, "Show what was extracted");
      assert.ok(alt, "a reason that names an alternative must render the control for it, not just describe it");
      await clickButton(alt as never);
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
    const h = await renderComponent(App(createElement(DocumentMetadata, { document: DOCUMENT, tasks: [], clientId: CLIENT })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      assert.match(h.text(), /can't be shown in a browser tab/);
      assert.equal(
        findButton(h, "Show what was extracted"),
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
  // Without this every cell above passes against a component whose Open button was simply
  // removed, or whose offer predicate refuses everything.
  await withOpenEnv("application/pdf", async (tab) => {
    const h = await renderComponent(App(createElement(DocumentMetadata, {
      document: { ...DOCUMENT, mime_type: "application/pdf", original_filename: "invoice.pdf" },
      tasks: [], clientId: CLIENT,
    })));
    const undo = installWindowOpen(tab);
    try {
      await h.settle();
      const open = findButton(h, "Open original");
      assert.ok(open, "a viewable type must be offered the tab");
      await clickButton(open as never);
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(tab.hrefSet, "blob:fake-url", "a PDF must still reach the tab");
      assert.doesNotMatch(h.text(), /can't be shown in a browser tab/);
    } finally {
      undo();
      await h.unmount();
    }
  });
});

test("[found by the browser leg] a genuine byte-read failure renders its sentence ONCE, not nested inside itself", async () => {
  // The page once read "Could not open this document: Could not open this document: document
  // bytes failed" — the error held a finished sentence and the banner wrapped it in its own
  // template a second time. The template is gone entirely now (the state ladder owns one sentence
  // per state), so the count is what keeps that class closed: a `toContain` check would pass on a
  // doubled string.
  const originalFetch = globalThis.fetch;
  const originalCreate = URL.createObjectURL;
  URL.createObjectURL = () => "blob:fake-url";
  globalThis.fetch = (async () => new Response("nope", { status: 500 })) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  const tab = fakeTab();
  const h = await renderComponent(App(createElement(DocumentMetadata, {
    document: { ...DOCUMENT, mime_type: "application/pdf", original_filename: "invoice.pdf" },
    tasks: [], clientId: CLIENT,
  })));
  const undo = installWindowOpen(tab);
  try {
    await clickButton(findButton(h, "Open original") as never);
    for (let i = 0; i < 6; i++) await h.settle();
    const text = h.text();
    const sentence = "The server had a problem sending this file";
    const occurrences = text.split(sentence).length - 1;
    assert.equal(occurrences, 1, `the failure sentence must appear exactly once, not nested — saw ${occurrences} in: ${text}`);
    assert.doesNotMatch(text, /nope/, "the runtime's own body text must never reach the page");
  } finally {
    undo();
    await h.unmount();
    globalThis.fetch = originalFetch;
    URL.createObjectURL = originalCreate;
    resetSessionTokenSource();
  }
});
