// GATE (c) — keyboard-walk tests for T11's onboarding checklist card. Proves
// the two dialog-testing laws (apps/web/AGENTS.md): a real refusal through
// Confirm (via `clickButton`, never `h.fireEvent` on portaled content) closes
// the dialog and renders the CLR code + message VERBATIM in the card's own
// persistent banner AFTER the dialog closes; a real Cancel (via `clickButton`
// on the base-ui `DialogClose` control) closes the dialog too, proven by the
// dialog's own Confirm control being GONE from document.body afterward.
//
// rev-t11 fix round (F1/F2/F3 — F5/F6 are BeginOnboardingCard's own file,
// onboarding-begin-keyboard.test.tsx): F1 pins that a REFUSED resolve keeps
// the human's typed text (N13 law); F2 pins each of the four typed
// commit-block reasons, with a door-call counter proving the gate actually
// blocks the attempt AND a positive control proving the counter counts when
// the gate passes; F3 replaces the vacuous "dialog closed" assertion (it
// matched a string from the RESOLVE dialog while testing the COMMIT dialog)
// with a discriminating one — the identity-exclusion pattern the CANCEL test
// below already used correctly.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, clickButton, setFieldValue } from "../../test/hookHarness";
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
const COMMITTED_PLAN = {
  ...OPEN_PLAN, state: "committed", committed_at: "2026-08-15T00:00:00Z", committed_by: "u1",
};
// Every required_for_commit item already answered/resolved — Confirm-commit
// is reachable without typing anything, so this file's own click is what is
// under test, not a field-gating detail already covered elsewhere.
const SETTLED_ITEM = {
  id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name",
  question: "Legal name", answer: "Rome Public Advisory", state: "answered", required_for_commit: true,
  answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};
const PENDING_REQUIRED_ITEM = {
  id: "i2", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "fye",
  question: "Financial year end", answer: null, state: "pending", required_for_commit: true,
  answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
};
const CLIENT_ONBOARDING = { id: "c1", name: "Rome Public Advisory", status: "onboarding" };
const CLIENT_ACTIVE = { id: "c1", name: "Rome Public Advisory", status: "active" };
const FINALIZED_SEED = [{ id: "seed-1" }];
const NO_SEED: unknown[] = [];

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

/** Builds the standard onboarding read mock, tracking every commit-door call
 *  into `commitCalls` — the shared "door-call counter" F2's fixtures assert
 *  against. `commitResponse` is a `() => Response` so a caller can wire a
 *  refusal, a success, or (in the four gate fixtures) a THROW if the door is
 *  ever reached at all — the strongest possible "never attempted" proof. */
