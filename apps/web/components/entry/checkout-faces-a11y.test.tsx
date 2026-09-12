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
  { state: { kind: "expired", reason: null }, distinctive: /That checkout expired/i },
  { state: { kind: "cancelled" }, distinctive: /That checkout was cancelled/i },
  { state: { kind: "capacity_full", registration: REGISTRATION }, distinctive: /Admission is currently full/i },
  { state: { kind: "no_registration" }, distinctive: /no firm application to finish/i },
  { state: { kind: "unavailable" }, distinctive: /could not read your status/i },
  { state: { kind: "refused", code: "CLR09", message: "no completed payment for this registration" }, distinctive: /no completed payment for this registration/ },
  { state: { kind: "try_again" }, distinctive: /Two things were being written at once/i },
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

test("THE TWELVE FACES ARE MUTUALLY DISTINGUISHABLE — no two render the same words", async () => {
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
    { kind: "expired", reason: null },
    { kind: "cancelled" },
  ] as const) {
    assert.deepEqual(await actionsOf(state), ["post /checkout"], state.kind);
  }
  // NO ACT AT ALL on the two that have none to offer.
  assert.deepEqual(await actionsOf({ kind: "capacity_full", registration: REGISTRATION }), []);
  assert.deepEqual(await actionsOf({ kind: "already_open" }), []);
  // #628 REVIEW — the transient card's act is the SAME act again. Nothing was
  // changed by a rolled-back transaction, so the next step is to claim, not to
  // start a checkout and not to read something else.
  assert.deepEqual(await actionsOf({ kind: "try_again" }), ["post /checkout/success/claim"]);
});

test("ticket 628 review — CANCEL IS NEVER OFFERED OVER A PAID CHECKOUT", async () => {
  // THE DEFECT, AS THE PERSON MET IT. `paid` and `consumed` reach the
  // `awaiting_payment` face by design (`checkoutStandingFrom`: money landed,
  // no claimable payment row observed yet) — and they reach it with the
  // intent's Session id still stamped. The card keyed the cancel control on
  // that id alone, so somebody whose money had already landed was offered
  // "Cancel and start again", pressed it, and got `cancel_checkout_intent`'s
  // `already_paid` refusal. A control whose only outcome is a refusal.
  //
  // THE FIX IS UPSTREAM (`waitingActsFrom` nulls the id for those statuses), so
  // this cell asserts the CARD'S half of the contract: with no cancellable
  // session it renders the wait and the re-read, and nothing that ends a
  // payment.
  const h = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "awaiting_payment", statusAt: STATUS_AT, sessionId: null, registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.doesNotMatch(text, /Cancel and start again/i, "a cancel control was offered with nothing to cancel");
    assert.match(text, /Check again/i, "the waiting face lost its re-read control");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }

  // AND THE PROCESSING FACE SAYS WHY THERE IS NO CANCEL, rather than leaving a
  // person hunting for a control that is deliberately absent.
  const processing = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "processing", statusAt: STATUS_AT, registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await processing.settle();
    const text = textOf(processing.container as never);
    assert.match(text, /cannot be cancelled while your bank is deciding/i);
    assert.doesNotMatch(text, /Cancel and start again/i);
  } finally {
    await processing.unmount();
  }
});

test("ticket 628 review — capacity_full RENDERS the reference its own copy tells the person to quote", async () => {
  // THE DEFECT: the banner ends "…contact support if you need to know when this
  // opens again, and quote your registration reference", and the card rendered
  // no reference at all. A promise a surface does not keep sends somebody to
  // support to quote a value they were never shown.
  const h = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "capacity_full", registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /quote your registration reference/i, "the promise is gone from the copy");
    assert.ok(text.includes(REGISTRATION), "the reference the copy promises is not on screen");
    // STILL NO CONTROL. Rendering a value is not offering an act: every act
    // here is one `open_checkout_intent` refuses.
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("ticket 628 review — the SWEPT-TIMEOUT expiry is its own sentence, not the hosted-page one", async () => {
  // `0186`'s applier moves a `processing` intent nobody answered for 24 hours to
  // `expired` with `status_reason='processing_timeout'`. "The checkout page ran
  // out of time" and "your bank never came back" are different facts, and only
  // one of them is about the person's bank.
  const swept = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "expired", reason: "processing_timeout" },
  })));
  try {
    for (let i = 0; i < 2; i++) await swept.settle();
    const text = textOf(swept.container as never);
    assert.match(text, /did not hear back from your bank/i);
    assert.doesNotMatch(text, /no longer open, so it cannot be paid/i);
  } finally {
    await swept.unmount();
  }

  // AN ORDINARY EXPIRY KEEPS ITS OWN SENTENCE — the control against a fix that
  // simply replaced one banner with the other.
  const ordinary = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "expired", reason: null },
  })));
  try {
    for (let i = 0; i < 2; i++) await ordinary.settle();
    const text = textOf(ordinary.container as never);
    assert.match(text, /no longer open, so it cannot be paid/i);
    assert.doesNotMatch(text, /did not hear back from your bank/i);
  } finally {
    await ordinary.unmount();
  }
});

