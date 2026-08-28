// GATE (c) — keyboard-walk tests for T11's onboarding checklist card. Proves
// the two dialog-testing laws (apps/web/AGENTS.md): a real refusal through
// Confirm (via `clickButton`, never `h.fireEvent` on portaled content) closes
// the dialog and renders the CLR code + message VERBATIM in the card's own
// persistent banner AFTER the dialog closes; a real Cancel (via `clickButton`
// on the base-ui `DialogClose` control) closes the dialog too, proven by the
// dialog's own Confirm control being GONE from document.body afterward.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

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

const OPEN_PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1", "u2"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};
// Every required_for_commit item already answered/resolved — Confirm-commit
// is reachable without typing anything, so this file's own click is what is
// under test, not a field-gating detail already covered elsewhere.
const SETTLED_ITEM = {
  id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "Legal name", answer: "Rome Public Advisory", state: "answered", required_for_commit: true,
  answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      "div",
      null,
      createElement("h1", null, "Clara"),
      createElement(OnboardingChecklistCard, { clientId: "c1", session: sessionTokenAccessor }),
    ),
  });
}

async function mount() {
  const h = await renderComponent(App());
  const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
  body.appendChild(h.container);
  for (let i = 0; i < 5; i++) await h.settle();
  return { h, body };
}

test("COMMIT refusal: a real click on Confirm (clickButton) closes the dialog, and the CLR code + message render VERBATIM in the card's own persistent banner", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([OPEN_PLAN]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([SETTLED_ITEM]);
    if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
    if (url.includes("/rpc/commit_client_onboarding")) {
      return jsonResponse({ code: "CLR05", message: "onboarding commit requires a non-contributor checker", details: '{"reason":"distinct_checker"}' }, 400);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Commit onboarding");
      assert.ok(trigger, "the Commit-onboarding trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      // The trigger and the dialog's own Confirm share the SAME label
      // ("Commit onboarding") — exclude the trigger by identity, or `findIn`
      // (which walks from `body`, a PARENT of `h.container`) resolves the
      // ALWAYS-PRESENT trigger first and this test would silently click
      // nothing real (the exact vacuous-click class apps/web/AGENTS.md's
      // dialog-testing laws exist to prevent).
      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Commit onboarding" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm control must render, distinct from the trigger");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations in the open dialog");

      await h.act(() => clickButton(confirmButton as never));
      // The failure path awaits a full reload (3 sequential getRows calls)
      // before settling — more macrotask hops than a plain success path.
      for (let i = 0; i < 15; i++) await h.settle();

      // Discriminating post-condition: the dialog's own Cancel-of-the-dialog
      // control (DialogClose, present ONLY while open) must be gone.
      assert.doesNotMatch(textOf(body as never), /Resolve this onboarding item/, "the dialog's own content must be GONE after Confirm settles");

      const bodyText = textOf(body as never);
      assert.match(bodyText, /CLR05/, "the CLR code must render, verbatim, in the card's persistent banner");
      assert.match(bodyText, /non-contributor checker/, "the DB's own message must render, verbatim — never re-worded");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("CANCEL-onboarding dialog: clickButton on the dialog's own DialogClose control closes it — the dialog's own Confirm control is GONE afterward", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([OPEN_PLAN]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([SETTLED_ITEM]);
    if (url.includes("/rest/v1/clients")) return jsonResponse([{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }]);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Cancel onboarding");
      assert.ok(trigger, "the Cancel-onboarding trigger must render");
      assert.ok(focusableElements(h.container as never).includes(trigger as never), "the trigger must be keyboard-reachable");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      // "Reason for cancelling" is the field's aria-label/placeholder, not
      // rendered text content — the real proof the reason field is reachable
      // is the TEXTAREA element itself (placeholders/aria-labels are
      // attributes, invisible to textOf's text-node walk).
      const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(reasonField, "opening the trigger must reveal the dialog's own reason field");

      const dialogCloseButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel");
      assert.ok(dialogCloseButton, "the dialog's own DialogClose (Cancel) control must render");
      assert.deepEqual(checkKeyboardWalk(body as never), [], "no tabindex-order/focus-visible violations while the dialog is open");

      await h.act(() => clickButton(dialogCloseButton as never));
      for (let i = 0; i < 6; i++) await h.settle();

      // Discriminating post-condition (F5-class, per the counterparty-hygiene
      // precedent): the dialog's own Confirm control ("Cancel onboarding",
      // distinct from the ALWAYS-present trigger of the same text) must be
      // GONE — proof the close genuinely happened, not merely that the
      // trigger (which lives outside the portal and was never removed) is
      // still there.
      const confirmStillThere = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Cancel onboarding" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(confirmStillThere, null, "the dialog's own Confirm control must be GONE after DialogClose settles");

      const triggerAfterClose = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Cancel onboarding");
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
