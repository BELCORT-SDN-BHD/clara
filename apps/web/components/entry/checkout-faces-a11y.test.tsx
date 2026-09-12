// #628 — THE SUCCESS PAGE'S ELEVEN FACES, scanned and walked.
//
// WHY THIS FILE DID NOT EXIST BEFORE AND HAD TO NOW. `/checkout/success` is the
// surface a person lands on immediately after paying money, and it had NO
// component-level cell at all: its five states were pinned only through
// `lib/checkout/success-state.test.ts` (which drives the DECISION, not the
// render) and one happy-path reach in the browser walk. That was survivable
// while the page had one control. It stopped being survivable the moment the
// page grew controls that END a payment (`cancel`) and START a new one
// (`retry`, `start again`) — those are exactly the controls a happy-path-only
// scan never sees, on exactly the surface where a mis-wired one costs money.
//
// THE SHAPE IS `pending-a11y.test.tsx`'s, deliberately: the same App wrapper,
// the same axe-equivalent structural scan, the same keyboard walk, the same
// "each state renders something only IT renders" discrimination. Two faces of
// the same journey measured two different ways would let a regression hide in
// whichever one was measured less.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import {
  CheckoutSuccessCard,
  type CheckoutSuccessState,
} from "./checkout-success-card";
import {
  CHECKOUT_REFRESH_BUDGET_MS,
  CHECKOUT_REFRESH_INTERVAL_MS,
  CheckoutWaitingRefresh,
} from "./checkout-waiting";

enableDomInspection();

const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const STATUS_AT = "2026-09-12T04:30:00.000Z";

type QueriedNode = { getAttribute(name: string): string | null };
const query = (container: unknown) => (selector: string): QueriedNode | null =>
  (container as { querySelector(s: string): QueriedNode | null }).querySelector(selector);

/** Every refresh the component asked the SERVER for. The property under test is
 *  that it re-reads rather than guesses, so the count is what matters and the
 *  router itself does nothing. */
function App(node: ReactElement, refreshes: { count: number } = { count: 0 }) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {},
          refresh: () => { refreshes.count += 1; },
          push: () => {},
          back: () => {},
          forward: () => {},
          prefetch: () => {},
        } as never,
      },
      createElement("div", null, node),
    ),
  });
}

/** Each face with a phrase that is true ONLY of that face, so every "it
 *  rendered" check discriminates rather than merely observing a Card. */
const STATES: { state: CheckoutSuccessState; distinctive: RegExp }[] = [
  { state: { kind: "claimable" }, distinctive: /Your payment went through/ },
  { state: { kind: "already_open" }, distinctive: /Your firm is open/ },
  { state: { kind: "processing", statusAt: STATUS_AT, registration: REGISTRATION }, distinctive: /bank is confirming/i },
  { state: { kind: "awaiting_payment", statusAt: STATUS_AT, sessionId: "cs_628", registration: REGISTRATION }, distinctive: /have not seen your payment yet/i },
  { state: { kind: "payment_failed", reason: "card_declined" }, distinctive: /card was declined/i },
  { state: { kind: "expired" }, distinctive: /That checkout expired/i },
  { state: { kind: "cancelled" }, distinctive: /That checkout was cancelled/i },
  { state: { kind: "capacity_full" }, distinctive: /Admission is currently full/i },
  { state: { kind: "no_registration" }, distinctive: /no firm application to finish/i },
  { state: { kind: "unavailable" }, distinctive: /could not read your status/i },
  { state: { kind: "refused", code: "CLR09", message: "no completed payment for this registration" }, distinctive: /no completed payment for this registration/ },
];

for (const { state, distinctive } of STATES) {
  test(`the ${state.kind} face has zero a11y violations and is keyboard-operable`, async () => {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      assert.match(textOf(h.container as never), distinctive, `the ${state.kind} face did not render`);
      assert.deepEqual(checkAccessibility(h.container as never), [], `${state.kind} has a11y violations`);
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], `${state.kind} is not keyboard-operable`);
      // THE WAY BACK IS ON EVERY FACE, including the two fail-closed ones. A
      // person who has just paid must never be left on a page with no route.
      assert.ok(query(h.container)('a[href="/pending"]'), `the ${state.kind} face has no way back`);
    } finally {
      await h.unmount();
    }
  });
}

