// GATE (b) — structural a11y scan of the holding page, ALL EIGHT states.
//
// The fourth entry face (裁-2 4b). Every state is scanned, not the happy one:
// this is the screen a person lands on when nothing else in the product is
// reachable, and its two fail-closed renderings are exactly the ones a
// happy-path-only scan would never see.
//
// It carries its own real `<h1>` (see the heading cell), so no synthetic
// wrapper is used and nothing here can be masked by one.
//
// GATE (c) IS FOLDED IN at the bottom rather than living in a `pending-keyboard`
// file of its own: the logout button is the ONE control every state shares —
// three states (`pending`, `checkout_open`, `paid`, FS-4 C-6's §2.1 arms) add
// their own checkout-progress control beside it, and the walk below still
// covers all of them generically rather than asserting a fixed control count.

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
import type { HoldingState } from "../../lib/registration/holding-state";
import { HoldingCard } from "./holding-card";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node };

function App(node: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
        } as never,
      },
      createElement("div", null, node),
    ),
  });
}

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const byButtonText = (re: RegExp) => (n: Node) => n.tagName === "BUTTON" && re.test(textOf(n as never));

/** Every state the decision can produce, each with a phrase that is true ONLY
 *  of that rendering — so each cell's "it rendered" check discriminates.
 *  FS-4 C-6 widened six states to eight: `checkout_open` and `paid` are the
 *  two new §2.1 arms (holding-state.ts's header). */
const STATES: { state: HoldingState; distinctive: RegExp }[] = [
  { state: { kind: "pending", firmName: "ROME PROPERTIES" }, distinctive: /Your registration is with us/ },
  { state: { kind: "checkout_open", firmName: "ROME PROPERTIES" }, distinctive: /Your firm is not open yet/ },
  { state: { kind: "paid", firmName: "ROME PROPERTIES" }, distinctive: /finish opening your firm/i },
  { state: { kind: "rejected", firmName: "ROME PROPERTIES", reason: "the firm name matches an existing member firm" }, distinctive: /the firm name matches an existing member firm/ },
  { state: { kind: "rejected", firmName: "ROME PROPERTIES", reason: null }, distinctive: /No reason was recorded/ },
  { state: { kind: "approved", firmName: "ROME PROPERTIES" }, distinctive: /Your registration was accepted/ },
  { state: { kind: "invite-expected" }, distinctive: /No registration request was found/ },
  { state: { kind: "unidentified" }, distinctive: /couldn't confirm who you are/ },
  { state: { kind: "read-failed" }, distinctive: /couldn't read your registration/ },
];

for (const { state, distinctive } of STATES) {
  const label = state.kind === "rejected" && state.reason === null ? "rejected (no reason)" : state.kind;

  test(`the ${label} state has zero a11y violations`, async () => {
    const h = await renderComponent(App(createElement(HoldingCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      assert.match(textOf(h.container as never), distinctive, `the ${label} state did not render`);
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });

  test(`the ${label} state is keyboard-operable and keeps the ONE way out`, async () => {
    const h = await renderComponent(App(createElement(HoldingCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      // The one action that must stay reachable in EVERY state — including the
      // two fail-closed ones, which is the whole reason logout is exempt from
      // the scope spine "by necessity". A holding page that lost its logout in
      // its error state would strand the person completely.
      const out = findIn(h.container as never, byButtonText(/Sign out/));
      assert.ok(out, `the ${label} state has no way out`);
      assert.ok(
        focusableElements(h.container as never).includes(out as never),
        "the logout control must be keyboard-reachable",
      );
      assert.deepEqual(checkKeyboardWalk(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
}

test("THE HEADING IS REAL — no synthetic h1 is propping these scans up", async () => {
  const h = await renderComponent(App(createElement(HoldingCard, { state: { kind: "invite-expected" } })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const h1 = findIn(h.container as never, (n) => n.tagName === "H1");
    assert.ok(h1, "the holding card renders no <h1> of its own");
    assert.match(textOf(h1 as never), /No registration request was found/);
  } finally {
    await h.unmount();
  }
});

test("THE EIGHT STATES ARE MUTUALLY DISTINGUISHABLE — no two render the same words", async () => {
  // The order's own requirement, and the one a per-state scan cannot give: each
  // state must be told apart from the others by what it SAYS, not merely be
  // free of violations. Without this cell, a card that rendered identical copy
  // for all eight would pass every scan above.
  const rendered: string[] = [];
  for (const { state } of STATES) {
    const h = await renderComponent(App(createElement(HoldingCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      rendered.push(textOf(h.container as never));
    } finally {
      await h.unmount();
    }
  }
  assert.equal(new Set(rendered).size, STATES.length, "two holding states render identical text");
});

test("THE THREE ANTI-PATTERNS ARE ABSENT — no stepper, no ETA, no cross-sell", async () => {
  // Mobbin grounding §1, takeaways 1, 2 and 4, asserted rather than merely
  // written down. The ETA one is the sharpest: Clara's queue has no SLA any
  // system enforces, so a duration on this screen is a fabricated figure —
  // constraint 2 extended to time. It is also the easiest to reintroduce by
  // accident in a copy pass, which is why it is pinned across ALL states.
  for (const { state } of STATES) {
    const h = await renderComponent(App(createElement(HoldingCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      const text = textOf(h.container as never);
      assert.doesNotMatch(text, /\b\d+\s*[-–]?\s*\d*\s*(hours?|days?|business days?|weeks?)\b/i, `${state.kind}: an ETA sentence`);
      assert.doesNotMatch(text, /\bstep\s*\d\b|\bstep\s+(one|two|three)\b/i, `${state.kind}: a stepper`);
      // 裁-58's wall: the UI shows a trial state and NEVER an RM amount.
      assert.doesNotMatch(text, /\bRM\s*\d/i, `${state.kind}: an RM amount — 裁-58 forbids it until the pricing sitting`);
    } finally {
      await h.unmount();
    }
  }
});

test("VACUITY CONTROL: those three matchers DO fire on the strings they hunt", async () => {
  // Otherwise the cell above passes because the regexes match nothing at all,
  // and it would keep passing with a real ETA on the page. Review law 2 applied
  // to an instrument: absence of a match is evidence only if the matcher can
  // produce one.
  const eta = /\b\d+\s*[-–]?\s*\d*\s*(hours?|days?|business days?|weeks?)\b/i;
  const stepper = /\bstep\s*\d\b|\bstep\s+(one|two|three)\b/i;
  const amount = /\bRM\s*\d/i;
  assert.match("This may take up to 24 hours.", eta, "the ETA matcher misses OKX's own sentence");
  assert.match("Review takes 1-3 business days.", eta, "the ETA matcher misses Airwallex's own sentence");
  assert.match("Step 2 of 3", stepper, "the stepper matcher misses a stepper");
  assert.match("RM0 per month", amount, "the amount matcher misses the string 裁-58 forbids");
});

test("THE CHECKOUT SEAM is named on the pending state, and says TRIAL not an amount", async () => {
  // 裁-68: Stripe checkout success IS the approval for tier-3, and that surface
  // is not built. The screen must name the gap rather than leave the applicant
  // believing an operator is about to rule. 裁-58: the words are "trial", never
  // an amount.
  const h = await renderComponent(App(createElement(HoldingCard, { state: { kind: "pending", firmName: "ROME PROPERTIES" } })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /Not built yet/, "the pending state does not name the missing checkout");
    assert.match(text, /trial/i, "裁-58's trial framing is missing");
    assert.doesNotMatch(text, /\bRM\s*\d/i);
  } finally {
    await h.unmount();
  }
});
