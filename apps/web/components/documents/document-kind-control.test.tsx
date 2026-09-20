// components/documents/document-kind-control.tsx — #1005 (SPEC-1005-1/ADV-9 fix round).
//
// The kind Select lives inside this control's Dialog, so its content is a Base UI PORTAL into
// `document.body` — a separate subtree `h.text()`/`h.find()` (scoped to the render container)
// never reaches (test/hookHarness.ts's own `clickButton` header documents the same portal
// boundary for Dialog interaction). `close-t1-opener.test.tsx`'s house pattern is the fix:
// append the render container INTO `document.body` before interacting, open the dialog with an
// ordinary button click (the trigger itself lives OUTSIDE any portal), then read text from
// `document.body` rather than from `h.text()`. `initialKind` (added this fix round) presets the
// Select's value BEFORE the dialog's content ever paints, so the FIRST render of the kind
// trigger, once the dialog opens, already shows a resolved label — never the raw enum value or
// an empty placeholder standing in for "nothing chosen yet".

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { DocumentKindControl } from "./document-kind-control";
import messages from "../../messages/en.json";

enableDomInspection();

const DOC = "d1111111-1111-4111-8111-111111111111";

function bodyOf() {
  return (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
}

test("[1005]: a preset kind shows its LABEL on the dialog's kind trigger, never the raw enum value", async () => {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(DocumentKindControl, {
        documentId: DOC,
        filename: "doc-2026-03.pdf",
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
    const opener = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Classify");
    assert.ok(opener, "the Classify trigger button must render");
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
