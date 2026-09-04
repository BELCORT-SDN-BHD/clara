// GATE (c) — keyboard-walk scan of both signup steps.
//
// This is the only self-serve way into the product (裁-57). A control here that
// renders but cannot be reached or operated from the keyboard locks a paying
// firm out at the door with no second route in — the same argument the invite
// journey's own keyboard file makes, for the other entrance.
//
// FS-4 C-6 MOVED THE DPA GATE OFF THIS STEP. checkout-gate-design.md §1.1
// places the real e-sign at a LATER step (`signup-dpa-form.tsx`, reached once
// an open registration exists) rather than as a checkbox on account creation
// — that file's own keyboard/a11y coverage lives beside it
// (`signup-dpa-form.test.tsx`). The account step below now gates on nothing
// but ordinary field validation.
//
// `clickButton` is deliberately absent from this file. It invokes an `onClick`
// prop and THROWS when there is none, and every submit here is a `type="submit"`
// button whose submission belongs to the form — so routing one through it would
// throw for a reason that has nothing to do with what is under test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { PASSWORD_MIN_LENGTH } from "../../lib/auth/password-policy";
import { AUTH_COOKIE_NAME } from "../../lib/supabase/cookie-options";
import messages from "../../messages/en.json";
import { SignupAccountForm, type SignupAuthClient } from "./signup-account-form";
import { SignupFirmForm } from "./signup-firm-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; disabled?: boolean; type?: string };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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

type Router = { replaced: string[] };

function App(node: ReactElement, router: Router) {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: (href: string) => { router.replaced.push(href); },
          refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
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
const byLabelledField = (label: RegExp) => (n: Node) =>
  (n.tagName === "INPUT" || n.tagName === "TEXTAREA") && label.test(textOf((n.parentNode ?? {}) as never));

/** FS-4 C-6: the account step no longer carries a DPA gate — the checkbox
 *  click this helper used to drive is gone (checkout-gate-design.md §1.1
 *  moved the real e-sign to a later step). */
async function submitAcceptedAccount(
  h: Awaited<ReturnType<typeof renderComponent>>,
): Promise<void> {
  const email = findIn(h.container as never, byLabelledField(/Email/));
  const password = findIn(h.container as never, byLabelledField(/Password/));
  const form = findIn(h.container as never, (n) => n.tagName === "FORM");
  assert.ok(email && password && form, "the complete signup form must render");
  await h.act(() => {
    setFieldValue(email as never, "aisyah@example.com");
    setFieldValue(password as never, "correct horse battery");
  });
  await h.fireEvent(form as never, "submit");
  for (let i = 0; i < 6; i++) await h.settle();
}

class BrowserCookieJar {
  readonly values = new Map<string, string>();

  getAll(): Array<{ name: string; value: string }> {
    return [...this.values].map(([name, value]) => ({ name, value }));
  }

  setAll(cookies: Array<{
    name: string;
    value: string;
    options: { maxAge?: number };
  }>): void {
    for (const { name, value, options } of cookies) {
      if (value === "" || options.maxAge === 0) this.values.delete(name);
      else this.values.set(name, value);
    }
  }
}

test("THE ACCOUNT STEP IS KEYBOARD-OPERABLE, and a keyboard-only run creates the account", async () => {
  // FS-4 C-6: the checkbox gate this cell used to prove is gone from THIS
  // step (checkout-gate-design.md §1.1 moved the real DPA e-sign to
  // `signup-dpa-form.tsx`, reached later once a registration is open). What
  // remains to prove here is simpler and unchanged: every control reachable,
  // no tabindex/focus-visible violations, and a keyboard-only submit works.
  let created = false;
  const router: Router = { replaced: [] };
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async () => {
        created = true;
        return { data: { user: { id: "u1" }, session: null }, error: null };
      },
      signOut: async () => ({ error: null }),
    },
  });

  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, { createSupabaseClient: client }), router),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();

      const email = findIn(h.container as never, byLabelledField(/Email/));
      const password = findIn(h.container as never, byLabelledField(/Password/));
      const submit = findIn(h.container as never, byButtonText(/Create account/));
      assert.ok(email && password && submit, "every control on the account step must render");

      const reachable = focusableElements(h.container as never);
      for (const [name, node] of [["email", email], ["password", password], ["submit", submit]] as const) {
        assert.ok(reachable.includes(node as never), `${name} must be keyboard-reachable`);
      }
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations");
      assert.notEqual((submit as Node).disabled, true, "the submit must not be gated on this step");

      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      assert.ok(form, "the account form must render");
      await h.act(() => {
        setFieldValue(email as never, "aisyah@example.com");
        setFieldValue(password as never, "correct horse battery");
      });
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();

      // THE DISCRIMINATING POST-CONDITION: a keyboard-only run genuinely
      // created the account and moved the surface on. True only after the act.
      assert.equal(created, true, "the keyboard-driven journey did not create the account");
      assert.match(textOf(h.container as never), /Confirm your email/);
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no violations on the confirmation state");
    } finally {
      await h.unmount();
    }
  });
});

