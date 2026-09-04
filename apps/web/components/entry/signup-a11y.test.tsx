// GATE (b) — structural a11y scan of BOTH signup steps, all six states.
//
// A NEW SURFACE, so every state it can render is scanned rather than the happy
// one: the account form, its verbatim auth-error banner, the check-your-email
// confirmation, the firm form, and the firm form carrying a governed refusal.
//
// FS-4 C-6: the DPA checkbox this file used to drive on the ACCOUNT step is
// gone (checkout-gate-design.md §1.1 moved the real DPA e-sign to a later
// step — `signup-dpa-form.test.tsx` covers that surface's own a11y instead).
// This form now gates on ordinary field validation only.
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

import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { recalledSignupEmail } from "../../lib/registration/signup-email-storage";
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
    signOut: async () => ({ error: null }),
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
const byLabelledField = (label: RegExp) => (n: Node) =>
  (n.tagName === "INPUT" || n.tagName === "TEXTAREA") && label.test(textOf((n.parentNode ?? {}) as never));

/**
 * A REAL in-memory `sessionStorage`, installed for one cell and removed after.
 *
 * The harness's `window` carries no storage at all, so `rememberSignupEmail`'s
 * own try/catch swallows the write and every prefill reads back `null` — three
 * identical nulls, which is exactly the vacuous green the enumeration cell must
 * not be allowed to have. This gives the production module something to write
 * to, so the read-back is a measurement rather than an absence.
 */
async function withSessionStorage(run: () => Promise<void>): Promise<void> {
  const w = globalThis.window as unknown as Record<string, unknown>;
  const had = Object.prototype.hasOwnProperty.call(w, "sessionStorage");
  const previous = w.sessionStorage;
  const store = new Map<string, string>();
  w.sessionStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k) as string : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
  };
  try {
    await run();
  } finally {
    if (had) w.sessionStorage = previous;
    else delete w.sessionStorage;
  }
}

/** Every `href` in the tree, in DOM order — the instrument H-35's cell reads,
 *  because a route is decided by where the anchor POINTS, not by its label. */
function collectAnchors(root: Node): string[] {
  const out: string[] = [];
  (function walk(n: Node) {
    if (n.tagName === "A") {
      const href = (n as unknown as { getAttribute?: (k: string) => string | null })
        .getAttribute?.("href");
      if (typeof href === "string") out.push(href);
    }
    for (const c of n.childNodes ?? []) walk(c);
  })(root);
  return out;
}

