// GATES (b) + (c) — the structural a11y scan and the keyboard walk over the
// two password-recovery faces, rendered inside the REAL `(entry)` layout.
//
// WHY THIS FILE EXISTS. #507 built `/forgot-password` and `/auth/recover/
// password` and shipped them without either scan — `components/entry/` holds
// a11y/keyboard suites for pending, signup and confirm, and P4-3 added them for
// login and invite-accept, but nothing covers these two. P6-6's order names
// them explicitly ("login · signup · invite · the new forgot-password/recover
// faces from #507 … heading order, keyboard walk, axe"), and this train is also
// what puts a new element on every one of those faces — the Ledger Fold lockup
// — so scanning the COMPOSITION rather than the bare form is the point, not a
// convenience: the lockup is inside every tree below.
//
// FOUR STATES, not two. Both faces fork, and the second half of each fork is
// where an unscanned heading or an unreachable control would actually hide:
// the recovery form's "check your email" confirmation, and the reset form's
// "password updated" confirmation.
//
// The auth client is injected at each form's own seam for the reason
// `login-a11y.test.tsx` records in full: constructing the real browser client
// under Node 20 hangs the runner for 200 seconds on `@supabase/realtime-js`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import EntryLayout from "../../app/(entry)/layout";
import { PasswordRecoveryForm, type PasswordRecoveryAuthClient } from "./password-recovery-form";
import { PasswordResetForm, type PasswordResetAuthClient } from "./password-reset-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node };

const recoveryClient = (error: { message: string } | null): (() => PasswordRecoveryAuthClient) => () => ({
  auth: { resetPasswordForEmail: async () => ({ error }) },
});

const resetClient = (
  error: { message: string; name?: string; status?: number; code?: string } | null,
): (() => PasswordResetAuthClient) => () => ({
  auth: { updateUser: async () => ({ error }) },
});

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
      createElement(EntryLayout, null, node),
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

function allIn(root: Node, predicate: (n: Node) => boolean): Node[] {
  const out: Node[] = [];
  const walk = (n: Node): void => {
    if (predicate(n)) out.push(n);
    for (const c of n.childNodes ?? []) walk(c);
  };
  walk(root);
  return out;
}

const byLabelledInput = (label: RegExp) => (n: Node) =>
  n.tagName === "INPUT" && label.test(textOf((n.parentNode ?? {}) as never));

/** Renders a face, settles it, and hands back the harness. */
async function mount(node: ReactElement) {
  const h = await renderComponent(App(node));
  for (let i = 0; i < 3; i++) await h.settle();
  return h;
}

// ---------------------------------------------------------------------------
// /forgot-password — request a reset link
// ---------------------------------------------------------------------------

