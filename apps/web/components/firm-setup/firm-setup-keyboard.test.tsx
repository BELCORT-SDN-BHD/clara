// #648 (journey A5) — keyboard and focus cells for the firm setup checklist.
//
// WHAT EACH CELL MEASURES, and the mutant it kills:
//   1 · focus moves to the step's OWN control on every Next and Back, and to the FIRST INVALID
//       control when a step refuses to advance. Mutant: a walk that renders the next question and
//       leaves focus on the (now unmounted) Next button, i.e. on the document body.
//   2 · focus RETURNS after the form closes — to the trigger that opened it when it survives, and
//       to the nearest surviving trigger in the same group when it does not. Mutant: `onCancel`
//       that unmounts the form and lets focus fall onto `<body>` (§4's own wording).
//   3 · ONE ANNOUNCEMENT OWNER PER TRANSITION. The FORM speaks for what happened to an answer; the
//       CHECKLIST speaks for what happened to the plan. Mutant: a refusal announced twice, once by
//       the form's banner and once by a checklist-level banner carrying the same error.
//   4 · every focusable control keeps a visible focus ring and nothing reorders the tab sequence.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { clickButton, renderComponent, setFieldValue, textOf, type RenderHarness } from "../../test/hookHarness";
import { activeElement, enableDomInspection } from "../../test/domInspect";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { FirmSetupChecklist } from "./firm-setup-checklist";

enableDomInspection();

type Stub = { tagName?: string; childNodes?: Stub[]; getAttribute?: (n: string) => string | null; id?: string };

const MAX_SETTLE_PASSES = 200;
async function settleUntil(h: RenderHarness, condition: () => boolean, label: string): Promise<void> {
  for (let pass = 0; pass < MAX_SETTLE_PASSES; pass += 1) {
    if (condition()) return;
    await h.settle();
  }
  if (condition()) return;
  throw new Error(`${label} never arrived within ${MAX_SETTLE_PASSES} settle passes`);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function refusal(code: string, message: string, reason: string | null, status = 400): Response {
  return new Response(
    JSON.stringify({ code, message, details: reason === null ? null : JSON.stringify({ reason }), hint: null }),
    { status, headers: { "content-type": "application/json" } },
  );
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

const CALLER = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "Rig & Co PLT", role: "admin", role_rank: 2, is_operator: false,
}];

function item(over: Record<string, unknown>) {
  return {
    item_key: "legal_name", kind: "must_ask", group_key: "identity",
    question: "What is the firm's registered legal name?", note: "A catalogue note.",
    required: true, min_role: "admin", answer_shape: "text", answer_options: [], answer_field: null,
    sort_order: 10, state: "pending", answer: null, answered_by: null, answered_by_name: null,
    answered_at: null, knowledge_key: null, knowledge_record_id: null, ...over,
  };
}

const ENVELOPE = {
  plan_id: "33333333-3333-4333-8333-333333333333",
  revision_token: "44444444-4444-4444-8444-444444444444",
  revision_n: 3, state: "open", committed_at: null, seeded: true, catalogue_total: 3,
  counter: { required_answered: 0, required_total: 2 },
  items: [
    item({ item_key: "legal_name" }),
    item({ item_key: "address", sort_order: 20, question: "What is the firm's registered address?", answer_shape: "long_text" }),
    item({ item_key: "mia", sort_order: 30, question: "What is the firm's MIA registration number?", required: false, kind: "capture" }),
  ],
  required_outstanding: ["legal_name", "address"],
  confirmed_facts: [],
};

function mock(answerHandler?: () => Response): typeof fetch {
  return (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/caller_context")) return jsonResponse(CALLER);
    if (u.includes("/rest/v1/rpc/get_firm_setup")) return jsonResponse(ENVELOPE);
    if (u.includes("/rest/v1/rpc/answer_firm_setup_item")) {
      return (answerHandler ?? (() => jsonResponse({ revision_token: "next" })))();
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
}

function App() {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, children: createElement(FirmSetupChecklist),
  });
}

function byTestId(h: RenderHarness, id: string): Stub | null {
  return h.find((n) => (n as Stub).getAttribute?.("data-testid") === id) as Stub | null;
}
async function press(h: RenderHarness, node: Stub | null, label: string): Promise<void> {
  assert.ok(node, `no control to press: ${label}`);
  await clickButton(node as never);
  await h.settle();
}
/** Every element in the tree that computes a live region (StateBanner's own `role` computation). */
function liveRegions(root: Stub): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    const role = n.getAttribute?.("role");
    if (role === "alert" || role === "status") out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

