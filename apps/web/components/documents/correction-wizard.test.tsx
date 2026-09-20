// components/documents/correction-wizard.tsx — #1005 (SPEC-1005-1/ADV-9 fix round).
//
// Same shape as document-kind-control.test.tsx's own header: the destination-client Select lives
// inside this wizard's Dialog, portalled into `document.body`, so the render container is
// appended into `body` before reading text (close-t1-opener.test.tsx's house pattern) rather than
// through `h.text()`, which only sees the render container itself. Unlike the other two dialog
// call sites, `open` is a plain boolean prop here, so no button click is needed to reach the
// dialog's content — mounting with `open: true` is enough. `initialToClient` (added this fix
// round) presets the destination Select's value before that content ever paints.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { CorrectionWizard } from "./correction-wizard";
import type { ClientRow, DocumentRow } from "@/lib/documents/types";
import messages from "../../messages/en.json";

enableDomInspection();

const FROM_CLIENT = "c1111111-1111-4111-8111-111111111111";
const TO_CLIENT = "c2222222-2222-4222-8222-222222222222";

const DOC: DocumentRow = {
  id: "d3333333-3333-4333-8333-333333333333",
  sha256: "a".repeat(64),
  original_filename: "misfiled.pdf",
  mime_type: "application/pdf",
  byte_size: 1024,
  storage_path: "s",
  uploaded_by: null,
  created_at: "2026-03-01T00:00:00Z",
  bytes_verified_at: "2026-03-01T00:00:01Z",
  page_count: 1,
  extraction_status: "done",
  document_kind: "invoice",
  financial_date: null,
  retention_state: "unanchored",
  retain_until: null,
  retention_basis: null,
  legal_hold: false,
  legal_hold_reason: null,
};

const CLIENTS: ClientRow[] = [
  { id: FROM_CLIENT, name: "Rome Properties", status: "active" },
  { id: TO_CLIENT, name: "Athens Holdings", status: "active" },
];

function bodyOf() {
  return (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
}

test("[1005]: a preset destination client shows its NAME on the wizard's trigger, never its row id", async () => {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(CorrectionWizard, {
        open: true,
        document: DOC,
        fromClient: FROM_CLIENT,
        clients: CLIENTS,
        clientsErr: null,
        clientsClr: null,
        onClose: () => {},
        onDone: () => {},
        initialToClient: TO_CLIENT,
      }),
    }),
  );
  const body = bodyOf();
  body.appendChild(h.container);
  try {
    for (let i = 0; i < 4; i++) await h.settle();
    const text = textOf(body as never);
    assert.match(text, /Athens Holdings/, "the destination trigger must show the preset client's name");
    assert.doesNotMatch(text, new RegExp(TO_CLIENT), "the destination client's row id must never render as trigger text");
  } finally {
    await h.unmount();
    for (let i = 0; i < 3; i++) await h.settle();
  }
});
