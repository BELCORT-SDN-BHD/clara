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

/**
 * The harness container is the inspector's own `Stub`, not an `HTMLElement`.
 * Narrowed through `unknown` to the ONE method used — the same idiom
 * `email-confirmation-page.test.tsx` already applies — because casting it to
 * `HTMLElement` would be a cast that lies about the object, and TypeScript
 * says so.
 */
type QueriedNode = { getAttribute(name: string): string | null };
/**
 * THE TWO-SPELLING FAMILY. This guard read one NAME — `/Not built yet/` — for
 * a family the estate writes two ways, so the `paid` card's own stale sentence
 * ("it isn't wired up yet") walked straight past it while the cell that exists
 * for exactly that class stayed green. Review law 3, pointed at the instrument.
 * Widened here FIRST, as the RED-before for the copy fix.
 */
const STALE_NOT_BUILT = /Not built yet|isn't wired up|not wired/i;

/** #628 review — the reference the `capacity_full` copy tells a person to quote. */
const REGISTRATION = "11111111-1111-1111-1111-111111111111";

const query = (container: unknown) => (selector: string): QueriedNode | null =>
  (container as { querySelector(s: string): QueriedNode | null }).querySelector(selector);

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
  // #628 — the five faces the single `checkout_open` arm used to hide, plus the
  // capacity one. Each is scanned and keyboard-walked exactly like the rest:
  // three of them carry a control that ENDS or RESTARTS a payment, which is
  // precisely the class of control a happy-path-only scan never sees.
  { state: { kind: "checkout_awaiting_payment", firmName: "ROME PROPERTIES", statusAt: "2026-09-12T04:30:00.000Z", resumable: true, sessionId: "cs_628" }, distinctive: /checkout is open and not paid yet/i },
  { state: { kind: "checkout_processing", firmName: "ROME PROPERTIES", statusAt: "2026-09-12T04:30:00.000Z" }, distinctive: /bank is confirming/i },
  { state: { kind: "checkout_failed", firmName: "ROME PROPERTIES", reason: "card_declined" }, distinctive: /card was declined/i },
  { state: { kind: "checkout_expired", firmName: "ROME PROPERTIES", reason: null }, distinctive: /That checkout expired/i },
  { state: { kind: "checkout_cancelled", firmName: "ROME PROPERTIES" }, distinctive: /That checkout was cancelled/i },
  { state: { kind: "capacity_full", firmName: "ROME PROPERTIES", registration: REGISTRATION }, distinctive: /Admission is currently full/i },
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

test("THE CHECKOUT REFUSAL CARD renders each kind's OWN copy, and a door's own sentence verbatim", async () => {
  // WRITTEN BECAUSE A MUTANT SAID SO. Fold round 1's panel replaced the typed
  // lookup `t(\`checkoutRefusal.${kind}\`)` with a single hard-coded sentence and
  // NOTHING went red — the holding card's refusal arm had no cell at all. A
  // card that says the same thing for a missing pepper, a rotated plan and a
  // caller who already has a firm is a card that tells nobody anything.
  const kinds = ["no_origin_digest", "stripe_unavailable", "plan_rotated",
    "no_registration", "already_member", "unavailable"] as const;
  const rendered = new Map<string, string>();
  for (const kind of kinds) {
    const h = await renderComponent(App(createElement(HoldingCard, {
      state: { kind: "pending", firmName: "ROME PROPERTIES" },
      checkoutRefusal: { nonce: "n", kind },
    })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      rendered.set(kind, textOf(h.container as never));
      assert.deepEqual(checkAccessibility(h.container as never), [], `${kind} has a11y violations`);
    } finally {
      await h.unmount();
    }
  }
  // EACH KIND IS DISTINGUISHABLE from every other — the property a single
  // shared sentence would break while every "it rendered" check stayed green.
  assert.equal(new Set(rendered.values()).size, kinds.length,
    "two checkout refusal kinds render identical text");
  // And the member arm says the true thing rather than a generic refusal.
  assert.match(rendered.get("already_member") as string, /already belong to a firm/i);

  // THE `refused` ARM IS THE DOOR'S OWN SENTENCE, VERBATIM — never a lookup.
  const h = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "pending", firmName: "ROME PROPERTIES" },
    checkoutRefusal: {
      nonce: "n", kind: "refused", code: "CLR09",
      message: "the data processing agreement is not signed",
    },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /the data processing agreement is not signed/);
    assert.match(text, /CLR09/);
  } finally {
    await h.unmount();
  }
});