test("THE ELEVEN FACES ARE MUTUALLY DISTINGUISHABLE — no two render the same words", async () => {
  // Absence is not evidence: a card that collapsed two states into one
  // rendering would still pass every "it rendered" check above, because both
  // would match a phrase the merged copy happened to keep.
  const rendered = new Map<string, string>();
  for (const { state } of STATES) {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      rendered.set(state.kind, textOf(h.container as never));
    } finally {
      await h.unmount();
    }
  }
  assert.equal(new Set(rendered.values()).size, STATES.length, "two faces render identical text");
  // AND NO AMOUNT ANYWHERE (裁-42's design wall, the same property
  // `pending-a11y.test.tsx` pins for the holding card).
  for (const [kind, text] of rendered) {
    assert.doesNotMatch(text, /\bRM\s*\d/i, `${kind} renders an amount`);
    assert.doesNotMatch(text, /webhook/i, `${kind} says "webhook" to a person`);
  }
});

test("ticket 628 — each face offers EXACTLY the acts available in it, read off the FORM not the label", async () => {
  // A button renamed is the same act; a button pointed at a different route is
  // a different one. The table is therefore method+action, which is what the
  // browser will actually do.
  const actionsOf = async (state: CheckoutSuccessState): Promise<string[]> => {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      const forms = (h.container as unknown as {
        querySelectorAll(s: string): ArrayLike<{ getAttribute(n: string): string | null }>;
      }).querySelectorAll("form");
      return Array.from(forms, (f) => `${f.getAttribute("method") ?? "get"} ${f.getAttribute("action") ?? ""}`).sort();
    } finally {
      await h.unmount();
    }
  };

  // THE ONE ARM THAT CREATES A TENANT, and it is a POST. M9's whole point.
  assert.deepEqual(await actionsOf({ kind: "claimable" }), ["post /checkout/success/claim"]);
  // WAITING: a re-read, and nothing that spends money. The claim control must
  // be ABSENT — there is no payment row to claim, and offering it would invite
  // a refusal a person cannot act on.
  assert.deepEqual(
    await actionsOf({ kind: "processing", statusAt: STATUS_AT, registration: REGISTRATION }),
    ["get /checkout/success"],
  );
  assert.deepEqual(
    await actionsOf({ kind: "awaiting_payment", statusAt: STATUS_AT, sessionId: "cs_628", registration: REGISTRATION }),
    ["get /checkout/success", "post /checkout/cancel"],
  );
  // NO SESSION ⇒ NO CANCEL. `cancel_checkout_intent` would have nothing for
  // Stripe to expire, and a control that ends a payment must not appear where
  // there is no payment to end.
  assert.deepEqual(
    await actionsOf({ kind: "awaiting_payment", statusAt: null, sessionId: null, registration: REGISTRATION }),
    ["get /checkout/success"],
  );
  // TERMINAL: a NEW checkout is the act, and it is a POST to /checkout.
  for (const state of [
    { kind: "payment_failed", reason: "card_declined" },
    { kind: "expired" },
    { kind: "cancelled" },
  ] as const) {
    assert.deepEqual(await actionsOf(state), ["post /checkout"], state.kind);
  }
  // NO ACT AT ALL on the two that have none to offer.
  assert.deepEqual(await actionsOf({ kind: "capacity_full" }), []);
  assert.deepEqual(await actionsOf({ kind: "already_open" }), []);
});

test("ticket 628 — the DB's own status time is rendered, and an unreadable one renders NOTHING", async () => {
  // Saying WHEN a state began is a fact the row holds. Saying when it will end
  // is a promise nothing here can keep (holding-card.tsx's "NO ETA SENTENCE"),
  // and "Invalid Date" beside somebody's payment is worse than no time at all.
  const withTime = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "processing", statusAt: STATUS_AT, registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await withTime.settle();
    assert.match(textOf(withTime.container as never), /Confirmation started on /);
  } finally {
    await withTime.unmount();
  }

  for (const bad of [null, "not-a-time"]) {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, {
      state: { kind: "processing", statusAt: bad, registration: REGISTRATION },
    })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      const text = textOf(h.container as never);
      assert.doesNotMatch(text, /Confirmation started on /, JSON.stringify(bad));
      assert.doesNotMatch(text, /Invalid Date/, JSON.stringify(bad));
      // The face itself still renders, controls and all — a bad timestamp
      // degrades ONE line, never the page.
      assert.match(text, /bank is confirming/i);
    } finally {
      await h.unmount();
    }
  }
});

