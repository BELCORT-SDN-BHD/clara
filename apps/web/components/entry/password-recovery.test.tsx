import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, it } from "node:test";

import { checkAccessibility } from "../../test/a11yRules";
import { enableDomInspection } from "../../test/domInspect";
import { renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { checkKeyboardWalk, focusableElements } from "../../test/keyboardWalk";
import messages from "../../messages/en.json";
import { PasswordRecoveryForm, type PasswordRecoveryAuthClient } from "./password-recovery-form";
import { PasswordResetForm, type PasswordResetAuthClient } from "./password-reset-form";

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

describe("password recovery entry faces", () => {
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
    const seen: string[] = [];
    const auth = (): PasswordResetAuthClient => ({ auth: { updateUser: async ({ password }) => { seen.push(password); return { error: { message: "Password is known to be compromised" } }; } } });
    const harness = await renderComponent(App(createElement(PasswordResetForm, { createSupabaseClient: auth })));
    try {
      const password = find(harness.container as never, labelledInput(/New password/));
      await harness.act(() => setFieldValue(password as never, "compromised-password"));
      const form = find(harness.container as never, (node) => node.tagName === "FORM");
      await harness.fireEvent(form as never, "submit");
      for (let i = 0; i < 4; i++) await harness.settle();
      assert.deepEqual(seen, ["compromised-password"]);
      assert.match(harness.text(), /Password is known to be compromised/);
      assert.deepEqual(checkAccessibility(harness.container as never), []);
    } finally { await harness.unmount(); }
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