test("ticket 621: the `legal_not_accepted` refusal NAMES what is outstanding and offers the way back", async () => {
  // Every other refusal arm tells the person what happened. This one is the
  // only refusal on this card whose fix is theirs to make, so it must also
  // carry the route to the stage that can take the acceptance — and the
  // agreements it names are the DOOR'S OWN list, not a guess made here.
  const h = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "pending", firmName: "ROME PROPERTIES" },
    checkoutRefusal: { nonce: "n", kind: "legal_not_accepted", missing: ["terms", "dpa"] },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /needs every agreement accepted first/i);
    assert.match(text, /Terms of Service/);
    assert.match(text, /Data Processing Agreement/);
    assert.doesNotMatch(text, /\bRM\s*\d/i);
    const back = query(h.container)('a[href="/signup"]');
    assert.ok(back, "the legal refusal offers no route back to the stage that can fix it");
    assert.match(textOf(back as never), /accept them/i);
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }

  // WITH AN EMPTY LIST the card still says the true general thing rather than
  // rendering an empty bullet list — the door's detail is evidence, not a
  // precondition for telling somebody why checkout refused.
  const bare = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "pending", firmName: "ROME PROPERTIES" },
    checkoutRefusal: { nonce: "n", kind: "legal_not_accepted", missing: [] },
  })));
  try {
    for (let i = 0; i < 2; i++) await bare.settle();
    assert.match(textOf(bare.container as never), /needs every agreement accepted first/i);
    assert.equal(findIn(bare.container as never, (n) => n.tagName === "UL"), null, "an empty list rendered an empty bullet list");
    assert.deepEqual(checkAccessibility(bare.container as never), []);
  } finally {
    await bare.unmount();
  }
});

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

