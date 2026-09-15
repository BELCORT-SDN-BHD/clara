// components/invite-accept-form.tsx — P4-1's repair, driven end to end.
//
// THE CELL THIS FILE EXISTS FOR is "a membership EXISTS afterwards". It is
// asserted on the MEMBERSHIP READ against a fake DB the door itself mutates —
// never on the redirect and never on the door returning 200, both of which
// were already true on the broken flow this train replaces.
//
// WHAT IS REAL HERE AND WHAT IS FAKED. The component, `acceptInvite`,
// `callerContext`, `callDoor`, `getRows` and the whole `wire.ts` stack are the
// REAL ones; only two transports are faked — `globalThis.fetch` (a tiny fake
// PostgREST over a fake DB) and the Supabase auth client (which cannot be
// constructed at all under Node 20: `@supabase/realtime-js` throws without a
// native `WebSocket`, and its auth timers outlive the test). Every wall on the
// journey runs for real.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { renderComponent, textOf, clickButton, setFieldValue } from "../test/hookHarness";
import { enableDomInspection } from "../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../lib/session-accessor";
import messages from "../messages/en.json";
import { INVITE_CLARA_TOKEN_PARAM } from "../lib/identity/doors";
import { InviteAcceptForm, type InviteAuthClient } from "./invite-accept-form";

enableDomInspection();

type Node = { tagName?: string; childNodes?: Node[]; parentNode?: Node; disabled?: boolean };