test("N1, RETIRED BY H-35: signUp passes NO redirect at all, so no URL can be sourced from anywhere", async () => {
  // WHAT THIS CELL USED TO ASSERT, and why the change is a strengthening
  // rather than a deletion of coverage. N1 guarded that `emailRedirectTo` was
  // built from `window.location.origin` and never from the query string — a
  // real open-redirect concern while the mail carried a link. 裁-92 replaced
  // that link with a six-digit code (the deployed Confirm-signup template
  // emits `{{ .Token }}` and nothing to click), so the option had been INERT
  // for a while under a comment describing the retired journey. PR 541 deletes
  // it, and the property to hold is now stronger and simpler: there is no
  // redirect URL in the call for an attacker to influence.
  //
  // The hostile query string is still planted, so this is not merely "the
  // field is absent" — it is "the field is absent WHILE a caller-controlled
  // value is sitting in `location.search` waiting to be picked up".
  type SignupCredentials = Parameters<SignupAuthClient["auth"]["signUp"]>[0];
  let captured: SignupCredentials | null = null;
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async (credentials) => {
        captured = credentials;
        return { data: { user: { id: "u1" }, session: null }, error: null };
      },
      signOut: async () => ({ error: null }),
    },
  });
  const location = window.location as unknown as { origin?: string; search?: string };
  const previousOrigin = location.origin;
  const previousSearch = location.search;
  location.origin = "https://app.clarabook.example";
  location.search = "?r=https%3A%2F%2Fevil.example%2Ftake-token";

  try {
    await withEnv(async () => jsonResponse({}), async () => {
      const h = await renderComponent(
        App(createElement(SignupAccountForm, { createSupabaseClient: client }), { replaced: [] }),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        await submitAcceptedAccount(h);
        assert.ok(captured, "signUp was never called");
        assert.equal(
          (captured as SignupCredentials).options,
          undefined,
          "signUp still carries an options bag — the dead emailRedirectTo is back",
        );
        // The two fields that DO travel are unchanged, so this cell cannot
        // pass because the whole call collapsed.
        assert.equal(typeof (captured as SignupCredentials).email, "string");
        assert.equal(typeof (captured as SignupCredentials).password, "string");
        // And nothing anywhere in the call carries the planted value.
        assert.doesNotMatch(JSON.stringify(captured), /evil\.example/);
      } finally {
        await h.unmount();
      }
    });
  } finally {
    if (previousOrigin === undefined) delete location.origin;
    else location.origin = previousOrigin;
    if (previousSearch === undefined) delete location.search;
    else location.search = previousSearch;
  }
});

