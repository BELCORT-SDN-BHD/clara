import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it } from "node:test";

import { checkAccessibility } from "../../test/a11yRules";
import { activeElement, enableDomInspection } from "../../test/domInspect";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import type { ServerSession } from "../../lib/supabase/server-session";
import { PasswordRecoveryForm, type PasswordRecoveryAuthClient } from "./password-recovery-form";
import { PasswordResetForm, type PasswordResetAuthClient } from "./password-reset-form";
import { renderPasswordResetRoute } from "./password-reset-route";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; disabled?: boolean; getAttribute?: (n: string) => string | null };

const attr = (n: Node, name: string) => (typeof n.getAttribute === "function" ? n.getAttribute(name) : null);

/** A manually-resolvable promise, for asserting the MID-FLIGHT pending state
 *  (disabled inputs, `aria-busy`) rather than only its before/after ends. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function App(node: ReactElement) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children: node });
}

function find(root: Node, predicate: (node: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = find(child, predicate);
    if (found) return found;
  }
  return null;
}

const labelledInput = (label: RegExp) => (node: Node) =>
  node.tagName === "INPUT" && label.test(textOf((node.parentNode ?? {}) as never));

const RECOVERY_SESSION: ServerSession = {
  accessToken: "recovery-token",
  subject: "11111111-1111-4111-8111-111111111111",
  email: null,
};

describe("password recovery entry faces", () => {
  it("RED-BEFORE F2: renders the typed invalid-link face without a recovery session", async () => {
    const face = await renderPasswordResetRoute(async () => null);
    const harness = await renderComponent(App(face));
    try {
      assert.match(harness.text(), /That reset link is invalid or has expired/);
      assert.equal(find(harness.container as never, labelledInput(/New password/)), null);
      assert.ok(find(harness.container as never, labelledInput(/Email/)));
    } finally { await harness.unmount(); }
  });

  it("F2 positive control: renders the password form with a recovery session", async () => {
    const face = await renderPasswordResetRoute(async () => RECOVERY_SESSION);
    const harness = await renderComponent(App(face));
    try {
      assert.ok(find(harness.container as never, labelledInput(/New password/)));
      assert.doesNotMatch(harness.text(), /That reset link is invalid or has expired/);
    } finally { await harness.unmount(); }
  });

  it("sends the exact email with the fixed PKCE callback and renders the generic confirmation", async () => {
    const calls: Array<{ email: string; redirectTo: string }> = [];
    const auth = (): PasswordRecoveryAuthClient => ({
      auth: { resetPasswordForEmail: async (email, options) => { calls.push({ email, redirectTo: options.redirectTo }); return { error: null }; } },
    });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "owner@example.test"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 4; i++) await harness.settle();
      assert.deepEqual(calls, [{ email: "owner@example.test", redirectTo: "http://localhost/auth/recover" }]);
      assert.match(harness.text(), /If an account can receive a reset link/);
      assert.deepEqual(checkAccessibility(harness.container as never), []);
    } finally { await harness.unmount(); }
  });

  it("surfaces the provider's send refusal verbatim", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({ auth: { resetPasswordForEmail: async () => ({ error: { message: "Email rate limit exceeded" } }) } });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "owner@example.test"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 4; i++) await harness.settle();
      assert.match(harness.text(), /Email rate limit exceeded/);
      assert.deepEqual(checkAccessibility(harness.container as never), []);
    } finally { await harness.unmount(); }
  });

  it("keeps both recovery faces in native tab order with visible focus treatment", async () => {
    const request = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: () => ({ auth: { resetPasswordForEmail: async () => ({ error: null }) } }) })));
    const reset = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: () => ({ auth: { updateUser: async () => ({ error: null }) } }) })));
    try {
      assert.deepEqual(checkKeyboardWalk(request.container as never), []);
      assert.deepEqual(checkKeyboardWalk(reset.container as never), []);
      assert.deepEqual(focusableElements(request.container as never).map((node) => node.tagName), ["INPUT", "BUTTON", "A"]);
      assert.deepEqual(focusableElements(reset.container as never).map((node) => node.tagName), ["INPUT", "BUTTON"]);
    } finally { await request.unmount(); await reset.unmount(); }
  });

  it("lets Supabase own password policy and paints its breached-password refusal verbatim", async () => {
    // MUST-NOT-RED CONTROL for F2's session classifier. Both shapes below are
    // refusals of the USER'S ACT, which the security bar requires byte-for-byte
    // (12-character and HIBP policy). The second carries a full provider
    // envelope — name, status and code — so a classifier widened to swallow
    // "any error with a code" reds HERE instead of silently eating the one
    // message the person needs to read.
    for (const { error, typed } of [
      { error: { message: "Password is known to be compromised" }, typed: "compromised-password" },
      {
        error: {
          message: "Password should be at least 12 characters",
          name: "AuthWeakPasswordError",
          status: 422,
          code: "weak_password",
        },
        typed: "short",
      },
    ]) {
      const seen: string[] = [];
      const auth = (): PasswordResetAuthClient => ({ auth: { updateUser: async ({ password }) => { seen.push(password); return { error }; } } });
      const harness = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: auth })));
      try {
        const password = find(harness.container as never, labelledInput(/New password/));
        await harness.act(() => setFieldValue(password as never, typed));
        const form = find(harness.container as never, (node) => node.tagName === "FORM");
        await harness.fireEvent(form as never, "submit");
        for (let i = 0; i < 4; i++) await harness.settle();
        assert.deepEqual(seen, [typed]);
        assert.match(harness.text(), new RegExp(error.message));
        assert.ok(find(harness.container as never, labelledInput(/New password/)), "the field must survive a policy refusal");
        assert.doesNotMatch(harness.text(), /That reset link is invalid or has expired/);
        assert.deepEqual(checkAccessibility(harness.container as never), []);
      } finally { await harness.unmount(); }
    }
  });

  it("RED-BEFORE F2: maps a vanished or expired session to the typed face without provider prose", async () => {
    for (const providerError of [
      { message: "RAW SESSION PROVIDER MESSAGE", name: "AuthSessionMissingError" },
      { message: "RAW EXPIRED PROVIDER MESSAGE", name: "AuthApiError", status: 401 },
    ]) {
      const auth = (): PasswordResetAuthClient => ({
        auth: { updateUser: async () => ({ error: providerError }) },
      });
      const harness = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: auth })));
      try {
        const password = find(harness.container as never, labelledInput(/New password/));
        await harness.act(() => setFieldValue(password as never, "A-valid-password-123!"));
        const form = find(harness.container as never, (node) => node.tagName === "FORM");
        await harness.fireEvent(form as never, "submit");
        for (let i = 0; i < 4; i++) await harness.settle();
        assert.doesNotMatch(harness.text(), /RAW (?:SESSION|EXPIRED) PROVIDER MESSAGE/);
        assert.match(harness.text(), /That reset link is invalid or has expired/);
        assert.equal(find(harness.container as never, labelledInput(/New password/)), null);
        assert.ok(find(harness.container as never, labelledInput(/Email/)));
      } finally { await harness.unmount(); }
    }
  });

  it("renders the saved confirmation only after updateUser succeeds", async () => {
    const harness = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: () => ({ auth: { updateUser: async () => ({ error: null }) } }) })));
    try {
      const password = find(harness.container as never, labelledInput(/New password/));
      await harness.act(() => setFieldValue(password as never, "A-valid-password-123!"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 4; i++) await harness.settle();
      assert.match(harness.text(), /Password updated/);
      assert.deepEqual(checkAccessibility(harness.container as never), []);
    } finally { await harness.unmount(); }
  });

  // ---------------------------------------------------------------------
  // #622 review round — the validated same-origin return target used to
  // survive the DIRECT sign-in path but was DROPPED through recovery: the
  // Continue link after a successful reset always pointed at `/`, no matter
  // what a person was blocked at before starting the journey. `next-cookie.ts`'s
  // own header carries the earlier hops; this is the FINAL one — the ACTUAL
  // wall, through the SAME `resolveSameOriginPath` function `login-form.tsx`
  // itself reads `?next=` through.
  // ---------------------------------------------------------------------

  async function saveAndReadContinueHref(next: string | null): Promise<string | null> {
    const harness = await renderComponent(App(createElement(PasswordResetForm, {
      next,
      createSupabaseClient: () => ({ auth: { updateUser: async () => ({ error: null }) } }),
    })));
    try {
      const password = find(harness.container as never, labelledInput(/New password/));
      await harness.act(() => setFieldValue(password as never, "A-valid-password-123!"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 4; i++) await harness.settle();
      const link = find(harness.container as never, (node) => node.tagName === "A") as unknown as Record<string, unknown> | null;
      assert.ok(link, "the Continue link must render");
      const propsKey = Object.keys(link).find((k) => k.startsWith("__reactProps"));
      assert.ok(propsKey, "could not read the anchor's React props — the href probe is vacuous");
      return (link[propsKey] as { href?: string }).href ?? null;
    } finally { await harness.unmount(); }
  }

  it("the Continue link lands on a validated same-origin `next` when one was carried through the journey", async () => {
    assert.equal(await saveAndReadContinueHref("/work?view=needs-you"), "/work?view=needs-you");
  });

  it("falls back to `/` when no `next` was carried — the pre-PR-622 behaviour, unchanged", async () => {
    assert.equal(await saveAndReadContinueHref(null), "/");
  });

  it("falls back to `/` for a foreign-origin value — the SAME wall login-form.tsx's own `?next=` read uses, never trusted merely because it arrived via this many hops", async () => {
    assert.equal(await saveAndReadContinueHref("https://evil.example/phish"), "/");
  });

  it("falls back to `/` for a protocol-relative value (the WHATWG-normalization open-redirect shape safe-redirect.ts's own header documents)", async () => {
    assert.equal(await saveAndReadContinueHref("//evil.example"), "/");
  });

  it("renderPasswordResetRoute forwards its `next` argument down to PasswordResetForm as a plain prop", async () => {
    const face = await renderPasswordResetRoute(async () => RECOVERY_SESSION, "/work?view=needs-you");
    assert.equal((face.props as { next?: string | null }).next, "/work?view=needs-you");
  });

  it("renderPasswordResetRoute defaults `next` to null when the route was reached with none", async () => {
    const face = await renderPasswordResetRoute(async () => RECOVERY_SESSION);
    assert.equal((face.props as { next?: string | null }).next, null);
  });

  // ---------------------------------------------------------------------
  // #622 — the recovery-request's OWN rate limit, distinct from a generic
  // provider refusal. "Not walled; a Supabase `over_email_send_rate_limit`
  // surfaces as `sendError.message` in a generic banner" was the brief's own
  // description of the gap; GoTrue's message for THIS ONE code embeds the
  // wait it measured ("For security purposes, you can only request this
  // after N seconds." — verified via Context7 `/supabase/auth`,
  // `SMTP.MaxFrequency`'s documented format, 2026-09-13), so this state
  // parses it and renders the shared `wait-seconds.ts` clamp-and-flag idiom
  // (`resend-wall.ts`'s own contract for its identical provider cooldown)
  // instead of the raw sentence.
  // ---------------------------------------------------------------------

  it("over_email_send_rate_limit renders a DISTINCT rate-limited state, not the provider's raw sentence", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({
      auth: {
        resetPasswordForEmail: async () => ({
          error: { message: "For security purposes, you can only request this after 47 seconds.", code: "over_email_send_rate_limit" },
        }),
      },
    });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "aisyah@example.com"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 8; i++) await harness.settle();

      const text = harness.text();
      assert.match(text, /47 seconds/, "the parsed wait must reach the screen");
      assert.doesNotMatch(text, /For security purposes/, "the provider's raw sentence must not leak through as if this were the generic verbatim banner");
      assert.deepEqual(checkAccessibility(harness.container as never), []);
    } finally { await harness.unmount(); }
  });

  it("a wait longer than this card will print is CLAMPED and FLAGGED, never downgraded to a plain refusal", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({
      auth: {
        resetPasswordForEmail: async () => ({
          error: { message: "For security purposes, you can only request this after 1200 seconds.", code: "over_email_send_rate_limit" },
        }),
      },
    });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "aisyah@example.com"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 8; i++) await harness.settle();

      // 1200s exceeds the shared 900s display ceiling (`wait-seconds.ts`'s
      // `WAIT_SECONDS_CEILING`) and must be clamped to it and flagged, never
      // turned into "we couldn't send" — the wall answered perfectly.
      assert.match(harness.text(), /at least 900 seconds/);
    } finally { await harness.unmount(); }
  });

  it("a rate-limit message with no parseable number still renders the state, with the shared default wait", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({
      auth: {
        resetPasswordForEmail: async () => ({
          error: { message: "For security purposes, please try again later.", code: "over_email_send_rate_limit" },
        }),
      },
    });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "aisyah@example.com"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 8; i++) await harness.settle();

      assert.match(harness.text(), /60 seconds/, "the shared per-address send-cooldown default, never a silent zero or `unavailable`");
    } finally { await harness.unmount(); }
  });

  // ---------------------------------------------------------------------
  // #622 — the four LINK-failure states read off `/forgot-password?status=`,
  // each distinct from the others AND from the existing generic
  // `invalidLink` boolean (unchanged — still `password-reset-form.tsx`'s
  // absent-recovery-session fallback).
  // ---------------------------------------------------------------------

  it("the four link-failure states each render distinct, non-empty copy", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({ auth: { resetPasswordForEmail: async () => ({ error: null }) } });
    const seen = new Set<string>();
    for (const linkFailure of ["expired", "used_or_unknown", "refused", "rate_limited"] as const) {
      const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { linkFailure, createSupabaseClient: auth })));
      try {
        const text = harness.text();
        assert.ok(!seen.has(text), `linkFailure=${linkFailure} rendered copy identical to an earlier state`);
        seen.add(text);
        assert.deepEqual(checkAccessibility(harness.container as never), []);
      } finally { await harness.unmount(); }
    }
    assert.equal(seen.size, 4, "all four link-failure states must be genuinely distinct");
  });

  it("linkFailure does not disturb invalidLink — the existing absent-session fallback renders its own generic sentence unchanged", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({ auth: { resetPasswordForEmail: async () => ({ error: null }) } });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { invalidLink: true, createSupabaseClient: auth })));
    try {
      assert.match(harness.text(), /That reset link is invalid or has expired/);
    } finally { await harness.unmount(); }
  });

  // ---------------------------------------------------------------------
  // #622 — pending-submit identity (appendix D): inputs disabled (not only
  // the submit Button), `aria-busy` on the form, and focus landing on the
  // failure banner rather than wherever the disabled-input transition
  // dropped it — the same rule `signup-legal-stage.tsx`'s "FOCUS LANDS ON
  // THE RECEIPT" test pins for its own state transition.
  // ---------------------------------------------------------------------

  it("while the recovery request is in flight the email input is disabled and the form is aria-busy", async () => {
    const gate = deferred<{ error: null }>();
    const auth = (): PasswordRecoveryAuthClient => ({ auth: { resetPasswordForEmail: () => gate.promise } });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "aisyah@example.com"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      await harness.settle();

      const emailNode = find(harness.container as never, labelledInput(/Email/)) as Node;
      const submit = find(harness.container as never, (node) => node.tagName === "BUTTON") as Node;
      assert.equal(emailNode.disabled, true, "the email field must be disabled while the request is in flight");
      assert.equal(submit.disabled, true);
      assert.equal(attr(find(harness.container as never, (node) => node.tagName === "FORM") as Node, "aria-busy"), "true");

      gate.resolve({ error: null });
      for (let i = 0; i < 8; i++) await harness.settle();
    } finally { await harness.unmount(); }
  });

  it("FOCUS LANDS ON THE FAILURE BANNER after a rate-limited submit, never left on <body>", async () => {
    const auth = (): PasswordRecoveryAuthClient => ({
      auth: {
        resetPasswordForEmail: async () => ({
          error: { message: "For security purposes, you can only request this after 30 seconds.", code: "over_email_send_rate_limit" },
        }),
      },
    });
    const harness = await renderComponent(App(createElement(PasswordRecoveryForm, { createSupabaseClient: auth })));
    try {
      const email = find(harness.container as never, labelledInput(/Email/));
      await harness.act(() => setFieldValue(email as never, "aisyah@example.com"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 8; i++) await harness.settle();

      const focused = activeElement() as Node | null;
      assert.ok(focused, "nothing holds focus after the failed submit");
      assert.notEqual((focused as { tagName?: string }).tagName, "BODY", "focus was dumped on <body> when the inputs were disabled mid-submit");
      assert.match(textOf(focused as never), /30 seconds/, "focus must land on the banner reporting THIS failure");
      assert.equal(attr(focused as Node, "tabindex"), "-1", "a destination focus target, not a new tab stop");
    } finally { await harness.unmount(); }
  });

  // ---------------------------------------------------------------------
  // #622 — the SAME pending-submit-identity gap on `PasswordResetForm`.
  // ---------------------------------------------------------------------

  it("while saving the new password the field is disabled and the form is aria-busy", async () => {
    const gate = deferred<{ error: null }>();
    const auth = (): PasswordResetAuthClient => ({ auth: { updateUser: () => gate.promise } });
    const harness = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: auth })));
    try {
      const password = find(harness.container as never, labelledInput(/New password/));
      await harness.act(() => setFieldValue(password as never, "A-valid-password-123!"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      await harness.settle();

      const passwordNode = find(harness.container as never, labelledInput(/New password/)) as Node;
      const submit = find(harness.container as never, (node) => node.tagName === "BUTTON") as Node;
      assert.equal(passwordNode.disabled, true, "the password field must be disabled while saving");
      assert.equal(submit.disabled, true);
      assert.equal(attr(find(harness.container as never, (node) => node.tagName === "FORM") as Node, "aria-busy"), "true");

      gate.resolve({ error: null });
      for (let i = 0; i < 8; i++) await harness.settle();
    } finally { await harness.unmount(); }
  });

  it("FOCUS LANDS ON THE FAILURE BANNER after a policy refusal on PasswordResetForm, never left on <body>", async () => {
    const auth = (): PasswordResetAuthClient => ({
      auth: { updateUser: async () => ({ error: { message: "Password should be at least 12 characters" } }) },
    });
    const harness = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: auth })));
    try {
      const password = find(harness.container as never, labelledInput(/New password/));
      await harness.act(() => setFieldValue(password as never, "short"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 8; i++) await harness.settle();

      const focused = activeElement() as Node | null;
      assert.ok(focused, "nothing holds focus after the failed submit");
      assert.notEqual((focused as { tagName?: string }).tagName, "BODY");
      assert.match(textOf(focused as never), /Password should be at least 12 characters/);
      assert.equal(attr(focused as Node, "tabindex"), "-1");
    } finally { await harness.unmount(); }
  });
});