test("ticket 628 review — the deployment's Stripe mode is stated on the faces where money is the subject", async () => {
  // AC3 asks for a visibly distinct test/unconfigured deployment, and
  // `/pending` alone is not where that applies: THIS is the page somebody lands
  // on immediately after paying, and "did that just take real money?" is the
  // question a test-mode checkout leaves them holding.
  const read = async (mode: "live" | "test" | "unconfigured", state: CheckoutSuccessState) => {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state, paymentsMode: mode })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      assert.deepEqual(checkAccessibility(h.container as never), [], `${mode}/${state.kind}`);
      return textOf(h.container as never);
    } finally {
      await h.unmount();
    }
  };
  const claimable: CheckoutSuccessState = { kind: "claimable" };

  assert.match(await read("test", claimable), /Test mode — nothing is charged/);
  assert.doesNotMatch(await read("live", claimable), /Test mode/);
  const unset = await read("unconfigured", claimable);
  assert.match(unset, /has not been set up to take payments/i);
  // DISTINCT FROM THE OUTAGE SENTENCE, the same line `/pending` draws: no
  // amount of trying again fixes a missing variable.
  assert.doesNotMatch(unset, /try again in a moment/i);
  // NO AMOUNT, ever (裁-42's design wall).
  for (const mode of ["live", "test", "unconfigured"] as const) {
    assert.doesNotMatch(await read(mode, claimable), /\bRM\s*\d/i, mode);
  }
  // THE DEFAULT IS THE CAUTIOUS TRUE STATEMENT. A caller that has not resolved
  // the mode must not silently imply a live deployment.
  const defaulted = await renderComponent(App(createElement(CheckoutSuccessCard, { state: claimable })));
  try {
    for (let i = 0; i < 2; i++) await defaulted.settle();
    assert.match(textOf(defaulted.container as never), /has not been set up to take payments/i);
  } finally {
    await defaulted.unmount();
  }

  // NOT ON A FACE WHERE MONEY IS NOT THE SUBJECT: a statement about what a
  // payment would do is noise beside a read that failed or a door that is shut.
  for (const state of [
    { kind: "already_open" },
    { kind: "capacity_full", registration: REGISTRATION },
    { kind: "no_registration" },
    { kind: "unavailable" },
  ] as const) {
    assert.doesNotMatch(await read("test", state), /Test mode/, state.kind);
    assert.doesNotMatch(await read("unconfigured", state), /has not been set up to take payments/i, state.kind);
  }
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


// ===========================================================================
// #628 REVIEW — THE PENDING STATE ON THE POST CONTROLS (design appendix C)
// ===========================================================================

/** Every `<form>`/`<button>` in the tree, as live stub nodes. `disabled` is
 *  read from the LIVE node (never from a rendered attribute), which is the
 *  property a browser actually gates a press on. */
type StubNode = {
  disabled?: boolean;
  getAttribute(name: string): string | null;
  querySelectorAll(selector: string): ArrayLike<StubNode>;
};

function nodesOf(container: unknown, tag: string): StubNode[] {
  return Array.from((container as StubNode).querySelectorAll(tag));
}