test("NEW-2: auto-confirm containment signs out locally before painting the refusal", async () => {
  let releaseSignOut!: () => void;
  const signOutGate = new Promise<void>((resolve) => { releaseSignOut = resolve; });
  const order: string[] = [];
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async () => {
        order.push("signUp");
        return {
          data: { user: { id: "u1" }, session: { access_token: "jwt" } },
          error: null,
        };
      },
      signOut: async (options) => {
        assert.deepEqual(options, { scope: "local" });
        order.push("signOut");
        await signOutGate;
        return { error: null };
      },
    },
  });
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, { createSupabaseClient: client }), { replaced: [] }),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      await submitAcceptedAccount(h);
      assert.deepEqual(order, ["signUp", "signOut"]);
      assert.doesNotMatch(
        textOf(h.container as never),
        /sign-up confirmation is not enforced on this project/i,
        "the refusal painted before local session containment finished",
      );
      releaseSignOut();
      for (let i = 0; i < 6; i++) await h.settle();
      const text = textOf(h.container as never);
      assert.match(
        text,
        /sign-up confirmation is not enforced on this project/i,
        "the auto-confirmed session did not produce the configuration refusal",
      );
      assert.doesNotMatch(text, /Tell us about your firm/, "the misconfigured project reached step 2");
      assert.doesNotMatch(text, /Confirm your email/, "the auto-confirm shape was mislabelled as confirmation-required");
    } finally {
      await h.unmount();
    }
  });
});

test("NEW-2: auto-confirm containment deletes the persisted auth cookie", async () => {
  const subject = "11111111-1111-1111-1111-111111111111";
  const jar = new BrowserCookieJar();
  jar.values.set(AUTH_COOKIE_NAME, "persisted-session");
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async () => ({
        data: { user: { id: subject }, session: { access_token: "autoconfirmed" } },
        error: null,
      }),
      signOut: async (options) => {
        assert.deepEqual(options, { scope: "local" });
        jar.setAll([{
          name: AUTH_COOKIE_NAME,
          value: "",
          options: { maxAge: 0 },
        }]);
        return { error: null };
      },
    },
  });

  assert.ok(
    jar.values.has(AUTH_COOKIE_NAME),
    "the deletion cell started without a persisted auth cookie",
  );

  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, { createSupabaseClient: client }), { replaced: [] }),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      await submitAcceptedAccount(h);
      assert.match(
        textOf(h.container as never),
        /sign-up confirmation is not enforced on this project/i,
      );
      assert.equal(
        jar.values.has(AUTH_COOKIE_NAME),
        false,
        "the local sign-out returned but left the auth cookie persisted",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("LOW-3, moved to the shared constant (PR 541 stage 2): the signup password field carries PASSWORD_MIN_LENGTH", async () => {
  // WHAT MOVED AND WHY THE NUMBER IS NOT RE-TYPED. This cell used to pin the
  // literal 8 — "the same courtesy floor as invite" — which was true and was
  // the problem: both entry surfaces sat four characters below the hosted
  // policy the reset face already stated, and a cell asserting its own
  // spelling could never notice. It now reads the SHARED CONSTANT, so the pin
  // moves with the policy and cannot disagree with what ships (review law 3).
  // The estate-wide version of this — every new-password surface, plus the
  // sign-in field that must NOT carry it — is `components/password-policy.test.tsx`.
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, { createSupabaseClient: () => ({ auth: { signUp: async () => ({ data: { user: null, session: null }, error: null }), signOut: async () => ({ error: null }) } }) }), { replaced: [] }),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const password = findIn(h.container as never, byLabelledField(/Password/)) as unknown as Record<string, unknown> | null;
      assert.ok(password, "the signup password field did not render");
      const propsKey = Object.keys(password).find((key) => key.startsWith("__reactProps"));
      assert.ok(propsKey, "the password field's live React props were not observable");
      assert.equal((password[propsKey] as { minLength?: number }).minLength, PASSWORD_MIN_LENGTH);
    } finally {
      await h.unmount();
    }
  });
});

