// components/documents/document-kind-dialog.tsx — #1005 (SPEC-1005-1/ADV-9 fix round).
//
// Same shape as document-kind-control.test.tsx's own header: this dialog's kind Select is
// portalled into `document.body`, so the render container is appended into `body` before
// interacting and text is read from `body`, not from `h.text()` (close-t1-opener.test.tsx's
// house pattern). `initialKind` (added this fix round) presets the Select's value before the
// dialog's content ever paints.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { DocumentKindDialog } from "./document-kind-dialog";
import messages from "../../messages/en.json";

enableDomInspection();

const DOC = "d2222222-2222-4222-8222-222222222222";

function bodyOf() {
  return (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
}

test("[1005]: a preset kind shows its LABEL on the dialog's kind trigger, never the raw enum value", async () => {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(DocumentKindDialog, {
        documentId: DOC,
        currentKind: "receipt",
        busy: false,
        act: async (fn: () => Promise<void>) => { await fn(); return true; },
        initialKind: "invoice",
      }),
    }),
  );
  const body = bodyOf();
  body.appendChild(h.container);
  try {
    await h.settle();
    const opener = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Set kind");
    assert.ok(opener, "the Set kind trigger button must render");
    await h.act(async () => { await clickButton(opener!); });
    for (let i = 0; i < 4; i++) await h.settle();
    const text = textOf(body as never);
    assert.match(text, /Invoice/, "the dialog's kind trigger must show the preset kind's label");
    assert.doesNotMatch(text, /\binvoice\b/, "the raw enum value must never render as trigger text");
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
});
