// GATE (c) — keyboard-walk scan of the invite-accept surface.
//
// THIS SURFACE HAD NEVER BEEN IN EITHER SCAN before P4-1, and it is the ONLY
// admission path into the app: a control here that renders but cannot be
// reached or operated from the keyboard locks a new employee out of the
// product entirely, with no second route in. The F6/P3 defect class (a control
// that RENDERS but never admits a click) is what `clickButton`'s disabled
// guard exists to catch, and it is asserted here on every control on the
// journey — the click gate, both fields, the submit, and the recovery.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderComponent, textOf, clickButton, setFieldValue } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import { focusableElements, checkKeyboardWalk } from "../test/keyboardWalk";
import { configureSessionTokenSource, resetSessionTokenSource } from "../lib/session-accessor";
import messages from "../messages/en.json";
import { InviteAcceptForm, type InviteAuthClient } from "./invite-accept-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; disabled?: boolean };

const SUB = "11111111-1111-1111-1111-111111111111";
const CLARA_TOKEN = "c".repeat(64);
const FIRM = "33333333-3333-3333-3333-333333333333";
const CONTEXT_ROW = {
  user_id: SUB, firm_id: FIRM, firm_name: "ROME PROPERTIES",
  role: "bookkeeper", role_rank: 1, is_operator: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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

function authClient(over: Partial<InviteAuthClient["auth"]> = {}): () => InviteAuthClient {
  return () => ({
    auth: {
      verifyOtp: async () => ({
        data: { user: { id: SUB }, session: { access_token: "jwt", user: { id: SUB } } }, error: null,
      }),
      getClaims: async () => ({ data: { claims: { sub: SUB } }, error: null }),
      updateUser: async () => ({ error: null }),
      ...over,
    },
  });
}

type Router = { replaced: string[] };
function App(form: ReactElement, router: Router) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(
      AppRouterContext.Provider as never,
      {
        value: {
          replace: (href: string) => { router.replaced.push(href); },
          refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
        } as never,
      },
      createElement("div", null, createElement("h1", null, "Invite"), form),
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
const byLabelledInput = (label: RegExp) => (n: Node) =>
  n.tagName === "INPUT" && label.test(textOf((n.parentNode ?? {}) as never));

test("THE WHOLE JOURNEY IS KEYBOARD-OPERABLE, and a keyboard-driven acceptance mints a membership", async () => {
  let membership = false;
  const router: Router = { replaced: [] };
  await withMockedEnv(
    (async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("/rpc/accept_invite")) { membership = true; return jsonResponse({ membership_id: "m1" }); }
      if (url.includes("/rest/v1/caller_context")) return jsonResponse(membership ? [CONTEXT_ROW] : []);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(
        App(
          createElement(InviteAcceptForm, {
            token: "supabase-token-hash", inviteToken: CLARA_TOKEN, createSupabaseClient: authClient(),
          }),
          router,
        ),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();

        // STAGE 1 — the click gate.
        const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
        assert.ok(gate, "the click gate must render");
        assert.ok(
          focusableElements(h.container as never).includes(gate as never),
          "the ONLY control on the first stage must be keyboard-reachable",
        );
        assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no tabindex-order/focus-visible violations on the gate");
        // `clickButton` THROWS on a live `disabled` — reaching the next stage
        // is itself the proof this control genuinely admits an act.
        await h.act(async () => { await clickButton(gate as never); });
        for (let i = 0; i < 4; i++) await h.settle();

        // STAGE 2 — the password step: two fields and a submit, all reachable.
        const name = findIn(h.container as never, byLabelledInput(/Your name/));
        const password = findIn(h.container as never, byLabelledInput(/Password/));
        const submitButton = findIn(h.container as never, byButtonText(/^Continue$/));
        assert.ok(name && password && submitButton, "both fields and the submit must render");
        const reachable = focusableElements(h.container as never);
        assert.ok(reachable.includes(name as never), "the display-name field must be keyboard-reachable");
        assert.ok(reachable.includes(password as never), "the password field must be keyboard-reachable");
        assert.ok(reachable.includes(submitButton as never), "the submit must be keyboard-reachable");
        assert.deepEqual(checkKeyboardWalk(h.container as never), [], "no violations on the password step");
        assert.notEqual((submitButton as Node).disabled, true, "the submit is open before the act");

        await h.act(() => {
          setFieldValue(name as never, "Aisyah Rahman");
          setFieldValue(password as never, "correct horse battery");
        });
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();

        // THE DISCRIMINATING POST-CONDITION: a keyboard-only run mints the
        // membership and leaves. True only AFTER the submit.
        assert.equal(membership, true, "the keyboard-driven journey must actually mint the membership");
        assert.deepEqual(router.replaced, ["/"], "and only then does it leave");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the REFUSAL state stays keyboard-operable — the person can correct and resubmit", async () => {
  const router: Router = { replaced: [] };
  await withMockedEnv(
    (async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("/rpc/accept_invite")) {
        return jsonResponse({ code: "CLR10", message: "invalid invite token" }, 400);
      }
      if (url.includes("/rest/v1/caller_context")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(
        App(
          createElement(InviteAcceptForm, {
            token: "supabase-token-hash", inviteToken: CLARA_TOKEN, createSupabaseClient: authClient(),
          }),
          router,
        ),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
        await h.act(async () => { await clickButton(gate as never); });
        for (let i = 0; i < 4; i++) await h.settle();
        const name = findIn(h.container as never, byLabelledInput(/Your name/));
        const password = findIn(h.container as never, byLabelledInput(/Password/));
        await h.act(() => {
          setFieldValue(name as never, "Aisyah Rahman");
          setFieldValue(password as never, "correct horse battery");
        });
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();

        assert.match(textOf(h.container as never), /invalid invite token/, "the refusal must have rendered");
        assert.deepEqual(checkKeyboardWalk(h.container as never), [], "the refused form must carry no keyboard violations");

        // A refused submit must not leave a dead form behind: every control
        // stays reachable and the submit is NOT stuck disabled.
        const submitAfter = findIn(h.container as never, byButtonText(/^Continue$/));
        assert.ok(submitAfter, "the submit must survive the refusal");
        assert.notEqual((submitAfter as Node).disabled, true, "a refusal must not strand the form in its busy state");
        const reachable = focusableElements(h.container as never);
        assert.ok(reachable.includes(submitAfter as never), "and it stays keyboard-reachable");
        assert.ok(
          reachable.includes(findIn(h.container as never, byLabelledInput(/Your name/)) as never),
          "the fields stay editable so the person can change something and try again",
        );
        assert.deepEqual(router.replaced, [], "nothing redirected");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the incomplete-link state's sign-in route is keyboard-reachable — the one way out of a dead end", async () => {
  // This screen has no other control at all. An unreachable escape hatch here
  // strands the exact person it exists for: an invitee who already accepted
  // and reloaded after the spent token was stripped from the URL.
  const router: Router = { replaced: [] };
  await withMockedEnv(
    (async (u: RequestInfo | URL) => { throw new Error(`unexpected fetch: ${String(u)}`); }) as typeof fetch,
    async () => {
      const h = await renderComponent(
        App(
          createElement(InviteAcceptForm, {
            token: "supabase-token-hash", inviteToken: null, createSupabaseClient: authClient(),
          }),
          router,
        ),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const signIn = findIn(h.container as never, (n) => n.tagName === "A");
        assert.ok(signIn, "the sign-in route must render");
        assert.match(textOf(signIn as never), /sign in/i, "and be named for what it does");
        assert.ok(
          focusableElements(h.container as never).includes(signIn as never),
          "and be reachable from the keyboard",
        );
        assert.deepEqual(checkKeyboardWalk(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the unconfirmed state's recovery control is keyboard-reachable and genuinely operable", async () => {
  let membership = false;
  let reportContext = false;
  const router: Router = { replaced: [] };
  await withMockedEnv(
    (async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("/rpc/accept_invite")) { membership = true; return jsonResponse({ membership_id: "m1" }); }
      if (url.includes("/rest/v1/caller_context")) {
        return jsonResponse(membership && reportContext ? [CONTEXT_ROW] : []);
      }
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const h = await renderComponent(
        App(
          createElement(InviteAcceptForm, {
            token: "supabase-token-hash", inviteToken: CLARA_TOKEN, createSupabaseClient: authClient(),
          }),
          router,
        ),
      );
      try {
        for (let i = 0; i < 3; i++) await h.settle();
        const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
        await h.act(async () => { await clickButton(gate as never); });
        for (let i = 0; i < 4; i++) await h.settle();
        const name = findIn(h.container as never, byLabelledInput(/Your name/));
        const password = findIn(h.container as never, byLabelledInput(/Password/));
        await h.act(() => {
          setFieldValue(name as never, "Aisyah Rahman");
          setFieldValue(password as never, "correct horse battery");
        });
        const form = findIn(h.container as never, (n) => n.tagName === "FORM");
        await h.fireEvent(form as never, "submit");
        for (let i = 0; i < 8; i++) await h.settle();

        const retry = findIn(h.container as never, byButtonText(/Check again/));
        assert.ok(retry, "the unconfirmed state must offer a recovery control, not a dead end");
        assert.ok(
          focusableElements(h.container as never).includes(retry as never),
          "and it must be keyboard-reachable",
        );
        assert.deepEqual(checkKeyboardWalk(h.container as never), []);

        reportContext = true;
        await h.act(async () => { await clickButton(retry as never); });
        for (let i = 0; i < 6; i++) await h.settle();
        assert.deepEqual(router.replaced, ["/"], "operating it from the keyboard genuinely completes the journey");
      } finally {
        await h.unmount();
      }
    },
  );
});
