import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it } from "node:test";

import { checkAccessibility } from "../../test/a11yRules";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import type { ServerSession } from "../../lib/supabase/server-session";
import { PasswordRecoveryForm, type PasswordRecoveryAuthClient } from "./password-recovery-form";
import { PasswordResetForm, type PasswordResetAuthClient } from "./password-reset-form";
import { renderPasswordResetRoute } from "./password-reset-route";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node };

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
});