const SUB = "11111111-1111-1111-1111-111111111111";
const CLARA_TOKEN = "c".repeat(64);
const FIRM = "33333333-3333-3333-3333-333333333333";
// The membership row must be WELL FORMED to confirm — real uuids, a non-empty
// firm name, an in-CHECK role. The read validates all six columns (Codex
// MEDIUM-1), so a placeholder like "f1" is now correctly rejected as malformed.
const CONTEXT_ROW = {
  user_id: SUB, firm_id: FIRM, firm_name: "ROME PROPERTIES",
  role: "bookkeeper", role_rank: 1, is_operator: false,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

/** The PREVIEW the fake door answers by default: a live invitation into this firm, at the role
 *  the membership row will carry. #625 — `clara.preview_invite` (0209) is called between
 *  verification and the password fields, so EVERY cell in this file now goes through it. */
const PREVIEW_ROW = {
  firm_name: "ROME PROPERTIES",
  role: "bookkeeper",
  status: "pending",
  masked_email: "a***@example.test",
};

/** The fake estate: `accept_invite` MINTS the membership, `caller_context`
 *  REPORTS it. The read is never told about the acceptance except through this
 *  shared state — which is what makes the post-condition discriminating. */
function fakeEstate(options: {
  acceptRefusal?: { code: string; message: string };
  contextStatus?: number;
  /** #625 — what `clara.preview_invite` answers. A function so a cell can hold the read in
   *  flight (the only way to prove the door was called BEFORE the password fields existed). */
  preview?: () => Promise<Response>;
} = {}) {
  const state = {
    membership: false,
    acceptCalls: [] as Record<string, unknown>[],
    contextReads: 0,
    /** #625 — every `preview_invite` body this journey sent. WHEN it went out is proven by
     *  holding the read in flight and looking at the DOM (see `p625.web.preview_called`), not by
     *  counting from inside the transport. */
    previewCalls: [] as Record<string, unknown>[],
    /** Headers of the LAST caller_context read — so a cell can prove the read
     *  went out credentialed and profile-scoped, not as an anonymous GET. */
    contextHeaders: {} as Record<string, string>,
  };
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    if (url.includes("/rpc/preview_invite")) {
      state.previewCalls.push(JSON.parse(String(init?.body ?? "{}")));
      return options.preview ? options.preview() : jsonResponse(PREVIEW_ROW);
    }
    if (url.includes("/rpc/accept_invite")) {
      state.acceptCalls.push(JSON.parse(String(init?.body ?? "{}")));
      if (options.acceptRefusal) return jsonResponse(options.acceptRefusal, 400);
      state.membership = true;
      return jsonResponse({ user_id: SUB, firm_id: FIRM, membership_id: "m1" });
    }
    if (url.includes("/rest/v1/caller_context")) {
      state.contextReads += 1;
      state.contextHeaders = {};
      new Headers(init?.headers).forEach((v, k) => { state.contextHeaders[k.toLowerCase()] = v; });
      if (options.contextStatus) return jsonResponse({ message: "upstream unavailable" }, options.contextStatus);
      return jsonResponse(state.membership ? [CONTEXT_ROW] : []);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;
  return { state, impl };
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

/** A Supabase auth client that succeeds at every step, unless overridden. */
function authClient(over: Partial<InviteAuthClient["auth"]> = {}): () => InviteAuthClient {
  return () => ({
    auth: {
      verifyOtp: async () => ({
        data: { user: { id: SUB }, session: { access_token: "jwt", user: { id: SUB } } },
        error: null,
      }),
      getClaims: async () => ({ data: { claims: { sub: SUB } }, error: null }),
      updateUser: async () => ({ error: null }),
      ...over,
    },
  });
}

type Router = { replaced: string[]; refreshed: number };

function mount(
  form: ReactElement,
): Promise<{ h: Awaited<ReturnType<typeof renderComponent>>; router: Router }> {
  const router: Router = { replaced: [], refreshed: 0 };
  const value = {
    replace: (href: string) => { router.replaced.push(href); },
    refresh: () => { router.refreshed += 1; },
    push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {},
  };
  const tree = createElement(
    NextIntlClientProvider,
    {
      locale: "en", messages,
      children: createElement(
        AppRouterContext.Provider as never,
        { value: value as never },
        createElement("div", null, createElement("h1", null, "Invite"), form),
      ),
    },
  );
  return renderComponent(tree).then((h) => ({ h, router }));
}

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}
const byButtonText = (re: RegExp) => (n: Node) =>
  n.tagName === "BUTTON" && re.test(textOf(n as never));
const byLabelledInput = (label: RegExp) => (n: Node) =>
  n.tagName === "INPUT" && label.test(textOf((n.parentNode ?? {}) as never));

/** The nth recorded `accept_invite` body, proven present before it is read —
 *  an index into a shorter-than-expected list must fail the CELL, never
 *  silently read `undefined` and compare two absences as equal. */
function callAt(calls: Record<string, unknown>[], i: number): Record<string, unknown> {
  const call = calls[i];
  assert.ok(call, `expected an accept_invite call at index ${i}`);
  return call;
}

/** Clicks the click gate and settles — verification, then #625's preview read, both run here. */
async function walkToPassword(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
  assert.ok(gate, "the click gate must render first — nothing is consumed on mount");
  await h.act(async () => { await clickButton(gate as never); });
  for (let i = 0; i < 6; i++) await h.settle();
}

/** #625 D1 — the settled JOINED stage's own control. The journey no longer navigates on its own:
 *  it shows which firm was joined and at which role, and the person leaves when they say so. */
async function enterWorkspace(h: Awaited<ReturnType<typeof renderComponent>>): Promise<void> {
  const enter = findIn(h.container as never, byButtonText(/Enter workspace/));
  assert.ok(enter, "the joined stage must offer an explicit Enter-workspace control");
  await h.act(async () => { await clickButton(enter as never); });
  for (let i = 0; i < 4; i++) await h.settle();
}

/** Drives the shipped journey: click the gate, fill both fields, submit — and, by default, take
 *  the explicit Enter-workspace step #625 D1 puts between a settled acceptance and the redirect.
 *  Pass `{ enter: false }` to stop ON the joined stage and look at it. */
async function walkToSubmit(
  h: Awaited<ReturnType<typeof renderComponent>>,
  name = "Aisyah Rahman",
  opts: { enter?: boolean } = {},
): Promise<void> {
  await walkToPassword(h);
  await fillAndSubmit(h, name, opts);
}

/** The second half of `walkToSubmit`, for a cell that is ALREADY on the password step (e.g. one
 *  that walked there to look at the preview block first). */
async function fillAndSubmit(
  h: Awaited<ReturnType<typeof renderComponent>>,
  name = "Aisyah Rahman",
  opts: { enter?: boolean } = {},
): Promise<void> {
  const nameInput = findIn(h.container as never, byLabelledInput(/Your name/));
  const passwordInput = findIn(h.container as never, byLabelledInput(/Password/));
  assert.ok(nameInput, "the display-name field must render on the password step");
  assert.ok(passwordInput, "the password field must render");
  await h.act(() => {
    setFieldValue(nameInput as never, name);
    setFieldValue(passwordInput as never, "correct horse battery");
  });

  const form = findIn(h.container as never, (n) => n.tagName === "FORM");
  assert.ok(form, "the password form must render");
  await h.fireEvent(form as never, "submit");
  for (let i = 0; i < 8; i++) await h.settle();

  if (opts.enter === false) return;
  if (findIn(h.container as never, byButtonText(/Enter workspace/))) await enterWorkspace(h);
}

// ===========================================================================
// THE ACCEPTANCE CELL — the order's whole point.
// ===========================================================================

test("ACCEPTANCE: after a successful acceptance a MEMBERSHIP EXISTS — asserted on the membership read, and the redirect follows it", async () => {
  const { state, impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      // CONTROL, before anything: the fake estate holds no membership.
      assert.equal(state.membership, false, "control: no membership exists before the journey runs");

      await walkToSubmit(h);

      // (1) The door was actually called, with CLARA's token — not the
      //     Supabase path segment, which would refuse CLR10 in the real DB.
      assert.equal(state.acceptCalls.length, 1, "accept_invite must be called exactly once");
      assert.equal(callAt(state.acceptCalls, 0).p_token, CLARA_TOKEN, "the door must receive CLARA's invite token");
      assert.equal(callAt(state.acceptCalls, 0).p_display_name, "Aisyah Rahman", "the typed display name must reach the wire");
      assert.equal(
        Object.keys(callAt(state.acceptCalls, 0)).includes("p_email"), false,
        "the email is NEVER form input — the door reads it from the JWT claim",
      );

      // (2) THE POST-CONDITION. Not the redirect, not a 200: the MEMBERSHIP,
      //     read back through the real getRows stack from the fake DB the
      //     door itself mutated.
      assert.equal(state.membership, true, "the door must have minted the membership");
      assert.ok(state.contextReads >= 1, "the surface must RE-READ the membership after the act — no optimistic UI");

      // (3) Only then does the journey leave, and it leaves by replace().
      assert.deepEqual(router.replaced, ["/"], "the redirect fires once, to /, and only after the membership read");
      assert.equal(router.refreshed, 1);
    } finally {
      await h.unmount();
    }
  });
});