test("the account step has zero a11y violations", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(App(createElement(SignupAccountForm, { createSupabaseClient: authClient() })));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(textOf(h.container as never), /Create your account/, "the account step must have rendered");
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

test("a non-enumerating AUTH-ERROR state keeps the provider message and has zero violations", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(
      App(createElement(SignupAccountForm, {
        createSupabaseClient: authClient({
          signUp: async () => ({
            data: { user: null, session: null },
            error: { message: "Auth service unavailable", code: "unexpected_failure", status: 500 },
          }),
        }),
      })),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(h.container as never), /Auth service unavailable/, "the auth error must have rendered");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("NEW: fresh, identities-empty, and duplicate responses have indistinguishable public copy, timing shape AND prefill state", async () => {
  // REVIEW-544 WIDENED THIS CELL, and the reason is the whole point of the
  // widening: this card now carries a CONTROL, so "the three shapes render the
  // same text" stopped being sufficient. The /auth/confirm link leads to a form
  // that prefills from this browser's remembered address, and a version that
  // wrote the address on the fresh arm only would have handed the person an
  // oracle one click past the screen this cell was watching — prefilled means
  // new, blank means existing. A copy-only assertion could never see it.
  //
  // So the observation moves to the CHANNEL. A real in-memory `sessionStorage`
  // is installed on `window`, the production `signup-email-storage.ts` writes
  // through it, and the address is read back through `recalledSignupEmail()` —
  // the same function `EmailConfirmationCard`'s mount effect calls. What is
  // asserted is the prefill the next screen will actually perform, not that
  // some function was called.
  const TYPED = "aisyah@example.com";
  const responses: Array<Awaited<ReturnType<SignupAuthClient["auth"]["signUp"]>>> = [
    {
      data: { user: { id: "new-user", identities: [{ id: "email-identity" }] }, session: null },
      error: null,
    },
    {
      data: { user: { id: "obfuscated-user", identities: [] }, session: null },
      error: null,
    },
    {
      data: { user: null, session: null },
      error: { message: "User already registered", code: "user_already_exists", status: 422 },
    },
  ];
  const publicCopies: string[] = [];
  const prefills: Array<string | null> = [];

  await withEnv(async () => jsonResponse({}), async () => {
    for (const response of responses) {
      await withSessionStorage(async () => {
        const h = await renderComponent(
          App(createElement(SignupAccountForm, {
            createSupabaseClient: authClient({ signUp: async () => response }),
          })),
        );
        try {
          for (let i = 0; i < 3; i++) await h.settle();
          // The address has to be TYPED for this to mean anything: the arm
          // under test writes whatever is in the field, so a cell that left it
          // empty would compare three empty prefills and pass on any build.
          const email = findIn(h.container as never, byLabelledField(/Email/));
          const password = findIn(h.container as never, byLabelledField(/Password/));
          assert.ok(email && password, "both fields must render");
          await h.act(() => {
            setFieldValue(email as never, TYPED);
            setFieldValue(password as never, "correct horse battery staple");
          });
          const form = findIn(h.container as never, (node) => node.tagName === "FORM");
          await h.fireEvent(form as never, "submit");
          // Every shape crosses one awaited signUp and the same six settlement
          // turns before observation; no duplicate-only intermediate state.
          for (let i = 0; i < 6; i++) await h.settle();
          const copy = textOf(h.container as never);
          assert.match(copy, /Confirm your email/);
          assert.doesNotMatch(copy, /User already registered/i);
          publicCopies.push(copy);
          prefills.push(recalledSignupEmail());
        } finally {
          await h.unmount();
        }
      });
    }
  });

  assert.equal(new Set(publicCopies).size, 1, "the public response disclosed which account shape occurred");
  // THE DESTINATION IS IDENTICAL TOO. Every arm that reaches the check-email
  // card left the same address behind for the code form to prefill.
  assert.deepEqual(
    prefills,
    [TYPED, TYPED, TYPED],
    "the arms disagree about what /auth/confirm will prefill — that difference IS the enumeration oracle",
  );
});

test("the CHECK-YOUR-EMAIL state has zero a11y violations", async () => {
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(App(createElement(SignupAccountForm, { createSupabaseClient: authClient() })));
    try {
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

test("H-35 — THE CHECK-EMAIL CARD RENDERS A ROUTE TO /auth/confirm, and promises no resend", async () => {
  // THE DEFECT. The mail carries a six-digit code and nothing to click (裁-92),
  // and this card carried no link either — its only anchor went to /login. The
  // person's sole route to the code form was typing the URL. The banner
  // meanwhile promised "the next screen", which is copy naming a control the
  // render omits.
  //
  // Asserted on the ANCHOR, not on the label: a cell matching the button text
  // would stay green if the href moved, and the href is the part that decides
  // whether the person can get there.
  await withEnv(async () => jsonResponse({}), async () => {
    const h = await renderComponent(App(createElement(SignupAccountForm, { createSupabaseClient: authClient() })));
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();
      const text = textOf(h.container as never);
      assert.match(text, /Confirm your email/, "the confirmation state must have rendered");

      const anchors = collectAnchors(h.container as never);
      assert.ok(
        anchors.includes("/auth/confirm"),
        `the check-email card offers no route to the code form (hrefs: ${anchors.join(", ") || "none"})`,
      );
      // The sign-in line survives as the SECONDARY route, so this cell cannot
      // pass by the primary control having replaced it.
      assert.ok(anchors.includes("/login"), "the 'already confirmed' route was lost");

      // NOTHING INSTRUCTS A RESEND while `confirmation-resend.ts`'s production
      // default refuses every one. The distinction is deliberate and is the
      // whole shape of the honest fix: the card MAY say a code cannot be
      // resent (it does, and that sentence is the recovery path), and it may
      // NOT tell the person to ask for one. So the matcher hunts the
      // INSTRUCTION, not the word.
      const RESEND_INSTRUCTION = /request a new (one|code)|send me a new|resend (it|your|the)|we'?ll (re)?send you another/i;
      assert.doesNotMatch(text, RESEND_INSTRUCTION,
        "the check-email card tells the person to ask for a resend this build refuses");
      // VACUITY CONTROL: the matcher fires on the sentences it hunts — both
      // the ones this fix removed from ConfirmEmail's own copy.
      assert.match("Request a new one below.", RESEND_INSTRUCTION);
      assert.match("Wait about 5 minutes, or request a new code.", RESEND_INSTRUCTION);
      assert.match("Send me a new code", RESEND_INSTRUCTION);
      // And the honest sentence is NOT what it fires on — otherwise the cell
      // would forbid saying the true thing.
      assert.doesNotMatch("We can't resend one from here in this build.", RESEND_INSTRUCTION);
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