test("the recovery request face has zero a11y violations", async () => {
  const h = await mount(createElement(PasswordRecoveryForm, { createSupabaseClient: recoveryClient(null) }));
  try {
    // DISCRIMINATING: the labelled field the `label` rule would fire on is
    // genuinely on screen, so an empty violation list means the rule looked.
    assert.ok(findIn(h.container as never, byLabelledInput(/Email/)), "the email field must render");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("the recovery request face is keyboard-operable end to end", async () => {
  const h = await mount(createElement(PasswordRecoveryForm, { createSupabaseClient: recoveryClient(null) }));
  try {
    const reachable = focusableElements(h.container as never);
    assert.ok(reachable.length >= 3, `only ${reachable.length} focusable elements — the email field, the submit button and the back link must all be reachable`);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("the invalid-link arm renders its refusal and still scans clean", async () => {
  const h = await mount(
    createElement(PasswordRecoveryForm, { invalidLink: true, createSupabaseClient: recoveryClient(null) }),
  );
  try {
    assert.match(textOf(h.container as never), /That reset link is invalid or has expired/);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("the SENT confirmation — the fork #507 shipped unscanned — has one h1 and zero violations", async () => {
  const h = await mount(createElement(PasswordRecoveryForm, { createSupabaseClient: recoveryClient(null) }));
  try {
    const email = findIn(h.container as never, byLabelledInput(/Email/));
    await h.act(() => { setFieldValue(email as never, "aisyah@example.com"); });
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();

    assert.match(textOf(h.container as never), /Check your email/, "the confirmation must actually have replaced the form");
    assert.deepEqual(allIn(h.container as never, (n) => n.tagName === "H1").length, 1, "the confirmation owns exactly one h1");
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("a provider refusal on the recovery request renders VERBATIM and scans clean", async () => {
  const h = await mount(
    createElement(PasswordRecoveryForm, {
      createSupabaseClient: recoveryClient({ message: "Email rate limit exceeded" }),
    }),
  );
  try {
    const email = findIn(h.container as never, byLabelledInput(/Email/));
    await h.act(() => { setFieldValue(email as never, "aisyah@example.com"); });
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();

    assert.match(textOf(h.container as never), /Email rate limit exceeded/, "the provider's own sentence, untouched");
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// /auth/recover/password — choose a new password
// ---------------------------------------------------------------------------

test("the choose-a-new-password face has zero a11y violations and is keyboard-operable", async () => {
  const h = await mount(createElement(PasswordResetForm, { createSupabaseClient: resetClient(null) }));
  try {
    assert.ok(findIn(h.container as never, byLabelledInput(/New password/)), "the password field must render");
    assert.deepEqual(checkAccessibility(h.container as never), []);
    assert.deepEqual(checkKeyboardWalk(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("the SAVED confirmation — the second unscanned fork — has one h1 and zero violations", async () => {
  const h = await mount(createElement(PasswordResetForm, { createSupabaseClient: resetClient(null) }));
  try {
    const password = findIn(h.container as never, byLabelledInput(/New password/));
    await h.act(() => { setFieldValue(password as never, "a-very-long-passphrase"); });
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();

    assert.match(textOf(h.container as never), /Password updated/, "the confirmation must actually have replaced the form");
    assert.match(textOf(h.container as never), /Continue to ClaraBook/, "R1's platform name reaches this face's one onward link");
    assert.deepEqual(allIn(h.container as never, (n) => n.tagName === "H1").length, 1);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("an expired recovery session falls back to the request face, which is itself scanned", async () => {
  const h = await mount(
    createElement(PasswordResetForm, {
      createSupabaseClient: resetClient({ message: "Auth session missing!", name: "AuthSessionMissingError" }),
    }),
  );
  try {
    const password = findIn(h.container as never, byLabelledInput(/New password/));
    await h.act(() => { setFieldValue(password as never, "a-very-long-passphrase"); });
    const form = findIn(h.container as never, (n) => n.tagName === "FORM");
    await h.fireEvent(form as never, "submit");
    for (let i = 0; i < 8; i++) await h.settle();

    assert.match(textOf(h.container as never), /That reset link is invalid or has expired/);
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------
// The composition — heading order, and the identity this train adds to it
// ---------------------------------------------------------------------------

test("N4-style: the entry layout adds NO competing heading to either recovery face", async () => {
  // The lockup is a `<p>`, deliberately (brand-lockup.tsx's own header). If it
  // were ever promoted to a heading, every entry face would gain a second one
  // and the face's real subject would be demoted — this measures the actual
  // composed tree rather than trusting that comment.
  for (const face of [
    createElement(PasswordRecoveryForm, { createSupabaseClient: recoveryClient(null) }),
    createElement(PasswordResetForm, { createSupabaseClient: resetClient(null) }),
  ]) {
    const h = await mount(face);
    try {
      const headings = allIn(h.container as never, (n) => /^H[1-6]$/.test(n.tagName ?? ""));
      assert.equal(headings.length, 1, "exactly one heading in the composed face");
      assert.equal(headings[0]!.tagName, "H1", "and it is the face's own h1, not a lockup heading");
    } finally {
      await h.unmount();
    }
  }
});

test("the Ledger Fold lockup is present on the recovery faces, and is decorative there too", async () => {
  const h = await mount(createElement(PasswordRecoveryForm, { createSupabaseClient: recoveryClient(null) }));
  try {
    const imgs = allIn(h.container as never, (n) => n.tagName === "IMG") as unknown as Array<{
      getAttribute: (n: string) => string | null;
    }>;
    assert.equal(imgs.length, 1, "the entry layout puts the mark on this face");
    assert.match(imgs[0]!.getAttribute("src") ?? "", /clarabook-ledger-fold-brand-ink-v1\.0\.png/);
    assert.equal(imgs[0]!.getAttribute("alt"), "");
    // The scan above already ran over this tree; this cell is what makes that
    // scan's silence about the image MEAN something — an image was there.
    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});