test("THE CHECKOUT PATH IS OFFERED on the pending state, with no amount anywhere", async () => {
  // TRUED BY FS-4 C-6 Lane B. This cell used to require the words "Not built
  // yet" on this card, because 裁-68's checkout surface genuinely did not
  // exist. It exists now, so design part 1 §2.1's instruction applies — "the
  // NotBuiltNote is REMOVED because the thing it names now exists, not edited
  // to say less" — and a cell demanding that sentence would force the card to
  // claim a gap that is closed. What replaces it is the positive property: a
  // real, reachable control onto the DPA step, and 裁-58's trial framing with
  // no amount, which is the part that never changes.
  const h = await renderComponent(App(createElement(HoldingCard, { state: { kind: "pending", firmName: "ROME PROPERTIES" } })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.doesNotMatch(text, STALE_NOT_BUILT, "a retired not-built sentence is back on the pending card");
    assert.match(text, /trial/i, "裁-58's trial framing is missing");
    assert.doesNotMatch(text, /\bRM\s*\d/i);
    const link = query(h.container)('a[href="/signup"]');
    assert.ok(link, "the pending card offers no way to continue to the DPA step");
  } finally {
    await h.unmount();
  }
});

test("PR 541 stage 7 — NO STATE SAYS 'nothing more to do' BESIDE ITS OWN NEXT-STEP CONTROL", async () => {
  // THE DEFECT THIS CLOSES. `pending` and `checkout_open` both rendered "There's
  // nothing more for you to do yet." directly above the control that IS the
  // person's next step — a "Continue to checkout" link and a "Resume checkout"
  // POST. The description said the ball was in Clara's court; the button between
  // it and the trial note said the opposite. `paid` had it right ("One step is
  // left, and it's yours to take below."), which is what makes this a stale-copy
  // class rather than a design position.
  //
  // THE ROSTER IS DERIVED FROM THE RENDER, not hand-typed, so a state added
  // later with a control is covered the day it lands rather than the day
  // somebody remembers this file. The derivation: render every state, collect
  // its keyboard-operable controls, and treat as CHROME whatever appears in
  // EVERY state — today that is the logout button, which is deliberately the
  // one control every state shares (this file's own header). A state "carries a
  // next-step control" exactly when it has a control outside that intersection.
  // Nothing here names logout, so renaming or restyling it cannot silently
  // empty the roster.
  const controlsByState = new Map<string, Set<string>>();
  for (const { state } of STATES) {
    const label = state.kind === "rejected" && state.reason === null ? "rejected (no reason)" : state.kind;
    const h = await renderComponent(App(createElement(HoldingCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      controlsByState.set(
        label,
        new Set(focusableElements(h.container as never).map((n) => textOf(n as never).trim())),
      );
    } finally {
      await h.unmount();
    }
  }
  const all = [...controlsByState.values()];
  const chrome = new Set(
    [...(all[0] ?? new Set<string>())].filter((c) => all.every((s) => s.has(c))),
  );

  const NOTHING_MORE = /nothing more (for you )?to do/i;
  const withControls: string[] = [];
  for (const { state } of STATES) {
    const label = state.kind === "rejected" && state.reason === null ? "rejected (no reason)" : state.kind;
    const own = [...(controlsByState.get(label) ?? new Set<string>())].filter((c) => !chrome.has(c));
    if (own.length === 0) continue;
    withControls.push(label);
    const h = await renderComponent(App(createElement(HoldingCard, { state })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      assert.doesNotMatch(
        textOf(h.container as never),
        NOTHING_MORE,
        `${label} tells the person there is nothing to do beside its own control (${own.join(", ")})`,
      );
    } finally {
      await h.unmount();
    }
  }

  // TWO VACUITY CONTROLS, because this cell has two ways to pass for the wrong
  // reason. (1) The derivation must actually find the arms that carry a
  // control — an intersection bug that swallowed every control would leave the
  // roster empty and the loop above would assert nothing at all.
  //
  // #628 GREW THIS LIST FROM THREE TO NINE, which is the roster doing exactly
  // what its own comment promised: "a state added later with a control is
  // covered the day it lands rather than the day somebody remembers this file".
  // `capacity_full` is deliberately NOT here — it is the one new face with no
  // control at all, because every act it could offer is one the door refuses.
  assert.deepEqual(
    withControls.sort(),
    [
      "checkout_awaiting_payment",
      "checkout_cancelled",
      "checkout_expired",
      "checkout_failed",
      "checkout_open",
      "checkout_processing",
      "paid",
      "pending",
    ],
    "the derived roster is not the states that carry a next-step control",
  );
  // (2) The matcher must be able to fire. Absence of a match is evidence only
  // if the matcher can produce one (review law 2, pointed at an instrument).
  assert.match("There's nothing more for you to do yet.", NOTHING_MORE);
  assert.match("there is nothing more to do", NOTHING_MORE);
});

test("PR 541 stage 7 — the checkout_open banner does not promise payment completes on its own", async () => {
  // The compounding half of the same defect: "You'll be able to sign in once
  // payment completes" reads as passive waiting, and payment will not complete
  // unless the person presses Resume. Asserted as the POSITIVE property (the
  // card says the step is theirs) rather than by banning a phrasing, so a
  // reword that keeps the meaning keeps this green.
  const h = await renderComponent(
    App(createElement(HoldingCard, { state: { kind: "checkout_open", firmName: "ROME PROPERTIES" } })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /won't complete on its own|isn't finished|pick it back up/i,
      "the checkout_open card still reads as passive waiting");
    // And the control it points at is really there.
    assert.ok(query(h.container)('form[action="/checkout"]'));
  } finally {
    await h.unmount();
  }
});

test("THE TWO PAID-ROAD ARMS carry REAL controls, and the firm-creating one is not a GET", async () => {
  // The discriminating property: `checkout_open` must POST (a GET to /checkout
  // would let a prefetch open a Stripe Session and spend a rate-wall attempt),
  // and `paid` must LINK to the paint-only success page rather than to the
  // claim route itself (a GET must never create a tenant, M9). Before Lane B
  // both arms were disabled buttons, so both halves of this are new behaviour.
  const resume = await renderComponent(
    App(createElement(HoldingCard, { state: { kind: "checkout_open", firmName: "ROME PROPERTIES" } })),
  );
  try {
    for (let i = 0; i < 2; i++) await resume.settle();
    const form = query(resume.container)('form[action="/checkout"]');
    assert.ok(form, "the resume arm has no form posting to /checkout");
    assert.equal(form?.getAttribute("method")?.toLowerCase(), "post");
    assert.equal(
      query(resume.container)('a[href="/checkout"]'),
      null,
      "a LINK to /checkout would open a Session on a prefetch",
    );
    assert.doesNotMatch(textOf(resume.container as never), STALE_NOT_BUILT);
  } finally {
    await resume.unmount();
  }

  const paid = await renderComponent(
    App(createElement(HoldingCard, { state: { kind: "paid", firmName: "ROME PROPERTIES" } })),
  );
  try {
    for (let i = 0; i < 2; i++) await paid.settle();
    const link = query(paid.container)('a[href="/checkout/success"]');
    assert.ok(link, "the paid arm has no link to the success page");
    assert.equal(
      query(paid.container)('form[action*="/claim"]'),
      null,
      "the firm-creating POST must live on the success page, not on this card",
    );
    assert.doesNotMatch(textOf(paid.container as never), STALE_NOT_BUILT);
  } finally {
    await paid.unmount();
  }
});

// ===========================================================================
// #628 — THE ACT EACH FACE OFFERS, AND THE DEPLOYMENT'S DECLARED MODE
// ===========================================================================

/** The form actions a state renders, by `action` attribute. The property under
 *  test is WHICH ROUTE a face can reach, so it is read off the form rather than
 *  off a label: a button renamed is still the same act, and a button pointed at
 *  a different route is a different one. */
async function actionsOf(state: HoldingState): Promise<string[]> {
  const h = await renderComponent(App(createElement(HoldingCard, { state })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const forms = (h.container as unknown as {
      querySelectorAll(s: string): ArrayLike<{ getAttribute(n: string): string | null }>;
    }).querySelectorAll("form");
    return Array.from(forms, (f) => `${f.getAttribute("method") ?? "get"} ${f.getAttribute("action") ?? ""}`).sort();
  } finally {
    await h.unmount();
  }
}

test("ticket 628 — each face offers EXACTLY the acts that are available in it", async () => {
  // THE DEFECT THIS CLOSES, stated as a table. `checkout_open` offered
  // "resume checkout" in all five worlds: a declined card, an expired Session,
  // a cancelled checkout and a payment the bank was mid-way through confirming
  // all got the same POST. Two of those mint a second checkout for somebody who
  // must not have one; one of them invites a second payment.
  assert.deepEqual(
    await actionsOf({ kind: "checkout_awaiting_payment", firmName: "F", statusAt: null, resumable: true, sessionId: "cs_628" }),
    ["post /checkout", "post /checkout/cancel"],
    "the unpaid-session face must offer both picking it up and ending it",
  );
  assert.deepEqual(
    await actionsOf({ kind: "checkout_awaiting_payment", firmName: "F", statusAt: null, resumable: true, sessionId: null }),
    ["post /checkout"],
    "a cancel control was offered with no Session to cancel",
  );
  // #628 REVIEW — THE SETTLED ARM. `paid` and `consumed` reach this same face
  // (money landed, no claimable payment row observed yet) with the intent's
  // Session id still stamped. Both controls used to render off that id alone,
  // so the person was offered "Resume checkout" and "Cancel and start again"
  // over money that was already gone — and pressing either bought a round trip
  // to `already_paid`. The only honest act left is to look again.
  assert.deepEqual(
    await actionsOf({ kind: "checkout_awaiting_payment", firmName: "F", statusAt: null, resumable: false, sessionId: null }),
    ["get /pending"],
    "a settled checkout still offered an act the door refuses",
  );
  assert.deepEqual(
    await actionsOf({ kind: "checkout_processing", firmName: "F", statusAt: null }),
    ["get /pending"],
    "the processing face must offer a re-read and NOTHING that starts or ends a payment",
  );
  for (const state of [
    { kind: "checkout_failed", firmName: "F", reason: "card_declined" },
    { kind: "checkout_expired", firmName: "F", reason: null },
    { kind: "checkout_cancelled", firmName: "F" },
  ] as const) {
    assert.deepEqual(await actionsOf(state), ["post /checkout"], state.kind);
  }
  // THE ONE FACE WITH NO ACT AT ALL. `open_checkout_intent` refuses
  // `capacity_reached`, so any control here would be an invitation to a
  // refusal.
  assert.deepEqual(await actionsOf({ kind: "capacity_full", firmName: "F", registration: REGISTRATION }), []);
});

test("ticket 628 review — capacity_full RENDERS the reference its copy tells the person to quote", async () => {
  // The success page's own `capacity_full` promised a reference and rendered
  // none; both faces now make the same promise and both keep it, through the
  // one shared component (7.3).
  const h = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "capacity_full", firmName: "ROME PROPERTIES", registration: REGISTRATION },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /quote your registration reference/i, "the promise is gone from the copy");
    assert.ok(text.includes(REGISTRATION), "the reference the copy promises is not on screen");
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("ticket 628 review — the SWEPT-TIMEOUT expiry is its own sentence on the holding face too", async () => {
  // `0186`'s applier moves a `processing` intent nobody answered for 24 hours to
  // `expired` with `status_reason='processing_timeout'`. "Your bank never came
  // back" is not "the checkout page ran out of time".
  const swept = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "checkout_expired", firmName: "F", reason: "processing_timeout" },
  })));
  try {
    for (let i = 0; i < 2; i++) await swept.settle();
    const text = textOf(swept.container as never);
    assert.match(text, /did not hear back from your bank/i);
    assert.doesNotMatch(text, /no longer open, so it cannot be paid/i);
  } finally {
    await swept.unmount();
  }
  const ordinary = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "checkout_expired", firmName: "F", reason: null },
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

test("ticket 628 — the failed face says what happened in PLAIN WORDS, and never the provider's token in prose", async () => {
  // `payment_intent_authentication_failure` is an identifier, not a sentence.
  // It is allowed to reach a human — support reads it off a screenshot — but
  // only inside the estate's collapsed technical disclosure, never as the thing
  // the applicant is asked to understand.
  const h = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "checkout_failed", firmName: "F", reason: "payment_intent_authentication_failure" },
  })));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = textOf(h.container as never);
    assert.match(text, /security check with your bank/i, "the plain sentence is missing");
    assert.ok(query(h.container)("details"), "the provider's token has nowhere to live");
    assert.doesNotMatch(text, /webhook/i, "jargon reached the person");
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }

  // AN UNKNOWN TOKEN STILL GETS A TRUE SENTENCE rather than a blank or the
  // token itself: the copy that is true without knowing anything.
  const unknown = await renderComponent(App(createElement(HoldingCard, {
    state: { kind: "checkout_failed", firmName: "F", reason: "some_token_nobody_mapped" },
  })));
  try {
    for (let i = 0; i < 2; i++) await unknown.settle();
    const text = textOf(unknown.container as never);
    assert.match(text, /Your bank can tell you why/i);
    assert.doesNotMatch(text.split("Technical")[0] as string, /some_token_nobody_mapped/);
  } finally {
    await unknown.unmount();
  }
});