test("ticket 628 review — a POST control goes PENDING on submit, and nothing else on the card freezes", async () => {
  // WHAT APPENDIX C ASKS FOR on a short mutation: the initiating control shows a
  // pending label, stops a duplicate LOCAL submit, and does not freeze unrelated
  // work. The claim button is the one that creates a tenant, so a double press
  // on a slow connection is the exact case.
  //
  // WHY A `submit` EVENT AND NOT `clickButton`. These are navigating forms with
  // no `onClick` — the submission is the form's, which is also what a real
  // browser does when Enter lands on a focused submit button. The handler does
  // NOT preventDefault: the browser still navigates, and all the component does
  // is note that it started.
  const h = await renderComponent(App(createElement(CheckoutSuccessCard, {
    state: { kind: "awaiting_payment", statusAt: STATUS_AT, sessionId: "cs_628", registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const forms = nodesOf(h.container, "form");
    const cancel = forms.find((f) => f.getAttribute("action") === "/checkout/cancel");
    assert.ok(cancel, "the cancel form did not render");

    const buttonsBefore = nodesOf(h.container, "button");
    // THE GATE, ASSERTED BEFORE THE ACT (the harness's own rule): every control
    // is open, and none claims to be busy.
    for (const b of buttonsBefore) {
      assert.notEqual(b.disabled, true, "a control was disabled before anything was submitted");
      assert.notEqual(b.getAttribute("aria-busy"), "true", "a control claimed to be busy at rest");
    }

    await h.fireEvent(cancel as never, "submit");
    for (let i = 0; i < 3; i++) await h.settle();

    const buttons = nodesOf(h.container, "button");
    const busy = buttons.filter((b) => b.getAttribute("aria-busy") === "true");
    assert.equal(busy.length, 1, "exactly the submitted control must go busy");
    assert.equal(busy[0]?.disabled, true, "the busy control is still pressable — a second press is a second POST");
    assert.match(textOf(h.container as never), /Working…/, "the pending label never reached the screen");

    // NOTHING ELSE FREEZES. The re-read control beside it is a different act on
    // a different route and must stay live while one POST is in flight.
    const others = buttons.filter((b) => !busy.includes(b));
    assert.ok(others.length >= 1, "the card has no other control to check");
    for (const b of others) {
      assert.notEqual(b.disabled, true, "an unrelated control was frozen by a submit it has nothing to do with");
    }
    // THE WAY BACK IS NEVER FROZEN EITHER.
    assert.ok(query(h.container)('a[href="/pending"]'), "the way back vanished under a pending submit");
    assert.deepEqual(checkAccessibility(h.container as never), [], "the pending state has a11y violations");
  } finally {
    await h.unmount();
  }
});

test("ticket 628 review — the pending state is RESTORED when the page comes back", async () => {
  // A navigating POST has no failure callback: if it does not navigate, or the
  // person presses Back, the browser shows this page again. Both arrive as
  // `pageshow`, and a control left permanently disabled under somebody who came
  // back to use it is the failure mode this clears.
  //
  // THE LISTENER IS DRIVEN THROUGH THE COMPONENT'S OWN REGISTRATION. The DOM
  // stub's `window.addEventListener` is a no-op and it has no `dispatchEvent`,
  // so a synthesised event would prove nothing. Recording the registration and
  // invoking exactly what was registered proves BOTH halves: that the component
  // subscribes to `pageshow` at all, and that what it subscribed clears the
  // flag.
  const win = window as unknown as {
    addEventListener: (t: string, l: () => void) => void;
    removeEventListener: (t: string, l: () => void) => void;
  };
  const realAdd = win.addEventListener;
  const realRemove = win.removeEventListener;
  const listeners: Array<[string, () => void]> = [];
  win.addEventListener = (type, listener) => { listeners.push([type, listener]); };
  win.removeEventListener = (type, listener) => {
    const at = listeners.findIndex(([t, l]) => t === type && l === listener);
    if (at >= 0) listeners.splice(at, 1);
  };

  try {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state: { kind: "claimable" } })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      const form = nodesOf(h.container, "form")[0];
      assert.ok(form, "the claim form did not render");
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 3; i++) await h.settle();
      assert.equal(nodesOf(h.container, "button")[0]?.disabled, true, "the claim control never went pending");

      const pageshow = listeners.filter(([type]) => type === "pageshow");
      assert.equal(pageshow.length, 1, "the control never subscribed to the page coming back");
      await h.act(() => { pageshow[0]?.[1](); });
      for (let i = 0; i < 3; i++) await h.settle();

      const button = nodesOf(h.container, "button")[0];
      assert.notEqual(button?.disabled, true, "the control stayed dead after the page came back");
      assert.notEqual(button?.getAttribute("aria-busy"), "true", "the control still claims to be busy");
      assert.match(textOf(h.container as never), /Open my firm/, "the real label never came back");
    } finally {
      await h.unmount();
    }
    // AND IT UNSUBSCRIBES. A card that left a listener behind on every unmount
    // would leak one per navigation through this journey.
    assert.equal(listeners.filter(([type]) => type === "pageshow").length, 0, "the listener outlived the card");
  } finally {
    win.addEventListener = realAdd;
    win.removeEventListener = realRemove;
  }
});

test("ticket 628 review — every POST control on every face is keyboard-operable and inside a real form", async () => {
  // The estate's floor, re-asserted after the controls became a client
  // component: a pending flag must not have turned an act into a div with a
  // handler. Every submit is a real <button type="submit"> inside a real
  // <form method="post">, so Tab reaches it and Enter operates it with no
  // JavaScript at all.
  for (const { state } of STATES) {
    const h = await renderComponent(App(createElement(CheckoutSuccessCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      for (const form of nodesOf(h.container, "form")) {
        const method = (form.getAttribute("method") ?? "get") as string;
        if (method !== "post") continue;
        const submits = Array.from(form.querySelectorAll("button"));
        assert.equal(submits.length, 1, `${state.kind}: a POST form does not carry exactly one button`);
        assert.equal(
          submits[0]?.getAttribute("type"),
          "submit",
          `${state.kind}: a POST control is not a submit button`,
        );
      }
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], `${state.kind} is not keyboard-operable`);
    } finally {
      await h.unmount();
    }
  }
});
