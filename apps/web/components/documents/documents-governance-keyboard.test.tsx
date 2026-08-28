// GATE (c) — keyboard-walk tests for T6's documents-half door dialogs:
// re-extraction, classify-as-consent-evidence (both DocumentAdmin, reason-
// gated) and request-autodraft (DocumentFilingsHistory, no fields). Each is
// a base-ui Dialog portaled to document.body — journals-governance-
// keyboard.test.tsx's own `findIn`/`body.appendChild` precedent, itself
// following close-keyboard.test.tsx's.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { DocumentAdmin } from "./document-admin";
import { DocumentFilingsHistory } from "./document-filings-history";
import type { DocumentRow, FilingRow } from "../../lib/documents/types";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[] };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

function body(): Node {
  return (globalThis as unknown as { document: { body: Node } }).document.body;
}

const DOCUMENT: DocumentRow = {
  id: "doc-1", sha256: "abc123", original_filename: "invoice-april.pdf", mime_type: "application/pdf",
  byte_size: 20480, storage_path: "docs/doc-1.pdf", uploaded_by: "user-1", created_at: "2026-04-01T00:00:00Z",
  bytes_verified_at: "2026-04-01T00:00:01Z", page_count: 2, extraction_status: "done",
  document_kind: "invoice", financial_date: "2026-04-01", retention_state: "unanchored", retain_until: null,
  retention_basis: null, legal_hold: false, legal_hold_reason: null,
};

test("RE-EXTRACTION journey: the dialog opens, its reason field and Confirm/Cancel are keyboard-reachable, Confirm gated until a reason is typed", async () => {
  const h = await renderComponent(
    App(createElement(DocumentAdmin, { document: DOCUMENT, busy: false, act: async (fn) => { await fn(); }, onCorrect: () => {} })),
  );
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Request re-extraction$/) !== null);
    assert.ok(trigger, "the re-extraction trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();
    assert.match(textOf(b as never), /Re-queues this document/, "opening the dialog must reach its own description");

    const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
    assert.ok(reasonField, "the reason field must render as a real <textarea>");
    const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Request re-extraction$/) !== null && n !== trigger);
    const cancelButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(confirmButton, "the confirm control must render");
    assert.ok(cancelButton, "the cancel control must render");
    assert.ok(
      !focusableElements(h.container as never).concat(focusableElements(b as never)).includes(confirmButton as never),
      "confirm must be unreachable (disabled) while the reason is empty",
    );

    await h.act(() => { setFieldValue(reasonField as never, "engine misread the invoice total"); });
    const confirmAfter = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Request re-extraction$/) !== null && n !== trigger);
    assert.ok(
      focusableElements(b as never).includes(confirmAfter as never),
      "confirm must become reachable once a reason is typed",
    );
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");

    (reasonField as unknown as { focus: () => void }).focus();
    assert.equal(activeElement(), reasonField, "focusing the reason field must move document.activeElement to it");
  } finally {
    await h.unmount();
  }
});

test("CONSENT EVIDENCE journey: the dialog opens, its reason field and Confirm/Cancel are keyboard-reachable", async () => {
  const h = await renderComponent(
    App(createElement(DocumentAdmin, { document: DOCUMENT, busy: false, act: async (fn) => { await fn(); }, onCorrect: () => {} })),
  );
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Classify as consent evidence$/) !== null);
    assert.ok(trigger, "the consent-evidence trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const reasonField = findIn(b, (n) => n.tagName === "TEXTAREA");
    const cancelButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(reasonField, "the reason field must render as a real <textarea>");
    assert.ok(cancelButton, "the cancel control must render");
    assert.ok(focusableElements(b as never).includes(reasonField as never));
    assert.ok(focusableElements(b as never).includes(cancelButton as never));
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");
  } finally {
    await h.unmount();
  }
});

const FILING: FilingRow = {
  id: "filing-1", document_id: "doc-1", client_id: "client-1", filed_at: "2026-04-02T00:00:00Z",
  filed_by: "user-1", basis: "human", retired_at: null, retirement_reason: null, revision_token: "rev-1",
};

test("AUTODRAFT journey: the dialog opens with no fields of its own, and Confirm/Cancel are keyboard-reachable", async () => {
  const h = await renderComponent(
    App(createElement(DocumentFilingsHistory, { filings: [FILING], busy: false, act: async (fn) => { await fn(); } })),
  );
  const b = body();
  (b as unknown as { appendChild: (c: unknown) => void }).appendChild(h.container);
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Request autodraft$/) !== null);
    assert.ok(trigger, "the autodraft trigger must render");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 6; i++) await h.settle();

    const confirmButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Request autodraft$/) !== null && n !== trigger);
    const cancelButton = findIn(b, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Cancel$/) !== null);
    assert.ok(confirmButton, "the confirm control must render");
    assert.ok(cancelButton, "the cancel control must render");
    assert.ok(focusableElements(b as never).includes(confirmButton as never), "confirm must be reachable — this door needs no fields");
    assert.ok(focusableElements(b as never).includes(cancelButton as never));
    assert.deepEqual(checkKeyboardWalk(b as never), [], "no tabindex-order/focus-visible violations in the open dialog");
  } finally {
    await h.unmount();
  }
});