test("ORDERING: the redirect does NOT fire before the membership read returns a row", async () => {
  // The defect this train removes was a success redirect that ran while
  // nothing had been minted. Zero rows back => the surface must NOT leave.
  const { impl, state } = fakeEstate();
  await withMockedEnv(
    (async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      // The door "succeeds" but the estate never reports a membership — the
      // exact shape of the old broken flow, now caught.
      if (url.includes("/rest/v1/caller_context")) return jsonResponse([]);
      return impl(u as never, init as never);
    }) as typeof fetch,
    async () => {
      const { h, router } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient(),
        }),
      );
      try {
        await walkToSubmit(h);
        assert.equal(state.acceptCalls.length, 1, "the door was called");
        assert.deepEqual(router.replaced, [], "NO redirect on an unconfirmed membership");
        assert.match(textOf(h.container as never), /couldn't confirm your access/, "the surface says exactly what is known");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("A FAILED membership read is NOT treated as a confirmed one — and never as a silent success", async () => {
  const { impl } = fakeEstate({ contextStatus: 503 });
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToSubmit(h);
      assert.deepEqual(router.replaced, [], "a failed read takes the fail-closed branch — absence is not evidence");
      assert.match(textOf(h.container as never), /Your account is set up/);
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================
// THE POSITIVE READ IS EXACT (Codex MEDIUM-1) — at the SURFACE.
//
// The wrapper suite (lib/identity/doors.test.ts) pins all four denial reasons
// exhaustively. These cells pin the thing the USER experiences: for every
// non-exact answer the door "succeeded" but the journey does NOT leave. Only
// the exact, well-formed, verified-subject row redirects.
// ===========================================================================

const NON_CONFIRMING: ReadonlyArray<{ what: string; rows: unknown }> = [
  { what: "zero rows", rows: [] },
  { what: "TWO rows", rows: [{ ...CONTEXT_ROW }, { ...CONTEXT_ROW, firm_id: "44444444-4444-4444-4444-444444444444" }] },
  { what: "a 200 carrying [{}]", rows: [{}] },
  { what: "a row for a DIFFERENT user_id", rows: [{ ...CONTEXT_ROW, user_id: "99999999-9999-9999-9999-999999999999" }] },
  { what: "a row with firm_id missing", rows: [{ ...CONTEXT_ROW, firm_id: undefined }] },
  { what: "a row with a non-uuid user_id", rows: [{ ...CONTEXT_ROW, user_id: "u1" }] },
  { what: "a row with an empty firm_name", rows: [{ ...CONTEXT_ROW, firm_name: "" }] },
  { what: "a row with a role outside the CHECK", rows: [{ ...CONTEXT_ROW, role: "superuser" }] },
  { what: "a row with is_operator as the STRING true", rows: [{ ...CONTEXT_ROW, is_operator: "true" }] },
];

for (const scenario of NON_CONFIRMING) {
  test(`NO REDIRECT on ${scenario.what}: the door succeeded, but the membership is not confirmed`, async () => {
    let doorCalls = 0;
    await withMockedEnv(
      (async (u: RequestInfo | URL) => {
        const url = String(u);
        if (url.includes("/rpc/accept_invite")) {
          doorCalls += 1;
          return jsonResponse({ user_id: SUB, firm_id: FIRM, membership_id: "m1" });
        }
        if (url.includes("/rest/v1/caller_context")) return jsonResponse(scenario.rows);
        throw new Error(`unexpected fetch: ${url}`);
      }) as typeof fetch,
      async () => {
        const { h, router } = await mount(
          createElement(InviteAcceptForm, {
            token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
            createSupabaseClient: authClient(),
          }),
        );
        try {
          await walkToSubmit(h);
          assert.equal(doorCalls, 1, "control: the door really was called and really did succeed");
          assert.deepEqual(router.replaced, [], `${scenario.what} must NOT redirect`);
          assert.match(textOf(h.container as never), /couldn't confirm your access/, "the person stays, told what is known");
        } finally {
          await h.unmount();
        }
      },
    );
  });
}

test("POSITIVE CONTROL: the exact well-formed verified-subject row is the ONLY thing that redirects", async () => {
  // Without this the nine cells above would all pass against a component that
  // never redirects at all.
  const { impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToSubmit(h);
      assert.deepEqual(router.replaced, ["/"], "the exact row DOES redirect");
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================
// EVERY REFUSAL, VERBATIM — and none of them redirects.
// ===========================================================================

const REFUSALS = [
  { code: "CLR04", message: "the signed-in email does not match this invite" },
  { code: "CLR04", message: "no authenticated actor" },
  { code: "CLR04", message: "invite exceeds the issuer's rank -- re-issue by an owner" },
  { code: "CLR09", message: "this invite is no longer open (status: revoked)" },
  { code: "CLR09", message: "this invite has expired" },
  { code: "CLR10", message: "invalid invite token" },
  { code: "CLR10", message: "op_key is required" },
] as const;

for (const refusal of REFUSALS) {
  test(`REFUSAL ${refusal.code} "${refusal.message}": rendered verbatim with its code, and NOTHING redirects`, async () => {
    const { state, impl } = fakeEstate({ acceptRefusal: { code: refusal.code, message: refusal.message } });
    await withMockedEnv(impl, async () => {
      const { h, router } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient(),
        }),
      );
      try {
        await walkToSubmit(h);
        const rendered = textOf(h.container as never);
        assert.ok(
          rendered.includes(refusal.message),
          `the DB's own sentence must render verbatim; rendered: ${rendered.slice(0, 400)}`,
        );
        assert.ok(rendered.includes(refusal.code), "the CLR code must render as its own chip");
        assert.deepEqual(router.replaced, [], "a refusal never redirects");
        assert.equal(state.membership, false, "and nothing was minted");
        // The person stays on the form with the fields still there — they can
        // change something and submit again as a NEW call.
        assert.ok(findIn(h.container as never, byLabelledInput(/Your name/)), "the form stays on screen");
      } finally {
        await h.unmount();
      }
    });
  });
}

test("the door is NOT retried by this component — one submit, one call", async () => {
  const { state, impl } = fakeEstate({ acceptRefusal: { code: "CLR09", message: "this invite has expired" } });
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToSubmit(h);
      assert.equal(state.acceptCalls.length, 1, "a refusal is the DB's considered answer, never retried here");
    } finally {
      await h.unmount();
    }
  });
});

