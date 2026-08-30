// GATE (c) — keyboard-walk scan of both signup steps.
//
// This is the only self-serve way into the product (裁-57). A control here that
// renders but cannot be reached or operated from the keyboard locks a paying
// firm out at the door with no second route in — the same argument the invite
// journey's own keyboard file makes, for the other entrance.
//
// THE DPA GATE IS DRIVEN, NOT READ, and it is driven TWICE over. The live
// `disabled` is asserted directly (what the harness's own `clickButton` header
// prescribes for a gate), and then the form is submitted OUTRIGHT with the box
// unticked — which is what Enter in a text field does, bypassing the disabled
// button entirely. Nothing may be created either way. The second half is the one
// that matters: a form relying on `disabled` alone passes the first and fails
// the second.
//
// `clickButton` is deliberately absent from this file. It invokes an `onClick`
// prop and THROWS when there is none, and every submit here is a `type="submit"`
// button whose submission belongs to the form — so routing one through it would
// throw for a reason that has nothing to do with the gate under test.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, setFieldValue, setNativeValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
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
const theCheckbox = (n: Node) => n.tagName === "INPUT" && n.type === "checkbox";
const byLabelledField = (label: RegExp) => (n: Node) =>
  (n.tagName === "INPUT" || n.tagName === "TEXTAREA") && label.test(textOf((n.parentNode ?? {}) as never));

async function submitAcceptedAccount(
  h: Awaited<ReturnType<typeof renderComponent>>,
): Promise<void> {
  const email = findIn(h.container as never, byLabelledField(/Email/));
  const password = findIn(h.container as never, byLabelledField(/Password/));
  const box = findIn(h.container as never, theCheckbox);
  const form = findIn(h.container as never, (n) => n.tagName === "FORM");
  assert.ok(email && password && box && form, "the complete signup form must render");
  await h.act(() => {
    setFieldValue(email as never, "aisyah@example.com");
    setFieldValue(password as never, "correct horse battery");
  });
  await h.fireEvent(box as never, "click", (n) => setNativeValue(n as never, "checked", true));
  for (let i = 0; i < 3; i++) await h.settle();
  await h.fireEvent(form as never, "submit");
  for (let i = 0; i < 6; i++) await h.settle();
}

test("THE ACCOUNT STEP IS KEYBOARD-OPERABLE, and the DPA gate is a REAL wall", async () => {
  let created = false;
  const router: Router = { replaced: [] };
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async () => {
        created = true;
        return { data: { user: { id: "u1" }, session: null }, error: null };
      },
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
      const box = findIn(h.container as never, theCheckbox);
      const submit = findIn(h.container as never, byButtonText(/Create account/));
      assert.ok(email && password && box && submit, "every control on the account step must render");

      const reachable = focusableElements(h.container as never);
      for (const [name, node] of [["email", email], ["password", password], ["the DPA checkbox", box]] as const) {
        assert.ok(reachable.includes(node as never), `${name} must be keyboard-reachable`);
      }
      assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations");

      // ===== THE WALL, CLOSED. =====
      // The gate is asserted on the live `disabled` DIRECTLY, which is what the
      // harness's own `clickButton` header instructs: "A test that means to
      // prove a control is disabled asserts `.disabled` directly, never routes
      // a click through it and hopes nothing happens."
      assert.equal((submit as Node).disabled, true, "the submit is open before the DPA is accepted");
      // And the wall is proved BEHAVIOURALLY too, not only by the attribute:
      // submitting the form outright — which is what Enter in a text field
      // does, bypassing the disabled button entirely — must still create
      // nothing, because the handler re-checks the gate at the act. A form that
      // relied on `disabled` alone would create an account here.
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      assert.ok(form, "the account form must render");
      await h.act(() => {
        setFieldValue(email as never, "aisyah@example.com");
        setFieldValue(password as never, "correct horse battery");
      });
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(created, false, "an account was created with the DPA unaccepted");
      assert.doesNotMatch(textOf(h.container as never), /Confirm your email/, "the surface advanced anyway");

      // ===== THE WALL, OPENED — on the real checkbox, through a real click
      // event, the idiom components/bank/matching-section.test.tsx established:
      // the native value is set INSIDE the dispatch so React's onChange sees a
      // value that genuinely differs from its snapshot. A bare
      // `setNativeValue` writes the DOM property and never reaches React, so
      // the component's state would silently stay `false` — measured here. =====
      await h.fireEvent(box as never, "click", (n) => setNativeValue(n as never, "checked", true));
      for (let i = 0; i < 3; i++) await h.settle();
      const liveSubmit = findIn(h.container as never, byButtonText(/Create account/));
      assert.notEqual((liveSubmit as Node).disabled, true, "the submit stayed shut after the DPA was accepted");
      assert.ok(
        focusableElements(h.container as never).includes(liveSubmit as never),
        "the submit must be keyboard-reachable once it is live",
      );
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

test("N1: emailRedirectTo is the exact origin /auth/confirm URL and ignores the query string", async () => {
  type SignupCredentials = Parameters<SignupAuthClient["auth"]["signUp"]>[0];
  let captured: SignupCredentials | null = null;
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async (credentials) => {
        captured = credentials;
        return { data: { user: { id: "u1" }, session: null }, error: null };
      },
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
        assert.equal(
          captured?.options?.emailRedirectTo,
          "https://app.clarabook.example/auth/confirm",
          "the confirmation target was sourced from caller-controlled query input",
        );
        assert.doesNotMatch(captured?.options?.emailRedirectTo ?? "", /evil\.example/);
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

test("N2: Supabase's auto-confirm {user, session} shape refuses the misconfigured project", async () => {
  const client: () => SignupAuthClient = () => ({
    auth: {
      signUp: async () => ({
        data: { user: { id: "u1" }, session: { access_token: "jwt" } },
        error: null,
      }),
    },
  });
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, { createSupabaseClient: client }), { replaced: [] }),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      await submitAcceptedAccount(h);
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

test("LOW-3: the signup password field carries the same 8-character courtesy floor as invite", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, { createSupabaseClient: () => ({ auth: { signUp: async () => ({ data: { user: null, session: null }, error: null }) } }) }), { replaced: [] }),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const password = findIn(h.container as never, byLabelledField(/Password/)) as unknown as Record<string, unknown> | null;
      assert.ok(password, "the signup password field did not render");
      const propsKey = Object.keys(password).find((key) => key.startsWith("__reactProps"));
      assert.ok(propsKey, "the password field's live React props were not observable");
      assert.equal((password[propsKey] as { minLength?: number }).minLength, 8);
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
