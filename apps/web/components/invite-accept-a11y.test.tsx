// GATE (b) — structural a11y scan of the invite-accept surface.
//
// THIS SURFACE HAD NEVER BEEN IN EITHER SCAN before P4-1, despite being the
// original admission path into the app (self-serve signup now also exists) — so
// every one of its six states is scanned here, not just the happy one. The
// two P4-1 adds (the display-name field and the refusal banner) are exactly
// the kind of thing an unscanned surface accumulates.
//
// Mocking follows components/registers/opening-a11y.test.tsx's precedent; the
// Supabase auth client is injected at the component's own transport seam
// because the real browser client cannot be constructed under Node 20 (see
// invite-accept-form.tsx's `InviteAuthClient` header).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderComponent, textOf, clickButton, setFieldValue } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import { checkAccessibility } from "../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../lib/session-accessor";
import messages from "../messages/en.json";
import { InviteAcceptForm, type InviteAuthClient } from "./invite-accept-form";
import EntryLayout from "../app/(entry)/layout";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node };

const SUB = "11111111-1111-1111-1111-111111111111";
const CLARA_TOKEN = "c".repeat(64);

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

function estate(refusal?: { code: string; message: string }, contextRows: unknown[] = []) {
  return (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/rpc/accept_invite")) {
      return refusal ? jsonResponse(refusal, 400) : jsonResponse({ membership_id: "m1" });
    }
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(contextRows);
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
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

/** Render the real entry-layout composition. `InviteAcceptForm` owns the one
 *  `<h1>` in every state; the harness adds no heading that could mask it. */
function App(form: ReactElement) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(
      AppRouterContext.Provider as never,
      { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
      createElement(EntryLayout, null, form),
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

async function mounted(
  props: { inviteToken: string | null; auth?: () => InviteAuthClient },
): Promise<Awaited<ReturnType<typeof renderComponent>>> {
  return renderComponent(
    App(createElement(InviteAcceptForm, {
      token: "supabase-token-hash",
      inviteToken: props.inviteToken,
      createSupabaseClient: props.auth ?? authClient(),
    })),
  );
}

/** Click the gate, land on the password step, fill both fields. */
async function toPasswordStep(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
  assert.ok(gate, "the click gate must render");
  await h.act(async () => { await clickButton(gate as never); });
  for (let i = 0; i < 4; i++) await h.settle();
  const name = findIn(h.container as never, byLabelledInput(/Your name/));
  const password = findIn(h.container as never, byLabelledInput(/Password/));
  assert.ok(name && password, "both fields must render on the password step");
  await h.act(() => {
    setFieldValue(name as never, "Aisyah Rahman");
    setFieldValue(password as never, "correct horse battery");
  });
}

async function submit(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const form = findIn(h.container as never, (n) => n.tagName === "FORM");
  assert.ok(form, "the password form must render");
  await h.fireEvent(form as never, "submit");
  for (let i = 0; i < 8; i++) await h.settle();
}

test("the click-gate state has zero a11y violations", async () => {
  await withMockedEnv(estate(), async () => {
    const h = await mounted({ inviteToken: CLARA_TOKEN });
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(textOf(h.container as never), /Accept your invitation/, "the gate must have rendered");
      const headings = (h.container as unknown as { querySelectorAll(selector: string): unknown[] })
        .querySelectorAll("h1");
      assert.equal(headings.length, 1, "the composed invite document must own exactly one h1");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the password step — BOTH fields, including the display name P4-1 adds — has zero a11y violations", async () => {
  await withMockedEnv(estate(), async () => {
    const h = await mounted({ inviteToken: CLARA_TOKEN });
    try {
      await toPasswordStep(h);
      // Discriminating: the new field is genuinely present and labelled, so
      // a `label` violation would have somewhere to come from.
      assert.ok(findIn(h.container as never, byLabelledInput(/Your name/)), "the display-name field must render");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the REFUSAL state — the verbatim banner P4-1 adds — has zero a11y violations", async () => {
  await withMockedEnv(
    estate({ code: "CLR09", message: "this invite has expired" }),
    async () => {
      const h = await mounted({ inviteToken: CLARA_TOKEN });
      try {
        await toPasswordStep(h);
        await submit(h);
        assert.match(textOf(h.container as never), /this invite has expired/, "the refusal must have rendered");
        assert.deepEqual(checkAccessibility(h.container as never), []);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the unconfirmed-membership state has zero a11y violations", async () => {
  await withMockedEnv(estate(undefined, []), async () => {
    const h = await mounted({ inviteToken: CLARA_TOKEN });
    try {
      await toPasswordStep(h);
      await submit(h);
      assert.match(textOf(h.container as never), /Your account is set up/, "the unconfirmed state must have rendered");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the verification-error state has zero a11y violations", async () => {
  await withMockedEnv(estate(), async () => {
    const h = await mounted({
      inviteToken: CLARA_TOKEN,
      auth: authClient({ verifyOtp: async () => ({ data: { user: null, session: null }, error: null }) }),
    });
    try {
      const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
      await h.act(async () => { await clickButton(gate as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(textOf(h.container as never), /didn't work/, "the error state must have rendered");
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});

test("the incomplete-link state has zero a11y violations", async () => {
  await withMockedEnv(estate(), async () => {
    const h = await mounted({ inviteToken: null });
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(textOf(h.container as never), /This invite link is incomplete/);
      assert.deepEqual(checkAccessibility(h.container as never), []);
    } finally {
      await h.unmount();
    }
  });
});