test("a re-submit with the SAME display name replays the SAME op_key; changing the name mints a fresh one", async () => {
  const { state, impl } = fakeEstate({ acceptRefusal: { code: "CLR09", message: "this invite has expired" } });
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToSubmit(h, "Aisyah Rahman");
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();

      assert.equal(state.acceptCalls.length, 2);
      assert.equal(
        callAt(state.acceptCalls, 0).p_op_key, callAt(state.acceptCalls, 1).p_op_key,
        "same args => same op_key, so a retry replays the dedupe branch instead of a CLR09 dead end",
      );

      const nameInput = findIn(h.container as never, byLabelledInput(/Your name/));
      await h.act(() => { setFieldValue(nameInput as never, "Aisyah binti Rahman"); });
      await h.fireEvent(form as never, "submit");
      for (let i = 0; i < 6; i++) await h.settle();

      assert.equal(state.acceptCalls.length, 3);
      assert.notEqual(
        callAt(state.acceptCalls, 2).p_op_key, callAt(state.acceptCalls, 0).p_op_key,
        "the door's request hash binds the display name, so changed args need a fresh key",
      );
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================
// THE P2 WALLS — still exactly as built, asserted from this train's side.
// ===========================================================================

test("P2 WALL: the OTP purpose is the hard-coded literal \"invite\"", async () => {
  const { impl } = fakeEstate();
  const seen: unknown[] = [];
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient({
          verifyOtp: async (params) => {
            seen.push(params);
            return { data: { user: { id: SUB }, session: { access_token: "jwt", user: { id: SUB } } }, error: null };
          },
        }),
      }),
    );
    try {
      const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
      await h.act(async () => { await clickButton(gate as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      assert.deepEqual(seen, [{ token_hash: "supabase-token-hash", type: "invite" }]);
    } finally {
      await h.unmount();
    }
  });
});

test("P2 WALL: a subject mismatch refuses BEFORE the password is set — and never reaches the door", async () => {
  const { state, impl } = fakeEstate();
  let passwordWrites = 0;
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient({
          // The ambient browser session is somebody ELSE — an administrator.
          getClaims: async () => ({ data: { claims: { sub: "99999999-9999-9999-9999-999999999999" } }, error: null }),
          updateUser: async () => { passwordWrites += 1; return { error: null }; },
        }),
      }),
    );
    try {
      await walkToSubmit(h);
      assert.equal(passwordWrites, 0, "the ADMINISTRATOR's password must never be written");
      assert.equal(state.acceptCalls.length, 0, "and the door is never reached");
      assert.deepEqual(router.replaced, []);
      assert.match(textOf(h.container as never), /signed in as a different account/);
    } finally {
      await h.unmount();
    }
  });
});

test("P2 WALL: an incomplete verification renders the typed error and never advances", async () => {
  const { state, impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        // The email_change shape: no error, no user, no session.
        createSupabaseClient: authClient({
          verifyOtp: async () => ({ data: { user: null, session: null }, error: null }),
        }),
      }),
    );
    try {
      const gate = findIn(h.container as never, byButtonText(/Accept invitation/));
      await h.act(async () => { await clickButton(gate as never); });
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(textOf(h.container as never), /could not be confirmed/);
      assert.equal(state.acceptCalls.length, 0);
      assert.deepEqual(router.replaced, []);
    } finally {
      await h.unmount();
    }
  });
});

test("P2 WALL: nothing is consumed on mount — the click gate is the first act", async () => {
  const { impl } = fakeEstate();
  let verifyCalls = 0;
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient({
          verifyOtp: async () => {
            verifyCalls += 1;
            return { data: { user: { id: SUB }, session: { access_token: "jwt", user: { id: SUB } } }, error: null };
          },
        }),
      }),
    );
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.equal(verifyCalls, 0, "a link preview or email scanner must not burn the invite");
      assert.ok(findIn(h.container as never, byButtonText(/Accept invitation/)));
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================
// THE MISSING-CLARA-TOKEN BRANCH — fail closed, consume nothing.
// ===========================================================================