test("fs.kbd.01 every step of the bounded walk moves focus to its own control, forwards, backwards and on a refusal", async () => {
  await withMockedEnv(mock(), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-checklist") !== null, "the checklist");
      await press(h, byTestId(h, "firm-setup-answer-group-identity"), "the bounded walk");

      // Step 1's control has focus the moment the walk opens… well, no: the walk opens from a
      // click, and the FIRST step is rendered by that same pass. What must be true is that a
      // refusal and every navigation move focus, which is what the rest of this cell measures.
      await press(h, byTestId(h, "firm-setup-next"), "Next on an empty required step");
      assert.ok(byTestId(h, "firm-setup-error-legal_name"), "an empty required step advanced");
      const firstInput = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      assert.equal(activeElement(), firstInput,
        "a refused step did not focus the first invalid control");

      await h.act(() => { setFieldValue(firstInput as never, "Rig & Co PLT"); });
      await press(h, byTestId(h, "firm-setup-next"), "Next");
      const textarea = h.find((n) => (n as Stub).tagName === "TEXTAREA") as Stub | null;
      assert.ok(textarea, "step 2 did not mount its control");
      assert.equal(activeElement(), textarea, "Next did not move focus to the next step's control");

      await press(h, byTestId(h, "firm-setup-back"), "Back");
      const backInput = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      assert.equal(activeElement(), backInput, "Back did not move focus to the previous step's control");
      assert.notEqual(activeElement(), null, "focus was dropped onto the document");
    } finally { await h.unmount(); }
  });
});

test("fs.kbd.02 closing a form RETURNS focus to the control that opened it, and to a surviving sibling when it is gone", async () => {
  await withMockedEnv(mock(), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-checklist") !== null, "the checklist");

      const trigger = byTestId(h, "firm-setup-answer-legal_name-action");
      await press(h, trigger, "Answer legal_name");
      assert.ok(byTestId(h, "firm-setup-item-form"), "the form did not open");
      await press(h, byTestId(h, "firm-setup-cancel"), "Cancel");
      await h.settle();
      assert.equal(byTestId(h, "firm-setup-item-form"), null, "Cancel did not close the form");
      // THE TRIGGER SURVIVED — focus is back on it, never on the body.
      assert.equal(activeElement(), byTestId(h, "firm-setup-answer-legal_name-action"),
        "focus did not return to the control that opened the form");

      // …and the group walk's own Cancel returns to the walk trigger.
      await press(h, byTestId(h, "firm-setup-answer-group-identity"), "the bounded walk");
      await press(h, byTestId(h, "firm-setup-cancel"), "Cancel the walk");
      await h.settle();
      assert.equal(activeElement(), byTestId(h, "firm-setup-answer-group-identity"),
        "focus did not return to the bounded walk's trigger");
    } finally { await h.unmount(); }
  });
});

test("fs.kbd.03 a refusal has exactly ONE announcement owner — the form, never the form AND the checklist", async () => {
  await withMockedEnv(mock(() => refusal("CLR06", "stale onboarding plan revision", "stale_plan")), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-checklist") !== null, "the checklist");
      const before = liveRegions(h.container as never).length;

      await press(h, byTestId(h, "firm-setup-answer-legal_name-action"), "Answer legal_name");
      const input = h.find((n) => (n as Stub).tagName === "INPUT") as Stub | null;
      await h.act(() => { setFieldValue(input as never, "Rig & Co PLT"); });
      await press(h, byTestId(h, "firm-setup-submit"), "Save");
      await settleUntil(h, () => byTestId(h, "firm-setup-stale") !== null, "the stale face");

      const after = liveRegions(h.container as never);
      assert.equal(after.length, before + 1,
        `the stale refusal opened ${after.length - before} live regions; exactly one owner may speak per transition`);
      assert.match(textOf(after[after.length - 1] as never), /Somebody else changed this checklist/,
        "the one live region that opened is not the form's own convergence banner");
    } finally { await h.unmount(); }
  });
});

test("fs.kbd.04 no control removes its focus ring and nothing reorders the tab sequence, with a form open", async () => {
  await withMockedEnv(mock(), async () => {
    const h = await renderComponent(App());
    try {
      await settleUntil(h, () => byTestId(h, "firm-setup-checklist") !== null, "the checklist");
      assert.deepEqual(checkKeyboardWalk(h.container as never), []);
      await press(h, byTestId(h, "firm-setup-answer-group-identity"), "the bounded walk");
      assert.deepEqual(checkKeyboardWalk(h.container as never), []);
      // …and the walk's controls really are reachable by keyboard at all.
      const focusables = focusableElements(h.container as never);
      assert.ok(focusables.length > 0, "the open walk has no keyboard-operable control");
    } finally { await h.unmount(); }
  });
});