function buildMock(args: {
  plan?: unknown;
  items: unknown[];
  client?: unknown;
  seed?: unknown[];
  commitResponse?: () => Response;
}): { impl: typeof fetch; commitCalls: number[] } {
  const commitCalls: number[] = [];
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([args.plan ?? OPEN_PLAN]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse(args.items);
    if (url.includes("/rest/v1/clients")) return jsonResponse([args.client ?? CLIENT_ONBOARDING]);
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse(args.seed ?? FINALIZED_SEED);
    if (url.includes("/rpc/commit_client_onboarding")) {
      commitCalls.push(1);
      if (!args.commitResponse) throw new Error("commit_client_onboarding must NEVER be called — the client-side gate should have blocked this attempt");
      return args.commitResponse();
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { impl, commitCalls };
}

test("COMMIT refusal: a real click on Confirm (clickButton) closes the dialog, and the CLR code + message render VERBATIM in the card's own persistent banner", async () => {
  const { impl, commitCalls } = buildMock({
    items: [SETTLED_ITEM],
    commitResponse: () =>
      jsonResponse({ code: "CLR05", message: "onboarding commit requires a non-contributor checker", details: '{"reason":"distinct_checker"}' }, 400),
  });

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Commit onboarding");
      assert.ok(trigger, "the Commit-onboarding trigger must render");
      assert.equal((trigger as unknown as { disabled: boolean }).disabled, false, "the gate passes for this fixture — Confirm must be reachable");
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
      // The failure path awaits a full reload (4 sequential getRows calls,
      // now including opening_seed_registry) before settling — more
      // macrotask hops than a plain success path.
      for (let i = 0; i < 18; i++) await h.settle();

      assert.equal(commitCalls.length, 1, "exactly one governed call — never a batch, never zero");

      // F3 fix (rev-t11): the OLD assertion here matched
      // /Resolve this onboarding item/ — the RESOLVE dialog's own title,
      // never present in THIS test at all, so it was vacuously true both
      // before and after the click (deleting `setOpen(false)` still passed
      // 2/2). The discriminating check: the COMMIT dialog's own SECOND
      // "Commit onboarding" button (the one this test just proved distinct
      // from the trigger, above) must be GONE — the same identity-exclusion
      // idiom the CANCEL test below already uses correctly.
      const confirmStillThere = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Commit onboarding" && (n as unknown) !== (trigger as unknown),
      );
      assert.equal(confirmStillThere, null, "the dialog's own Confirm control must be GONE after Confirm settles — the dialog genuinely closed");

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
  const { impl } = buildMock({ items: [SETTLED_ITEM] });

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

// ---------------------------------------------------------------------------
// F1 — a REFUSED resolve must not wipe the human's typed text (N13 law).
// ---------------------------------------------------------------------------

test("RESOLVE refusal: the typed resolution SURVIVES a refusal — only a SUCCESS clears the field (N13 law; mutant: move the clear back outside act's onOk -> RED)", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rest/v1/onboarding_plans")) return jsonResponse([OPEN_PLAN]);
    if (url.includes("/rest/v1/onboarding_plan_items")) return jsonResponse([PENDING_REQUIRED_ITEM]);
    if (url.includes("/rest/v1/clients")) return jsonResponse([CLIENT_ONBOARDING]);
    if (url.includes("/rest/v1/opening_seed_registry")) return jsonResponse(NO_SEED);
    if (url.includes("/rpc/resolve_onboarding_plan_item")) {
      return jsonResponse({ code: "CLR04", message: "bookkeeper role or higher is required" }, 400);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  const typed = "FYE is 31 December, confirmed with the director on 2026-08-29";

  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Resolve");
      assert.ok(trigger, "the Resolve trigger must render for the pending item");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      const textarea = findIn(body as never, (n) => n.tagName === "TEXTAREA");
      assert.ok(textarea, "the resolution field must be reachable");
      await h.act(() => { setFieldValue(textarea as never, typed); });

      const confirmButton = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Resolve" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmButton, "the dialog's own Confirm control must render, distinct from the trigger");
      await h.act(() => clickButton(confirmButton as never));
      for (let i = 0; i < 18; i++) await h.settle();

      const bodyText = textOf(body as never);
      assert.match(bodyText, /CLR04/, "the refusal must render verbatim (this half already worked before the fix)");
      assert.match(bodyText, /bookkeeper role or higher/, "the DB's own message, verbatim");

      // RE-OPEN the SAME row's dialog (it closed on settle, per
      // OnboardingDoorDialog's own "closes once the attempt SETTLES" law)
      // and read the field back — the discriminating proof.
      const triggerAgain = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Resolve");
      assert.ok(triggerAgain, "the Resolve trigger must still render after a refusal — the item is still pending");
      await h.fireEvent(triggerAgain!, "click");
      for (let i = 0; i < 6; i++) await h.settle();

      // Read the value React itself last rendered onto the REOPENED
      // (freshly-mounted, per base-ui's own unmount-on-close default)
      // textarea's own props — the SAME `__reactProps$...` mechanism
      // `setFieldValue`/`clickButton` already rely on — rather than the raw
      // DOM property, which a fresh stub node's own value-tracking quirks
      // make an unreliable read in this harness (the exact precedent
      // `components/documents/coding-lane-keyboard.test.tsx`'s own
      // "vendor could not be matched" refusal-survives-reopen test uses).
      const reopenedField = findIn(body as never, (n) => n.tagName === "TEXTAREA") as unknown as Record<string, unknown> | null;
      assert.ok(reopenedField, "the resolution field must be reachable again");
      const propsKey = Object.keys(reopenedField!).find((k) => k.startsWith("__reactProps"));
      const reactValue = propsKey ? (reopenedField![propsKey] as { value?: string }).value : undefined;
      assert.equal(reactValue, typed, "N13: a REFUSED act must KEEP the typed text — it must not have been silently discarded");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

// ---------------------------------------------------------------------------
// F2 — the commit pre-gate, pinned in its PROTECTIVE direction: for each of
// the four typed reasons, a fixture that makes exactly that conjunct false
// must (a) disable the DIALOG's own Confirm — never the always-enabled
// trigger, `OnboardingDoorDialog`'s own contract ("Gates the CONFIRM button
// — never the trigger") — read live, never inferred, (b) render that
// reason's own message, and (c) leave the door-call counter at 0. A trailing
// positive control proves the SAME counter counts once every conjunct
// passes — without it, an always-0 counter would trivially "pass" every
// negative fixture for the wrong reason.
// ---------------------------------------------------------------------------

/** Opens the Commit dialog and returns its own Confirm node (distinct from
 *  the always-enabled trigger by identity — the SAME exclusion idiom every
 *  other test in this file uses), so a caller can read its LIVE `disabled`
 *  property. */
async function openCommitDialog(h: Awaited<ReturnType<typeof mount>>["h"], body: Node): Promise<{ trigger: Node; confirmButton: Node }> {
  const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Commit onboarding");
  assert.ok(trigger, "the Commit trigger must still RENDER (gating shapes, never hides)");
  await h.fireEvent(trigger!, "click");
  for (let i = 0; i < 6; i++) await h.settle();
  const confirmButton = findIn(
    body,
    (n) => n.tagName === "BUTTON" && textOf(n as never) === "Commit onboarding" && (n as unknown) !== (trigger as unknown),
  );
  assert.ok(confirmButton, "the dialog's own Confirm control must render, distinct from the trigger");
  return { trigger: trigger as Node, confirmButton: confirmButton as Node };
}

test("COMMIT gate — plan_not_open: a settled plan offers NO commit door at all, and the door is never called", async () => {
  // CB-AE2E-023 CHANGED WHAT THIS CELL CAN PROVE, and strengthened it. This used to open the
  // commit dialog on a COMMITTED plan and assert its Confirm was DISABLED with the
  // `plan_not_open` reason rendered inside. There is no such dialog any more: a non-open plan
  // routes to the settled RECEIPT, which renders no Commit and no Cancel trigger — so the
  // dialog that could only ever be refused is not reachable, rather than reachable-and-inert.
  //
  // `commitBlockReason`'s own `plan_not_open` arm STAYS in the card. It is unreachable from
  // this face now, and it is kept deliberately: it mirrors the live door's ORDERED arms, and
  // its sibling `client_not_onboarding` is only correct because `plan_not_open` is tested
  // first (0018_gate_k_domain.sql SS4's site-2 split pins that precedence). Its unit-level
  // proof lives in this file's remaining three gate cells, which all still open a real dialog.
  const { impl, commitCalls } = buildMock({ plan: COMMITTED_PLAN, items: [SETTLED_ITEM], client: CLIENT_ONBOARDING, seed: FINALIZED_SEED });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      assert.equal(
        h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Commit onboarding"),
        null,
        "a committed plan must offer no Commit trigger — the dialog behind it can only be refused",
      );
      assert.equal(
        h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Cancel onboarding"),
        null,
        "and no Cancel trigger either (cancel_client_onboarding refuses on p.state<>'open', 0017:2857)",
      );
      // The receipt is what stands in its place — DISCRIMINATING: this line exists only on the
      // settled face.
      assert.match(textOf(body as never), /Plan revision/, "the settled receipt renders in its place");
      assert.equal(commitCalls.length, 0, "the door must never be called while this conjunct is false");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("COMMIT gate — client_not_onboarding blocks: the dialog's own Confirm is disabled, the reason renders, the door is never called", async () => {
  const { impl, commitCalls } = buildMock({ plan: OPEN_PLAN, items: [SETTLED_ITEM], client: CLIENT_ACTIVE, seed: FINALIZED_SEED });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const { confirmButton } = await openCommitDialog(h, body as never);
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "client_not_onboarding must disable the dialog's own Confirm");
      assert.match(textOf(body as never), /This client's status is no longer "onboarding"\./, "the client_not_onboarding reason must render inside the open dialog");
      assert.equal(commitCalls.length, 0, "the door must never be called while this conjunct is false");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("COMMIT gate — questions_unresolved blocks: the dialog's own Confirm is disabled, the reason renders, the door is never called", async () => {
  const { impl, commitCalls } = buildMock({ plan: OPEN_PLAN, items: [PENDING_REQUIRED_ITEM], client: CLIENT_ONBOARDING, seed: FINALIZED_SEED });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const { confirmButton } = await openCommitDialog(h, body as never);
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "questions_unresolved must disable the dialog's own Confirm");
      assert.match(textOf(body as never), /A required item is still pending — resolve it before committing\./, "the questions_unresolved reason must render inside the open dialog");
      assert.equal(commitCalls.length, 0, "the door must never be called while this conjunct is false");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("COMMIT gate — opening_position_required blocks: the dialog's own Confirm is disabled, the reason renders, the door is never called", async () => {
  const { impl, commitCalls } = buildMock({ plan: OPEN_PLAN, items: [SETTLED_ITEM], client: CLIENT_ONBOARDING, seed: NO_SEED });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const { confirmButton } = await openCommitDialog(h, body as never);
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, true, "opening_position_required must disable the dialog's own Confirm");
      assert.match(textOf(body as never), /An opening position is required before activation/, "the opening_position_required reason must render inside the open dialog");
      assert.equal(commitCalls.length, 0, "the door must never be called while this conjunct is false");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("COMMIT gate — POSITIVE CONTROL: all four conjuncts pass -> Confirm is reachable -> a real click calls the door EXACTLY once", async () => {
  const { impl, commitCalls } = buildMock({
    plan: OPEN_PLAN,
    items: [SETTLED_ITEM],
    client: CLIENT_ONBOARDING,
    seed: FINALIZED_SEED,
    commitResponse: () => jsonResponse({ client_id: "c1", plan_id: "plan-1", status: "active", review_maker: "u1", attestation_kind: "distinct_checker" }),
  });
  await withMockedEnv(impl, async () => {
    const { h, body } = await mount();
    try {
      const { confirmButton } = await openCommitDialog(h, body as never);
      assert.equal((confirmButton as unknown as { disabled: boolean }).disabled, false, "with every conjunct satisfied, the dialog's own Confirm must be reachable — read live, not inferred");
      await h.act(() => clickButton(confirmButton as never));
      for (let i = 0; i < 18; i++) await h.settle();

      assert.equal(commitCalls.length, 1, "the counter must count exactly once when the gate genuinely passes — proves the counter mechanism itself works");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
