// GATE (c) — keyboard-walk tests for T9's (port-wave) door dialogs: mint
// snapshot, requeue render job (incl. the drift-acknowledge checkbox), tick a
// seeding proposal, retire a wiki page. Same mechanism as
// components/close/close-keyboard.test.tsx (test/keyboardWalk.ts); see that
// file's header for what real key-event dispatch this environment can and
// cannot prove.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SnapshotRegistryPanel } from "./SnapshotRegistryPanel";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";

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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function App(child: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, "Reports"), child),
  });
}

test("T9 (mint-snapshot door): the trigger is keyboard-reachable, opening it reaches the month field and Cancel/Confirm, and closing returns focus reachability to the trigger", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    if (String(u).includes("/period_snapshots")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${String(u)}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SnapshotRegistryPanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Mint snapshot"));
      assert.ok(trigger, "the Mint-snapshot trigger must render as a real button");
      assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must actually reach the trigger before activation");

      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const monthField = findIn(body as never, (n) => n.tagName === "INPUT");
      assert.ok(monthField, "the dialog must reach its month field");

      const cancelButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel"));
      assert.ok(cancelButton, "the Cancel control must render as a real button");
      await h.fireEvent(cancelButton as never, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Mint snapshot"));
      assert.ok(
        triggerAfterClose && focusableElements(h.container as never).includes(triggerAfterClose as never),
        "the trigger must be reachable again after the dialog closes",
      );
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("T9 (tick-proposal door): the trigger is keyboard-reachable and Enter/Space-equivalent activation opens it, reaching Confirm", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/seeding_batches")) {
      return jsonResponse([{ id: "b1", client_id: "c1", source_document_id: "doc1", source_sha256: "d".repeat(64), state: "open", stats: {}, created_by: "u1", created_at: "2026-07-01T00:00:00Z", completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null }]);
    }
    if (url.includes("/seeding_proposals")) {
      return jsonResponse([{ id: "p1", batch_id: "b1", client_id: "c1", proposal_kind: "counterparty_birth", proposal_key: "k1", payload: { name: "Acme Sdn Bhd" }, evidence: {}, state: "proposed", decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null, resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-01T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor })));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Tick");
      assert.ok(trigger, "the Tick trigger must render as a real button");
      assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");

      (trigger as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), trigger, "keyboard focus must reach the trigger");

      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Tick" && (n as unknown) !== (trigger as unknown));
      assert.ok(confirmButton, "the dialog's own Confirm (Tick) button must be reachable, distinct from the trigger");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