test("no Clara invite token: refuses honestly, burns no OTP, calls no door, redirects nowhere", async () => {
  const { state, impl } = fakeEstate();
  let verifyCalls = 0;
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: null,
        createSupabaseClient: authClient({
          verifyOtp: async () => { verifyCalls += 1; return { data: { user: null, session: null }, error: null }; },
        }),
      }),
    );
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      const rendered = textOf(h.container as never);
      assert.match(rendered, /This invite link is incomplete/);

      // TWO CAUSES REACH THIS SCREEN and the copy must be true under BOTH.
      // It used to say "this link has not been used up" — false for the
      // invitee who ALREADY ACCEPTED and reloaded after the token was
      // stripped: they are a member, and a fresh invite would refuse them.
      assert.ok(
        !/not been used up/.test(rendered),
        "the surface must NOT assert the link is unused — it cannot know that",
      );
      assert.match(rendered, /already finished setting up your account/, "the accepted-invitee cause is addressed");
      assert.match(rendered, /ask whoever invited you/i, "and so is the genuinely-malformed-link cause");

      // The one real next step inside the product, as a REAL link.
      const signIn = findIn(h.container as never, (n) => n.tagName === "A");
      assert.ok(signIn, "the incomplete-link surface must offer the sign-in route");
      assert.match(textOf(signIn as never), /sign in/i, "and name it");
      assert.equal(
        findIn(h.container as never, byButtonText(/Accept invitation/)), null,
        "the click gate must not be offered on a journey that cannot complete",
      );
      assert.equal(verifyCalls, 0, "the single-use Supabase OTP is not burned on a dead end");
      assert.equal(state.acceptCalls.length, 0);
      assert.deepEqual(router.replaced, []);
    } finally {
      await h.unmount();
    }
  });
});

test("a blank Clara invite token takes the same fail-closed branch as a missing one", async () => {
  const { impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: "   ",
        createSupabaseClient: authClient(),
      }),
    );
    try {
      for (let i = 0; i < 3; i++) await h.settle();
      assert.match(textOf(h.container as never), /This invite link is incomplete/);
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================
// RECOVERY — re-reads, never re-calls the door.
// ===========================================================================

test("the unconfirmed state's recovery RE-READS and never re-calls the door; a positive read then leaves", async () => {
  const { state, impl } = fakeEstate();
  let suppressContext = true;
  await withMockedEnv(
    (async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context") && suppressContext) return jsonResponse([]);
      return impl(u as never, init as never);
    }) as typeof fetch,
    async () => {
      const { h, router } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient(),
        }),
      );
      try {
        await walkToSubmit(h);
        assert.deepEqual(router.replaced, []);

        // The estate catches up; the person presses "Check again".
        suppressContext = false;
        const retry = findIn(h.container as never, byButtonText(/Check again/));
        assert.ok(retry, "the unconfirmed state must offer a real recovery control");
        await h.act(async () => { await clickButton(retry as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.equal(state.acceptCalls.length, 1, "the recovery must NOT re-call a door that already succeeded");
        // #625 D1 — a positive read now SETTLES on the joined stage rather than navigating on its
        // own, so the recovery's success is visible here too: the firm and role, then the
        // person's own explicit step out.
        assert.match(textOf(h.container as never), /ROME PROPERTIES/, "the recovered read names the firm");
        assert.deepEqual(router.replaced, [], "…and still nothing navigates by itself");
        await enterWorkspace(h);
        assert.deepEqual(router.replaced, ["/"], "a positive read then leaves, when the person says so");
      } finally {
        await h.unmount();
      }
    },
  );
});

// ===========================================================================
// THE CONSUMED TOKEN LEAVES THE ADDRESS BAR (ruling 2026-08-30, requirement 3)
// ===========================================================================

const INVITE_URL = `http://localhost/invite/supabase-token-hash?${INVITE_CLARA_TOKEN_PARAM}=${CLARA_TOKEN}&utm=mail`;

/** Installs a location + history pair the component can actually drive, and
 *  records every `replaceState`. Restores both afterwards. */
function withAddressBar(
  href: string,
  run: (bar: { href: () => string; replaceStateCalls: string[] }) => Promise<void>,
): Promise<void> {
  const win = globalThis.window as unknown as Record<string, unknown>;
  const originalLocation = win.location;
  const originalHistory = win.history;
  let current = href;
  const replaceStateCalls: string[] = [];
  win.location = { get href() { return current; } };
  win.history = {
    replaceState: (_state: unknown, _title: string, url: string) => {
      replaceStateCalls.push(url);
      current = new URL(url, current).href;
    },
  };
  return run({ href: () => current, replaceStateCalls }).finally(() => {
    win.location = originalLocation;
    win.history = originalHistory;
  });
}