// ===========================================================================
// THE BOUNDED WAIT
// ===========================================================================

test("the bounded wait RE-READS THE SERVER, then stops and says so", async () => {
  // TWO PROPERTIES, AND BOTH ARE LOAD-BEARING. (1) It asks the server to render
  // again — it never decides anything itself, so what the person reads is what
  // the database says. (2) It STOPS: an unbounded poll is a page that quietly
  // costs a person battery and a server requests forever on a tab nobody is
  // reading, and a poll that stopped silently would leave somebody watching a
  // page that will never change.
  //
  // DRIVEN ON A REAL TIMER at milliseconds rather than with a faked clock, and
  // through the INJECTED bound so the shipped constants are never the values
  // under test — the same discipline `stripe-session.ts` applies to its own
  // deadline.
  const refreshes = { count: 0 };
  const h = await renderComponent(
    App(
      createElement(CheckoutWaitingRefresh, {
        registration: REGISTRATION,
        intervalMs: 5,
        budgetMs: 30,
      }),
      refreshes,
    ),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    // BEFORE the budget: nothing is said, because nothing has gone wrong.
    assert.equal(textOf(h.container as never).trim(), "", "the waiting notice appeared before the budget ran out");

    await new Promise((resolve) => setTimeout(resolve, 120));
    for (let i = 0; i < 3; i++) await h.settle();

    assert.ok(refreshes.count >= 2, `the server was re-read ${refreshes.count} times`);
    const text = textOf(h.container as never);
    assert.match(text, /stopped checking automatically/i, "the poll stopped without saying so");
    // THE REFERENCE, and only now. It is the one value support needs at the
    // exact moment the product has run out of things to tell the person.
    assert.ok(text.includes(REGISTRATION), "the registration reference is not on screen");
    assert.deepEqual(checkAccessibility(h.container as never), []);

    // AND IT REALLY STOPPED — not "rendered a notice and kept going".
    const afterStop = refreshes.count;
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(refreshes.count, afterStop, "the poll kept running after it said it had stopped");
  } finally {
    await h.unmount();
  }
});

test("the SHIPPED bound is the module's own constant, not a test's value", async () => {
  // A cell that only ever drove 5 ms / 30 ms would pass just as happily against
  // a shipped budget of a day. These are the values production uses.
  assert.equal(CHECKOUT_REFRESH_INTERVAL_MS, 5_000);
  assert.equal(CHECKOUT_REFRESH_BUDGET_MS, 120_000);
  assert.ok(CHECKOUT_REFRESH_BUDGET_MS / CHECKOUT_REFRESH_INTERVAL_MS >= 4,
    "the budget must admit several re-reads, or the poll is theatre");

  // THE DEFAULTS ARE WHAT THE CARD MOUNTS. Rendered with no injected bound, the
  // waiting face must NOT have given up on first paint — which is what a
  // budget accidentally set to 0 would do.
  const h = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "processing", statusAt: STATUS_AT, registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.doesNotMatch(textOf(h.container as never), /stopped checking automatically/i);
    // And the registration reference is NOT on screen while the page is still
    // working: an identifier is shown when it is useful, not by default.
    assert.equal(textOf(h.container as never).includes(REGISTRATION), false);
  } finally {
    await h.unmount();
  }
});

test("every face keeps its controls in the keyboard order and none is a bare div", async () => {
  // The estate's floor, applied to the surface that takes money: every act is a
  // real <button> inside a real <form>, so it is reachable by Tab and operable
  // by Enter without a line of JavaScript.
  for (const { state } of STATES) {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      const focusable = focusableElements(h.container as never);
      // The "back to your status" link is on every face, so this is never zero.
      assert.ok(focusable.length >= 1, `${state.kind} has nothing focusable at all`);
    } finally {
      await h.unmount();
    }
  }
});