test("ticket 628 — the payments badge is the SERVER'S declared mode, on the faces where a payment is still ahead", async () => {
  // 裁-58's words are TRIAL, never an amount, and #628 adds the deployment's
  // own declaration beside them. The three modes are three different sentences:
  // test says nothing is charged, live says nothing at all (a live deployment
  // does not reassure anyone), and UNSET says payments are not configured —
  // which is deliberately NOT "temporarily unavailable", because no amount of
  // waiting fixes a missing variable.
  const read = async (mode: "live" | "test" | "unconfigured", state: HoldingState) => {
    const h = await renderComponent(App(createElement(HoldingCard, { state, paymentsMode: mode })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      assert.deepEqual(checkAccessibility(h.container as never), [], `${mode}/${state.kind}`);
      return textOf(h.container as never);
    } finally {
      await h.unmount();
    }
  };
  const pending: HoldingState = { kind: "pending", firmName: "ROME PROPERTIES" };

  assert.match(await read("test", pending), /Test mode — nothing is charged/);
  assert.doesNotMatch(await read("live", pending), /Test mode/);
  const unset = await read("unconfigured", pending);
  assert.match(unset, /has not been set up to take payments/i);
  assert.doesNotMatch(unset, /Test mode/);
  // DISTINCT FROM THE OUTAGE SENTENCE, which is the whole reason this is its
  // own state rather than a reuse of `stripe_unavailable`.
  assert.doesNotMatch(unset, /try again in a moment/i);
  // AND NO AMOUNT, on any of them (裁-42's design wall).
  for (const mode of ["live", "test", "unconfigured"] as const) {
    assert.doesNotMatch(await read(mode, pending), /\bRM\s*\d/i, mode);
  }

  // NOT ON A FACE WHERE THE MONEY IS ALREADY COMMITTED, or where there is no
  // pay control to qualify: a badge about what a payment would cost is noise
  // beside a payment that already happened.
  for (const state of [
    { kind: "paid", firmName: "F" },
    { kind: "checkout_processing", firmName: "F", statusAt: null },
    { kind: "capacity_full", firmName: "F", registration: REGISTRATION },
  ] as const) {
    assert.doesNotMatch(await read("test", state), /Test mode/, state.kind);
    assert.doesNotMatch(await read("unconfigured", state), /has not been set up to take payments/i, state.kind);
  }
});

test("ticket 628 — the eight new checkout outcome kinds each render their OWN copy", async () => {
  // The same property the existing refusal cell pins for the original six: a
  // card that says the same thing for a misconfigured deployment, a full house,
  // a payment mid-authorisation and a successful cancellation is a card that
  // tells nobody anything. The review adds the eighth — `try_again`, the broken
  // deadlock — for the same reason: it must not read as the generic failure.
  const kinds = ["payments_misconfigured", "checkout_in_progress", "checkout_expired",
    "capacity_reached", "payment_in_flight", "cancelled", "nothing_to_cancel",
    "try_again"] as const;
  const rendered = new Map<string, string>();
  for (const kind of kinds) {
    const h = await renderComponent(App(createElement(HoldingCard, {
      state: { kind: "pending", firmName: "ROME PROPERTIES" },
      checkoutRefusal: { nonce: "n", kind },
    })));
    try {
      for (let i = 0; i < 2; i++) await h.settle();
      rendered.set(kind, textOf(h.container as never));
      assert.deepEqual(checkAccessibility(h.container as never), [], `${kind} has a11y violations`);
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], `${kind} is not keyboard-operable`);
    } finally {
      await h.unmount();
    }
  }
  assert.equal(new Set(rendered.values()).size, kinds.length,
    "two of the new checkout outcome kinds render identical text");
  // THE CONFIGURATION ONE IS NOT THE OUTAGE ONE. This is the split the ticket
  // exists for: an operator has to act, and the applicant must be told to stop
  // pressing rather than to try again in a moment.
  assert.match(rendered.get("payments_misconfigured") as string, /not a temporary outage/i);
  assert.doesNotMatch(rendered.get("payments_misconfigured") as string, /try again in a moment/i);
  // THE CANCEL SUCCESS IS NOT A FAILURE SENTENCE.
  assert.match(rendered.get("cancelled") as string, /Nothing was charged/i);
  assert.doesNotMatch(rendered.get("cancelled") as string, /could not|failed/i);
  // THE BROKEN DEADLOCK SAYS NOTHING WAS CHANGED — which is the whole reason it
  // is not the `unavailable` card. A rolled-back transaction opened nothing,
  // stamped nothing and charged nothing, and the person's next step is the same
  // press again.
  assert.match(rendered.get("try_again") as string, /nothing was changed/i);
  assert.match(rendered.get("try_again") as string, /try again/i);
});