test("THE FIRM STEP IS KEYBOARD-OPERABLE, and a keyboard-only run reaches /pending", async () => {
  const seen: string[] = [];
  const router: Router = { replaced: [] };
  await withEnv(
    (async (u: RequestInfo | URL) => {
      const url = String(u);
      seen.push(url.slice(url.indexOf("/rpc/") + 5));
      return url.includes("claim_identity")
        ? jsonResponse({ user_id: "u1" })
        : jsonResponse({ request_id: "r1", status: "open" });
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(SignupFirmForm), router));
      try {
        for (let i = 0; i < 3; i++) await h.settle();

        const name = findIn(h.container as never, byLabelledField(/Your name/));
        const firm = findIn(h.container as never, byLabelledField(/Firm name/));
        const note = findIn(h.container as never, byLabelledField(/should know/));
        const submit = findIn(h.container as never, byButtonText(/Register my firm/));
        assert.ok(name && firm && note && submit, "every control on the firm step must render");

        const reachable = focusableElements(h.container as never);
        for (const [label, node] of [["your name", name], ["firm name", firm], ["the note", note], ["the submit", submit]] as const) {
          assert.ok(reachable.includes(node as never), `${label} must be keyboard-reachable`);
        }
        assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no violations on the firm step");
        assert.notEqual((submit as Node).disabled, true, "the submit is open before the act");

        await h.act(() => {
          setFieldValue(name as never, "Aisyah Rahman");
          setFieldValue(firm as never, "ROME PROPERTIES");
        });
        // `fireEvent(form, "submit")` is what a browser does when Enter or Space
        // lands on the focused submit button. `clickButton` is NOT used on a
        // `type="submit"` control: it invokes an `onClick` prop, which such a
        // button does not have, and the stub DOM implements no implicit form
        // submission. The gate is covered by the `disabled` assertion above.
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        assert.ok(form, "the firm form must render");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();

        // THE DISCRIMINATING POST-CONDITION: both doors ran, in order, from a
        // keyboard-only run, and only then did it leave.
        assert.deepEqual(seen, ["claim_identity", "request_firm_registration"]);
        assert.deepEqual(router.replaced, ["/pending"]);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the REFUSAL state stays keyboard-operable — the person can correct and resubmit", async () => {
  let attempt = 0;
  const router: Router = { replaced: [] };
  await withEnv(
    (async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("claim_identity")) return jsonResponse({ user_id: "u1" });
      attempt += 1;
      return attempt === 1
        ? jsonResponse({ code: "CLR10", message: "firm name is required" }, 400)
        : jsonResponse({ request_id: "r1", status: "open" });
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(createElement(SignupFirmForm), router));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const name = findIn(h.container as never, byLabelledField(/Your name/));
        const firm = findIn(h.container as never, byLabelledField(/Firm name/));
        const submit = findIn(h.container as never, byButtonText(/Register my firm/));
        assert.ok(submit, "the submit must render");
        assert.notEqual((submit as Node).disabled, true, "the submit is open before the act");
        await h.act(() => {
          setFieldValue(name as never, "Aisyah Rahman");
          setFieldValue(firm as never, "x");
        });
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();
        assert.match(textOf(h.container as never), /firm name is required/, "the refusal must have rendered");
        assert.deepEqual(router.replaced, [], "a refusal must not navigate");

        // The recovery is the point: every control is still reachable and the
        // submit still admits an act, so a keyboard user is not stranded on the
        // refusal. A form that disabled itself after a refusal would strand them.
        assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no violations on the refusal state");
        const live = findIn(h.container as never, byButtonText(/Register my firm/));
        assert.ok(focusableElements(h.container as never).includes(live as never));
        assert.notEqual((live as Node).disabled, true, "the submit stayed disabled after a refusal");
        await h.act(() => { setFieldValue(findIn(h.container as never, byLabelledField(/Firm name/)) as never, "ROME PROPERTIES"); });
        await h.fireEvent(findIn(h.container as never, (n) => n.tagName === "FORM") as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();
        assert.deepEqual(router.replaced, ["/pending"], "the corrected resubmit did not complete");
      } finally {
        await h.unmount();
      }
    },
  );
});
