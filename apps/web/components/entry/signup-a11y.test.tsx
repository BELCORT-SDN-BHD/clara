// GATE (b) — structural a11y scan of BOTH signup steps, all six states.
//
// A NEW SURFACE, so every state it can render is scanned rather than the happy
// one: the account form, its DPA-unaccepted resting state, its verbatim
// auth-error banner, the check-your-email confirmation, the firm form, and the
// firm form carrying a governed refusal.
//
// NO SYNTHETIC <h1> WRAPPER, deliberately — and this is the one thing worth
// reading before copying the invite-accept a11y file's idiom. That file wraps
// its component in a fabricated `<h1>` because `CardTitle` is a `<div>` and the
// route owns the page heading. The hazard in that idiom is that it MASKS the
// absence of a real heading: the scan passes on a document the product never
// renders. These two components carry their OWN `<h1>`, so the scan here runs
// against the real composition and the cell below asserts the heading is real.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { renderComponent, textOf, setFieldValue, setNativeValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SignupAccountForm, type SignupAuthClient } from "./signup-account-form";
import { SignupFirmForm } from "./signup-firm-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; type?: string };

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

const authClient = (over: Partial<SignupAuthClient["auth"]> = {}): (() => SignupAuthClient) => () => ({
  auth: {
    signUp: async () => ({ data: { user: { id: "u1" }, session: null }, error: null }),
    ...over,
  },
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
const theCheckbox = (n: Node) => n.tagName === "INPUT" && n.type === "checkbox";
const byLabelledField = (label: RegExp) => (n: Node) =>
  (n.tagName === "INPUT" || n.tagName === "TEXTAREA") && label.test(textOf((n.parentNode ?? {}) as never));

test("the account step has zero a11y violations — DPA checkbox and all", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(App(createElement(SignupAccountForm, { createSupabaseClient: authClient() })));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(textOf(h.container as never), /Create your account/, "the account step must have rendered");
      // DISCRIMINATING: the checkbox is genuinely present, so a missing-label
      // violation would have somewhere to come from. A native checkbox with no
      // associated <label> is the single most likely a11y defect on this form.
      assert.ok(findIn(h.container as never, theCheckbox), "the DPA checkbox must render");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("THE HEADING IS REAL — this scan is not resting on a synthetic h1", async () => {
  // The masking hazard, closed by measurement. If `CardTitle`'s div were the
  // only "heading" on this surface, every cell in this file would still pass —
  // and the shipped page would have no h1 at all.
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(App(createElement(SignupAccountForm, { createSupabaseClient: authClient() })));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const h1 = findIn(h.container as never, (n) => n.tagName === "H1");
      assert.ok(h1, "the signup surface renders no <h1> of its own");
      assert.match(textOf(h1 as never), /Create your account/);
    } finally {
      await h.unmount();
    }
  });
});

test("the AUTH-ERROR state — Supabase's own message, verbatim — has zero violations", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, {
        createSupabaseClient: authClient({
          signUp: async () => ({ data: { user: null, session: null }, error: { message: "User already registered" } }),
        }),
      })),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const box = findIn(h.container as never, theCheckbox);
      await h.fireEvent(box as never, "click", (n) => setNativeValue(n as never, "checked", true));
      for (let i = 0; i < 3; i++) await h.settle();
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(h.container as never), /User already registered/, "the auth error must have rendered");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the CHECK-YOUR-EMAIL state has zero a11y violations", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(App(createElement(SignupAccountForm, { createSupabaseClient: authClient() })));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const box = findIn(h.container as never, theCheckbox);
      // The checkbox idiom components/bank/matching-section.test.tsx
      // established: the native value is set INSIDE a real click dispatch, so
      // React's onChange sees a value that differs from its snapshot. A bare
      // `setNativeValue` writes the DOM property and never reaches React.
      await h.fireEvent(box as never, "click", (n) => setNativeValue(n as never, "checked", true));
      for (let i = 0; i < 3; i++) await h.settle();
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(h.container as never), /Confirm your email/, "the confirmation state must have rendered");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the FIRM step has zero a11y violations", async () => {
  await withEnv(async () => jsonResponse({ user_id: "u1" }), async () => {
    const h = await renderComponent(App(createElement(SignupFirmForm)));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.ok(findIn(h.container as never, byLabelledField(/Firm name/)), "the firm field must render");
      assert.ok(findIn(h.container as never, byLabelledField(/should know/)), "the note textarea must render");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the FIRM step's REFUSAL banner has zero a11y violations", async () => {
  await withEnv(
    async (u: RequestInfo | URL) =>
      String(u).includes("claim_identity")
        ? jsonResponse({ user_id: "u1" })
        : jsonResponse({ code: "CLR09", message: "actor already belongs to a firm" }, 400),
    async () => {
      const h = await renderComponent(App(createElement(SignupFirmForm)));
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const name = findIn(h.container as never, byLabelledField(/Your name/));
        const firm = findIn(h.container as never, byLabelledField(/Firm name/));
        await h.act(() => {
          setFieldValue(name as never, "Aisyah Rahman");
          setFieldValue(firm as never, "ROME PROPERTIES");
        });
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();
        assert.match(textOf(h.container as never), /actor already belongs to a firm/, "the refusal must have rendered");
        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});