test("CONSUMED: a successful acceptance strips the ct token from the address bar, keeping the rest of the URL", async () => {
  // Driven on the UNCONFIRMED branch on purpose — it is the one success path
  // that KEEPS the person on this page, so the scrubbed URL is observable
  // rather than immediately replaced by the redirect to "/".
  const { impl } = fakeEstate();
  await withMockedEnv(
    (async (u: RequestInfo | URL, init?: RequestInit) => {
      const url = String(u);
      if (url.includes("/rest/v1/caller_context")) return jsonResponse([]);
      return impl(u as never, init as never);
    }) as typeof fetch,
    async () => {
      await withAddressBar(INVITE_URL, async (bar) => {
        const { h } = await mount(
          createElement(InviteAcceptForm, {
            token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
            createSupabaseClient: authClient(),
          }),
        );
        try {
          // CONTROL: the token is in the address bar before the act.
          assert.ok(bar.href().includes(CLARA_TOKEN), "control: the URL carries the token to begin with");

          await walkToSubmit(h);

          assert.equal(bar.replaceStateCalls.length, 1, "history.replaceState fires exactly once");
          const after = new URL(bar.href());
          assert.equal(
            after.searchParams.get(INVITE_CLARA_TOKEN_PARAM), null,
            "the consumed token must be GONE from the address bar",
          );
          assert.ok(!bar.href().includes(CLARA_TOKEN), "and its value must not survive anywhere in the URL");
          // Surgical, not destructive: the route and any unrelated params stay.
          assert.equal(after.pathname, "/invite/supabase-token-hash", "the path (Supabase's own token) is untouched");
          assert.equal(after.searchParams.get("utm"), "mail", "unrelated params are not collateral damage");
        } finally {
          await h.unmount();
        }
      });
    },
  );
});

test("NOT consumed: a REFUSAL leaves the token in the address bar — it is still a live credential", async () => {
  // The invite is still `pending` after a refusal, so the token is still
  // needed. Scrubbing it here would destroy the person's only way back in.
  const { impl } = fakeEstate({ acceptRefusal: { code: "CLR10", message: "invalid invite token" } });
  await withMockedEnv(impl, async () => {
    await withAddressBar(INVITE_URL, async (bar) => {
      const { h } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient(),
        }),
      );
      try {
        await walkToSubmit(h);
        assert.match(textOf(h.container as never), /invalid invite token/, "the refusal rendered");
        assert.deepEqual(bar.replaceStateCalls, [], "nothing was stripped");
        assert.ok(bar.href().includes(CLARA_TOKEN), "the still-live token survives for a retry");
      } finally {
        await h.unmount();
      }
    });
  });
});

test("the ct token NEVER reaches rendered copy — on any failure branch", async () => {
  // An error message that echoes the bearer token would put it on screen, in a
  // screenshot, and in any support thread the person pastes it into.
  for (const refusal of [
    { code: "CLR10", message: "invalid invite token" },
    { code: "CLR09", message: "this invite has expired" },
  ]) {
    const { impl } = fakeEstate({ acceptRefusal: refusal });
    await withMockedEnv(impl, async () => {
      const { h } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient(),
        }),
      );
      try {
        await walkToSubmit(h);
        const rendered = textOf(h.container as never);
        assert.ok(rendered.includes(refusal.message), "control: the refusal really did render");
        assert.ok(!rendered.includes(CLARA_TOKEN), `${refusal.code}: the token must not appear in rendered copy`);
      } finally {
        await h.unmount();
      }
    });
  }
});

