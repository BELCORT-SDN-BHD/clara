// THE CODE FIELD AND THE RESEND CONTROL (#621) — the card's two halves that the
// existing confirmation battery predates.
//
// `email-confirmation.test.tsx` drives the verify POST end to end and
// `email-confirmation-page.test.tsx` the GET's own flash reading; this file is
// aimed at what the CARD does: normalising anything that lands in the code
// field (a paste, an OS autofill, a typed character), routing the resend to its
// own POST without a second address field, and rendering the five resend
// outcomes as distinguishable, persistent faces with the server's own wait.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import {
  EmailConfirmationCard,
  normalizeConfirmationCode,
  type ConfirmCodeState,
} from "./email-confirmation-card";

enableDomInspection();

type Node = {
  tagName?: string;
  childNodes?: Node[];
  parentNode?: Node;
  value?: string;
  disabled?: boolean;
  getAttribute?: (name: string) => string | null;
};

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
function findAll(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  (function walk(n: Node) {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}
/** THE HARNESS STORES WHAT REACT-DOM WROTE, NOT WHAT A BROWSER WOULD NORMALISE
 *  (test/domInspect.ts's own header): `setAttribute` is recorded verbatim, so a
 *  React prop that react-dom passes straight through is keyed by its REACT
 *  spelling (`inputMode`, `formAction`, `maxLength`), while a genuinely
 *  lower-cased one (`type`, `pattern`, `aria-*`) is keyed as written. This
 *  helper tries both rather than pinning one spelling and quietly reading
 *  `null` — a lookup that always misses is a cell that always passes. */
const attr = (n: Node, ...names: string[]): string | null => {
  for (const name of names) {
    const value = typeof n.getAttribute === "function" ? n.getAttribute(name) : null;
    if (value !== null) return value;
  }
  return null;
};
/** `name` on a form control is an IDL property react-dom writes directly, so it
 *  never reaches the stub's attribute store at all. Read the property. */
const controlName = (n: Node): string | null => (n as { name?: string }).name ?? null;
const byId = (id: string) => (n: Node) => attr(n, "id") === id;
const byButtonText = (re: RegExp) => (n: Node) => n.tagName === "BUTTON" && re.test(textOf(n as never));

async function mount(state: ConfirmCodeState, prefillEmail: string | null = null) {
  const h = await renderComponent(
    App(createElement(EmailConfirmationCard, { state, prefillEmail })),
  );
  for (let i = 0; i < 2; i++) await h.settle();
  return h;
}

test("THE NORMALISER keeps digits, drops what a mail client inserts, and stops at six", () => {
  // A paste is the case this exists for: mail clients and password managers
  // hand over "123 456", "123-456" and "Your code is 123456" indiscriminately,
  // and every one of them has to arrive at the wall as six digits.
  assert.equal(normalizeConfirmationCode("123 456"), "123456");
  assert.equal(normalizeConfirmationCode("123-456"), "123456");
  assert.equal(normalizeConfirmationCode("  1 2 3 4 5 6  "), "123456");
  assert.equal(normalizeConfirmationCode("Your code is 123456"), "123456");
  assert.equal(normalizeConfirmationCode("1234567890"), "123456", "a longer paste must not overflow the field");
  assert.equal(normalizeConfirmationCode("abcdef"), "", "letters never reach the wall as an attempt");
  assert.equal(normalizeConfirmationCode(""), "");
});

test("THE CODE FIELD IS ONE LABELLED, PROVIDER-COMPATIBLE INPUT, and a paste lands normalised in it", async () => {
  const h = await mount({ kind: "form" });
  try {
    const code = findIn(h.container as never, byId("confirm-code"));
    assert.ok(code, "the code field is gone");
    // The pair every mobile keyboard and OS-level code autofill actually keys
    // on. `one-time-code` is what makes a provider's SMS/mail code offerable.
    assert.equal(attr(code, "inputMode", "inputmode"), "numeric");
    assert.equal(attr(code, "autoComplete", "autocomplete"), "one-time-code");
    // NO `maxlength`: a real browser truncates on that attribute BEFORE any
    // `input` event fires, so a pasted "654 321" would reach the handler as
    // "654 32" and normalise to five digits. The normaliser is the cap.
    assert.equal(attr(code, "maxLength", "maxlength"), null,
      "maxlength is back on the code field — it truncates a paste before the normaliser ever sees it");
    assert.equal(attr(code, "pattern"), "[0-9]{6}", "the browser's own six-digit validation is gone");
    assert.equal(controlName(code), "token", "the wall reads `token`; renaming the field would send nothing");
    // Labelled, and the paste hint is bound to the field rather than floating
    // above it.
    const describedBy = attr(code, "aria-describedby");
    assert.ok(describedBy, "the code field carries no description");
    const hint = findIn(h.container as never, byId(describedBy));
    assert.ok(hint, "the code field's aria-describedby points at nothing");
    assert.match(textOf(hint as never), /paste/i);

    // THE PASTE ITSELF: a real browser fires `input` for a paste, an autofill
    // and a keystroke alike, which is exactly the handler this drives.
    await h.act(() => { setFieldValue(code as never, "123 456"); });
    await h.settle();
    assert.equal((code as { value?: string }).value, "123456", "a pasted code kept its spaces");

    await h.act(() => { setFieldValue(code as never, "9x8y7z6w5v4u"); });
    await h.settle();
    assert.equal((code as { value?: string }).value, "987654");

    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("THE RESEND IS A SECOND SUBMIT ON THE SAME FORM — one address field, two destinations, no JavaScript required", async () => {
  const h = await mount({ kind: "form" });
  try {
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    assert.ok(form);
    assert.equal(attr(form, "action"), "/auth/confirm/verify");
    assert.equal((attr(form, "method") ?? "").toLowerCase(), "post");

    // Exactly ONE address field on the card. A second form with a hidden copy
    // of the address is the shape this avoids: two fields that can disagree.
    const emailFields = findAll(h.container as never, (n) => n.tagName === "INPUT" && controlName(n) === "email");
    assert.equal(emailFields.length, 1, "the card grew a second address field");

    const resend = findIn(h.container as never, byButtonText(/Send me a new code/i));
    assert.ok(resend, "the resend control is gone");
    assert.equal(attr(resend, "type"), "submit", "the resend must submit, not run JavaScript");
    assert.equal(attr(resend, "formAction", "formaction"), "/auth/confirm/resend");
    // `formNoValidate`, because an empty code field has no bearing on a request
    // that carries no code.
    assert.ok(
      attr(resend, "formNoValidate", "formnovalidate") !== null,
      "the resend submit would be blocked by the code field's own validation",
    );
    assert.notEqual((resend as { disabled?: boolean }).disabled, true);
    assert.ok(focusableElements(h.container as never).includes(resend as never));
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("THE FIVE RESEND FACES ARE DISTINGUISHABLE, and the two waits render the server's OWN seconds", async () => {
  const faces: Array<{ state: ConfirmCodeState; needle: RegExp; disabled: boolean }> = [
    { state: { kind: "resent" }, needle: /A new code is on its way/i, disabled: false },
    { state: { kind: "resend-locked", waitSeconds: 47 }, needle: /Too many attempts on this address/i, disabled: true },
    { state: { kind: "resend-rate-limited", waitSeconds: 47 }, needle: /A code was just sent/i, disabled: true },
    { state: { kind: "resend-invalid-email" }, needle: /can't send to that address/i, disabled: false },
    { state: { kind: "resend-unavailable" }, needle: /can't send a new code from here right now/i, disabled: false },
  ];
  const rendered: string[] = [];
  for (const face of faces) {
    const h = await mount(face.state);
    try {
      const text = textOf(h.container as never);
      rendered.push(text);
      assert.match(text, face.needle, `${face.state.kind} did not render its own card`);
      // NO FACE HERE IS "NOT BUILT". `resend-unavailable` used to render inside
      // the estate's dashed named-not-delivered note, which tells the person
      // the resend does not exist — it does, and what happened is that one call
      // failed. The dashed edge means exactly one thing, so it must not appear
      // on any of the five.
      assert.doesNotMatch(text, /Not built yet/i, `${face.state.kind} claims the resend is unbuilt`);
      const dashed = findAll(h.container as never, (n) =>
        (attr(n, "class") ?? "").includes("border-dashed"));
      assert.deepEqual(dashed, [], `${face.state.kind} rendered the dashed "not built" note`);
      if (face.state.kind === "resend-locked" || face.state.kind === "resend-rate-limited") {
        // THE HONEST WAIT: the wall's own Retry-After seconds, rendered exactly,
        // never rounded into a friendlier number the server did not say.
        assert.match(text, /47 seconds/, `${face.state.kind} did not render the server's own wait`);
      }
      const resend = findIn(h.container as never, byButtonText(/Send me a new code/i));
      assert.ok(resend, `${face.state.kind} lost the resend control`);
      assert.equal(
        (resend as { disabled?: boolean }).disabled === true,
        face.disabled,
        `${face.state.kind}: the resend control's availability is wrong`,
      );
      // THE FORM STAYS LIVE under every one of them: a wait is not a dead end.
      assert.ok(findIn(h.container as never, byId("confirm-code")), `${face.state.kind} removed the code field`);
      assert.deepEqual(checkAccessibility(h.container as never), [], `${face.state.kind} has a11y violations`);
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], `${face.state.kind} has keyboard violations`);
    } finally {
      await h.unmount();
    }
  }
  // AND THEY ARE ACTUALLY DIFFERENT PAGES — the property a single card would
  // still satisfy every assertion above on.
  assert.equal(new Set(rendered).size, faces.length, "two resend outcomes render identical text");
});

test("`resend-unavailable` IS A FAILURE, not an unbuilt feature — an error banner that announces itself", async () => {
  const h = await mount({ kind: "resend-unavailable" });
  try {
    // `StateBanner tone="error"` computes `role="alert"`, which is what makes a
    // failure interrupt. The dashed note has no role at all, so the outcome
    // reached a screen-reader user only if they happened to re-read the page.
    const alert = findIn(h.container as never, (n) => attr(n, "role") === "alert");
    assert.ok(alert, "the resend failure does not announce itself");
    assert.match(textOf(alert as never), /can't send a new code from here right now/i);
    assert.match(textOf(alert as never), /Nothing was sent/i);
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("THE SENT FACE SAYS WHAT A RESEND COSTS, and offers a way out of a MISTYPED address", async () => {
  const h = await mount({ kind: "resent" }, "aisyah@example.test");
  try {
    const text = textOf(h.container as never);
    // #621 review item 7 — the runtime settles a resend as an attempt of the
    // SAME 5-per-15-minute budget a wrong code spends. Said BEFORE the lockout,
    // on the face that just spent one, not only on the card that reports it.
    assert.match(text, /counts as one of your attempts/i,
      "the sent face never says a resend spends an attempt");
    assert.match(text, /15 minutes/, "the pause the attempts buy is not named");

    // #621 review item 6 — the runtime deliberately answers `sent` for an
    // address nobody has ever signed up with (the card must not be an
    // account-existence oracle), so "we sent it to …" is exactly what a person
    // who mistyped their address reads. Without this they are stranded waiting
    // for mail that will never arrive.
    assert.match(text, /Wrong email address/i, "the sent face offers no way out of a typo");
    const restart = findIn(h.container as never, (n) =>
      n.tagName === "A" && /Start again with a different one/i.test(textOf(n as never)));
    assert.ok(restart, "no control to start again with a different address");
    assert.equal(attr(restart, "href"), "/signup", "starting again must land on the account step");
    assert.ok(focusableElements(h.container as never).includes(restart as never));
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("THE WAY OUT IS ON THE SENT FACE ONLY — every other face already carries its own next step", async () => {
  for (const state of [
    { kind: "form" },
    { kind: "resend-rate-limited", waitSeconds: 47 },
    { kind: "resend-unavailable" },
  ] as const) {
    const h = await mount(state);
    try {
      assert.doesNotMatch(textOf(h.container as never), /Wrong email address/i,
        `${state.kind} grew a start-again control it has no cause for`);
    } finally {
      await h.unmount();
    }
  }
});

test("A CLAMPED WAIT SAYS `at least`, and an exact one never does", async () => {
  // The resend wall clamps a wait longer than its display ceiling rather than
  // downgrading the outcome to "we couldn't send" (`resend/resend-wall.ts`).
  // The number the card prints is then this app's floor, not the wall's own
  // measurement, and the copy has to say so.
  const clamped: Array<[ConfirmCodeState, RegExp]> = [
    [{ kind: "resend-locked", waitSeconds: 900, atLeast: true }, /at least 900 seconds/i],
    [{ kind: "resend-rate-limited", waitSeconds: 900, atLeast: true }, /in at least 900 seconds/i],
    // The CODE attempt's own `locked` carries the identical contract, off the
    // verify wall (`verify/confirmation-wall.ts`) rather than the resend one.
    [{ kind: "locked", waitSeconds: 900, atLeast: true }, /at least 15 minutes/i],
  ];
  for (const [state, needle] of clamped) {
    const h = await mount(state);
    try {
      assert.match(textOf(h.container as never), needle, `${state.kind} printed a clamped wait as exact`);
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  }
  for (const state of [
    { kind: "resend-locked", waitSeconds: 47 },
    { kind: "resend-rate-limited", waitSeconds: 47 },
  ] as const) {
    const h = await mount(state);
    try {
      const text = textOf(h.container as never);
      assert.match(text, /47 seconds/);
      assert.doesNotMatch(text, /at least/i, `${state.kind} hedged a wait the wall measured exactly`);
    } finally {
      await h.unmount();
    }
  }

  const exactLocked = await mount({ kind: "locked", waitSeconds: 300 });
  try {
    const text = textOf(exactLocked.container as never);
    assert.match(text, /5 minutes/);
    assert.doesNotMatch(text, /at least/i, "locked hedged a wait the wall measured exactly");
  } finally {
    await exactLocked.unmount();
  }
});

test("THE ADDRESS SURVIVES THE REDIRECT, and `resent` names where the code went", async () => {
  const h = await mount({ kind: "resent" }, "aisyah@example.test");
  try {
    const email = findIn(h.container as never, byId("confirm-email"));
    assert.equal((email as { value?: string }).value, "aisyah@example.test",
      "the POST's redirect emptied the field the person filled in");
    assert.match(textOf(h.container as never), /We sent it to aisyah@example\.test/);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("WITH NO ECHOED ADDRESS the card says the true, unaddressed thing rather than naming nobody", async () => {
  const h = await mount({ kind: "resent" }, null);
  try {
    const text = textOf(h.container as never);
    assert.match(text, /A new code is on its way/);
    assert.doesNotMatch(text, /We sent it to\s*\./, "the card printed an empty address");
    assert.doesNotMatch(text, /undefined|null/);
  } finally {
    await h.unmount();
  }
});

test("THE CODE ATTEMPT'S OWN FOUR FACES still render, and `unavailable` no longer claims to be unbuilt", async () => {
  const codeFaces: Array<[ConfirmCodeState, RegExp]> = [
    [{ kind: "wrong-code", remaining: 2 }, /That code didn't work/],
    [{ kind: "locked", waitSeconds: 300 }, /Too many attempts/],
    [{ kind: "invalid" }, /wasn't a valid submission/],
    [{ kind: "unavailable" }, /couldn't check your code just now/],
  ];
  for (const [state, needle] of codeFaces) {
    const h = await mount(state);
    try {
      const text = textOf(h.container as never);
      assert.match(text, needle);
      // The wall IS wired now, so the dashed "named, not delivered" note has no
      // subject here any more — its presence would tell the person the feature
      // does not exist when what actually happened is that a call failed.
      assert.doesNotMatch(text, /Not built yet/i, `${state.kind} still claims confirmation is unbuilt`);
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  }
});

test("THE TWO RECOVERY ROUTES for somebody who is already registered are on the card", async () => {
  const h = await mount({ kind: "wrong-code", remaining: 0 });
  try {
    const hrefs = findAll(h.container as never, (n) => n.tagName === "A").map((a) => attr(a, "href"));
    assert.ok(hrefs.includes("/login"), `no sign-in route (hrefs: ${hrefs.join(", ")})`);
    assert.ok(hrefs.includes("/forgot-password"), `no password-reset route (hrefs: ${hrefs.join(", ")})`);
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});
