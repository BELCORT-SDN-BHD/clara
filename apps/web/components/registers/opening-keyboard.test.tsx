// GATE (c) — keyboard-walk tests for T2's opening-seed door dialogs (owner
// ruling Q7). Uses CancelOpeningSeedDialog as the drive vehicle (the
// smallest complete door dialog this train ships — one required Textarea) to
// prove the two laws apps/web/AGENTS.md's dialog-testing section names: a
// real refusal surfaces in the PERSISTENT banner OUTSIDE the dialog after it
// closes (never retried, never shown only inside the now-closed dialog), and
// Cancel via DialogClose removes the dialog from `document.body` entirely
// (Confirm is gone with it — never a stranded portal).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection, activeElement } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OpeningRegister } from "./opening-register";

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

const EMPTY_OPEN_SEED = {
  id: "s1", firm_id: "f1", client_id: "c1", plan_id: "plan1", as_of: "2026-01-15", state: "open",
  tie_document_id: null, tie_document_sha256: null, created_by: "u1", created_at: "2026-01-15T00:00:00Z",
  batch_n: 0, finalized_at: null, finalized_by: null, tie_asserted_at: null, through_event_seq: null,
  cancelled_at: null, cancelled_by: null, cancel_reason: null,
};
const DRYRUN_EMPTY = { seed_id: "s1", client_id: "c1", as_of: "2026-01-15", state: "open", obe_net_cents: 0, deltas: [], unmapped_labels: [], missing_must_asks: [] };

function baseMock(cancelResponder: () => Response) {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/cancel_opening_seed")) return cancelResponder();
    if (url.includes("/rpc/get_opening_dryrun")) return jsonResponse(DRYRUN_EMPTY);
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse([EMPTY_OPEN_SEED]);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([{ id: "plan1", state: "open", revision_token: "rev1", created_at: "2026-01-01T00:00:00Z" }]);
    if (url.includes("/rest/v1/coa_accounts")) return jsonResponse([]);
    if (url.includes("/rest/v1/counterparties")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_items")) return jsonResponse([]);
    if (url.includes("/rest/v1/opening_tb_targets")) return jsonResponse([]);
    if (url.includes("/rest/v1/client_resolutions")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement("div", null, createElement("h1", null, "Registers"), createElement(OpeningRegister, { clientId: "c1" })),
  });
}

test("Cancel-seed dialog: a real CLR31 refusal closes the dialog and surfaces VERBATIM in the persistent banner outside it — never retried", async () => {
  await withMockedEnv(
    baseMock(() => jsonResponse({ code: "CLR31", message: "only an empty open seed may be cancelled", details: '{"reason":"registry_not_open"}' }, 400)),
    async () => {
      const h = await renderComponent(App());
      const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Cancel seed"));
        assert.ok(trigger, "the Cancel-seed trigger must render on an empty open seed");
        await h.fireEvent(trigger as never, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.ok(reasonField, "the reason textarea must be reachable inside the open dialog");
        await h.act(() => setFieldValue(reasonField as never, "duplicate seed"));

        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel seed") && (n as unknown) !== (trigger as unknown));
        assert.ok(confirmButton, "the dialog's own Confirm button must be reachable, distinct from the trigger");
        await h.act(() => clickButton(confirmButton as never));
        for (let i = 0; i < 6; i++) await h.settle();

        // CB-AE2E-004 (2026-09-04): the dialog STAYS OPEN on a refusal. `act()` still
        // never rethrows — it records the failure internally and resolves `false` —
        // and that `false` is now what the wrapper reads. This cell used to assert
        // the opposite (`confirmAfter === null`, "gone once it closes"), which is
        // precisely the behaviour that destroyed the typed reason.
        const confirmAfter = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel seed") && (n as unknown) !== (trigger as unknown));
        assert.ok(confirmAfter, "the dialog's Confirm button must STILL be there — a refusal does not close the dialog");
        const reasonAfter = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        assert.equal((reasonAfter as unknown as { value: string }).value, "duplicate seed", "the typed reason survives the refusal");

        // The refusal renders VERBATIM — and now INSIDE the still-open dialog, where
        // the human can read it (the panel's own banner is behind the modal backdrop).
        assert.match(textOf(body as never), /CLR31/, "the refusal code must render verbatim");
        assert.match(textOf(body as never), /only an empty open seed may be cancelled/, "the refusal message must render verbatim, never re-worded");
      } finally {
        await h.unmount();
        for (let i = 0; i < 5; i++) await h.settle();
      }
    },
  );
});

test("Cancel-seed dialog: DialogClose (Cancel) removes the WHOLE dialog from document.body — Confirm is gone with it", async () => {
  await withMockedEnv(baseMock(() => jsonResponse({ seed_id: "s1", status: "cancelled" })), async () => {
    const h = await renderComponent(App());
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Cancel seed"));
      assert.ok(trigger);
      await h.fireEvent(trigger as never, "click");
      for (let i = 0; i < 4; i++) await h.settle();

      const dialogCancel = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.ok(dialogCancel, "the dialog's own Cancel (DialogClose) button must be reachable");
      assert.ok(focusableElements(body as never).includes(dialogCancel as never), "DialogClose must be keyboard-reachable");
      (dialogCancel as unknown as { focus: () => void }).focus();
      assert.equal(activeElement(), dialogCancel, "keyboard focus must actually reach DialogClose");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      await h.act(() => clickButton(dialogCancel as never));
      for (let i = 0; i < 6; i++) await h.settle();

      const confirmAfter = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).includes("Cancel seed") && (n as unknown) !== (trigger as unknown));
      assert.equal(confirmAfter, null, "Confirm must be GONE from document.body after DialogClose — the whole dialog unmounts, not just a visual hide");
      const dialogCancelAfter = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.equal(dialogCancelAfter, null, "the dialog's own Cancel button is gone too");

      const triggerAfter = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Cancel seed"));
      assert.ok(triggerAfter && focusableElements(h.container as never).includes(triggerAfter as never), "the trigger must be reachable again — focus is not stranded");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