test("the ct token never reaches rendered copy on the NON-REFUSAL branch either (transport failure)", async () => {
  // Its own cell because it renders through a DIFFERENT branch: a transport
  // failure is a `DoorError`, not a `DoorRefusal`, so it takes the `else` arm
  // that echoes a raw `Error.message`. A mutant that interpolated the token
  // into that arm survived a first version of this file which only ever drove
  // governed refusals — the branch the assertion aimed at was never rendered.
  // Coverage of one arm is not coverage of the judgement.
  await withMockedEnv(
    (async (u: RequestInfo | URL) => {
      const url = String(u);
      if (url.includes("/rpc/accept_invite")) throw new TypeError("fetch failed: network unreachable");
      if (url.includes("/rest/v1/caller_context")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    }) as typeof fetch,
    async () => {
      const { h, router } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient(),
        }),
      );
      try {
        await walkToSubmit(h);
        const rendered = textOf(h.container as never);
        assert.match(rendered, /network unreachable/, "control: the transport failure really did render");
        assert.ok(!rendered.includes(CLARA_TOKEN), "the token must not appear in a transport error message");
        assert.deepEqual(router.replaced, [], "and a transport failure never redirects");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("the membership read goes out CREDENTIALED and profile-scoped — never an anonymous GET", async () => {
  // "Through the real door under the real credential": the post-condition read
  // rides the real getRows/wire stack with the session's bearer token and the
  // clara profile header. A read that dropped the credential would be answered
  // by PostgREST as an anonymous caller, and `caller_context`'s own
  // `jwt_sub()` predicate would then match nothing — an empty result that
  // looks exactly like "no membership".
  const { state, impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToSubmit(h);
      assert.ok(state.contextReads >= 1, "the read happened");
      assert.equal(state.contextHeaders["authorization"], "Bearer tok", "the read carries the session bearer token");
      assert.equal(state.contextHeaders["accept-profile"], "clara", "and is scoped to the clara schema");
      assert.deepEqual(router.replaced, ["/"], "and the journey completed on it");
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================
// #625 — THE PREVIEW STEP (0209), THE TWO FACE SETS, AND THE JOINED STAGE.
//
// AC2's second half: "the accepted role and scope are visible BEFORE entering the workspace".
// Two independent things make that true, and each has its own cells below:
//   · `clara.preview_invite` is read AFTER verifyOtp has a session and BEFORE the password
//     fields render, so the invitee knows which firm and which role they are joining before they
//     commit anything; and
//   · a settled JOINED stage replaces the bare `router.replace("/")`, so the membership that was
//     just minted is stated rather than skipped past.
// ===========================================================================

/** A deferred response, so a cell can hold the preview read in flight and look at the DOM while
 *  it is still out. Proving WHEN a call happened needs the call to still be happening. */
function deferredResponse(): { promise: () => Promise<Response>; resolve: (body: unknown, status?: number) => void } {
  let release: (r: Response) => void = () => {};
  const p = new Promise<Response>((res) => { release = res; });
  return { promise: () => p, resolve: (body, status = 200) => release(jsonResponse(body, status)) };
}

test("p625.web.preview_called: the door is called BEFORE the password fields exist, and its answer renders ABOVE them", async () => {
  const gate = deferredResponse();
  const { state, impl } = fakeEstate({ preview: gate.promise });
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToPassword(h);

      // (1) THE ORDERING CLAIM, proven while the read is still out: the door has been called and
      //     there is no password field on the page yet.
      assert.equal(state.previewCalls.length, 1, "the preview door must be called exactly once");
      assert.equal(callAt(state.previewCalls, 0).p_token, CLARA_TOKEN, "…with CLARA's own invite token");
      assert.equal(
        findIn(h.container as never, byLabelledInput(/Password/)), null,
        "no password field may exist while the preview read is still in flight",
      );
      assert.equal(state.acceptCalls.length, 0, "and nothing has been accepted");

      // (2) The answer lands, and it lands ABOVE the fields: the form itself carries no firm name.
      gate.resolve(PREVIEW_ROW);
      for (let i = 0; i < 6; i++) await h.settle();
      const text = textOf(h.container as never);
      assert.match(text, /ROME PROPERTIES/, "the firm the invitation is into, by name");
      assert.match(text, /Bookkeeper/, "…and the role it grants");
      assert.match(text, /a\*\*\*@example\.test/, "…and the MASKED address, never the address");
      const passwordInput = findIn(h.container as never, byLabelledInput(/Password/));
      assert.ok(passwordInput, "the password step renders once the preview has settled");
      const form = findIn(h.container as never, (n) => n.tagName === "FORM");
      assert.ok(form);
      assert.doesNotMatch(
        textOf(form as never), /ROME PROPERTIES/,
        "the preview block sits ABOVE the form, not inside it",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.preview_blocks: a revoked / expired / already-accepted preview renders THAT face and NO password form", async () => {
  for (const [status, face] of [
    ["revoked", /was revoked/],
    ["expired", /invitation has expired/],
    ["accepted", /already accepted/],
  ] as const) {
    let updateUserCalls = 0;
    const { state, impl } = fakeEstate({
      preview: async () => jsonResponse({ ...PREVIEW_ROW, status }),
    });
    await withMockedEnv(impl, async () => {
      const { h, router } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient({
            updateUser: async () => { updateUserCalls += 1; return { error: null }; },
          }),
        }),
      );
      try {
        await walkToPassword(h);
        const text = textOf(h.container as never);
        assert.match(text, face, `the ${status} invitation must get its OWN face`);
        assert.match(text, /ROME PROPERTIES/, "…and still name the firm it was for");
        assert.equal(
          findIn(h.container as never, byLabelledInput(/Password/)), null,
          `a ${status} invitation must offer NO password form — there is nothing to accept`,
        );
        assert.equal(updateUserCalls, 0, "…and updateUser is unreachable from this face");
        assert.equal(state.acceptCalls.length, 0, "…and the acceptance door is never called");
        assert.deepEqual(router.replaced, [], "…and nothing navigates");
      } finally {
        await h.unmount();
      }
    });
  }
});

test("p625.web.preview_blocks: a REFUSED preview renders the single no-oracle face and no password form", async () => {
  const { state, impl } = fakeEstate({
    preview: async () =>
      jsonResponse(
        {
          code: "CLR10",
          message: "this invite link is not valid for the signed-in address",
          details: '{"reason":"invite_not_previewable"}',
        },
        400,
      ),
  });
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToPassword(h);
      const text = textOf(h.container as never);
      assert.match(text, /not valid for the address you are signed in as/, "ONE face for the door's ONE refusal");
      // THE NO-ORACLE READING, asserted as ABSENCE: the copy must name neither possibility,
      // because the database deliberately cannot tell the caller which one it was.
      assert.doesNotMatch(text, /does not exist/i, "the face must not say the token is unknown");
      assert.doesNotMatch(text, /wrong email/i, "…nor that the token is real but the address is wrong");
      assert.equal(findIn(h.container as never, byLabelledInput(/Password/)), null, "a refused preview blocks");
      assert.equal(state.acceptCalls.length, 0);
      assert.deepEqual(router.replaced, []);
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.preview_blocks: an INDEFINITE preview DEGRADES — the password form still renders, with the block absent and one honest line", async () => {
  const { state, impl } = fakeEstate({
    preview: async () => { throw new TypeError("network down"); },
  });
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToPassword(h);
      const text = textOf(h.container as never);
      assert.ok(
        findIn(h.container as never, byLabelledInput(/Password/)),
        "a read that never came back is NOT a verdict — the door is still the authority, so the journey continues",
      );
      assert.doesNotMatch(text, /ROME PROPERTIES/, "…but nothing is claimed about which firm this is");
      assert.match(text, /couldn't show which firm/, "…and the surface says so instead of leaving a silent gap");
      // …and the journey really does complete over it.
      await fillAndSubmit(h);
      assert.equal(state.acceptCalls.length, 1, "the door is what decides, and it was reached");
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.joined: the firm name and the accepted role are in the document BEFORE any navigation fires", async () => {
  const { state, impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h, router } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient(),
      }),
    );
    try {
      await walkToSubmit(h, "Aisyah Rahman", { enter: false });

      // THE ASSERTION IS ORDERING, not presence: the spy must not have been called YET.
      assert.deepEqual(router.replaced, [], "the journey does not navigate on its own");
      assert.equal(router.refreshed, 0);
      assert.equal(state.membership, true, "…even though the membership is minted and read back");
      const text = textOf(h.container as never);
      assert.match(text, /ROME PROPERTIES/, "the firm that was joined, from the caller_context row already read");
      assert.match(text, /Bookkeeper/, "…and the role it granted");

      // …and the explicit control is what leaves.
      await enterWorkspace(h);
      assert.deepEqual(router.replaced, ["/"], "the explicit control navigates, once, to /");
      assert.equal(router.refreshed, 1);
    } finally {
      await h.unmount();
    }
  });
});

test("p625.web.faces: all FIVE typed verification reasons render a distinguishable face — four next actions, five diagnostic tokens", async () => {
  const OTHER = "22222222-2222-2222-2222-222222222222";
  const cases: { reason: string; verifyOtp: () => Promise<unknown>; face: RegExp }[] = [
    {
      reason: "rejected",
      verifyOtp: async () => ({ data: null, error: { message: "Email link is invalid or has expired" } }),
      face: /indistinguishable/,
    },
    {
      reason: "no-session",
      verifyOtp: async () => ({ data: { user: null, session: null }, error: null }),
      face: /verified nobody/,
    },
    {
      reason: "no-user",
      verifyOtp: async () => ({ data: { user: null, session: { access_token: "jwt", user: { id: SUB } } }, error: null }),
      face: /half confirmed/,
    },
    {
      reason: "no-access-token",
      verifyOtp: async () => ({ data: { user: { id: SUB }, session: { access_token: null, user: { id: SUB } } }, error: null }),
      face: /half confirmed/,
    },
    {
      reason: "subject-mismatch",
      verifyOtp: async () => ({ data: { user: { id: SUB }, session: { access_token: "jwt", user: { id: OTHER } } }, error: null }),
      face: /different sign-in/,
    },
  ];

  const seen: string[] = [];
  for (const c of cases) {
    const { state, impl } = fakeEstate();
    await withMockedEnv(impl, async () => {
      const { h, router } = await mount(
        createElement(InviteAcceptForm, {
          token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
          createSupabaseClient: authClient({ verifyOtp: c.verifyOtp as never }),
        }),
      );
      try {
        await walkToPassword(h);
        const text = textOf(h.container as never);
        assert.match(text, c.face, `${c.reason}: its own next action`);
        // THE COLLAPSED SENTENCE MUST BE GONE. `Invite.errorDescription` answered all five.
        assert.doesNotMatch(
          text, /It may have expired or already been used\./,
          `${c.reason}: the one-size-fits-all description must no longer be the answer`,
        );
        // Each face still exposes its OWN reason, so two people who share a next action
        // (no-user and no-access-token share P3) can still be told apart by a cell.
        assert.match(text, new RegExp(c.reason), `${c.reason}: the typed reason is rendered as a diagnostic token`);
        assert.equal(state.previewCalls.length, 0, `${c.reason}: a failed verification never reaches the preview door`);
        assert.equal(state.acceptCalls.length, 0, `${c.reason}: …and never reaches the acceptance door`);
        assert.deepEqual(router.replaced, [], `${c.reason}: …and never navigates`);
        seen.push(text.replace(/\s+/g, " "));
      } finally {
        await h.unmount();
      }
    });
  }

  // FOUR next actions from FIVE reasons: `no-user` and `no-access-token` share P3 by design —
  // the invitee's next step is identical — so the distinct-face count is four, not five.
  const withoutTokens = seen.map((t) =>
    t.replace(/no-user|no-access-token|subject-mismatch|no-session|rejected/g, ""),
  );
  assert.equal(new Set(withoutTokens).size, 4, "five reasons, four distinct next actions");
});

test("p625.web.faces: the PROVIDER's own sentence still rides P1 verbatim — it is the only place a vendor string is echoed", async () => {
  const { impl } = fakeEstate();
  await withMockedEnv(impl, async () => {
    const { h } = await mount(
      createElement(InviteAcceptForm, {
        token: "supabase-token-hash", inviteToken: CLARA_TOKEN,
        createSupabaseClient: authClient({
          verifyOtp: (async () => ({ data: null, error: { message: "Email link is invalid or has expired" } })) as never,
        }),
      }),
    );
    try {
      await walkToPassword(h);
      assert.match(
        textOf(h.container as never), /Email link is invalid or has expired/,
        "the provider's message is shown as the provider's, not re-worded into a Clara claim",
      );
    } finally {
      await h.unmount();
    }
  });
});
