// H-50 — THE CLIENT-SCOPE INVALIDATION SEAM, from the SUBSCRIBER's side.
//
// The emitter's half is proved in `components/clara/onboarding-checklist.test.tsx` (a
// successful commit announces exactly once; a refused one announces nothing). This file
// proves the other half against the two surfaces that were stale: the client workspace Home
// tab, and the /clients register. Both read through `useAsyncRead`, whose mount effect has
// deliberately empty deps, so neither could ever see the status change made in the Clara rail
// — a different React subtree with no shared provider by design.
//
// THE ASSERTION IS A SECOND READ THAT RETURNS SOMETHING NEW, not merely a second read. A cell
// that only counted requests would stay green if the component re-read and then threw the
// answer away; this one flips the fixture between the two reads and asserts the FACE changed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { clientRecordChanged, CLIENT_RECORD_CHANGED_EVENT } from "../../lib/command/bus";
import { ClientWorkspaceOverview } from "./client-workspace-overview";
import { ClientRegisterList } from "./client-register-list";

enableDomInspection();

// See `onboarding-checklist.test.tsx`'s own note: the harness's `window` stub has NO-OP event
// methods, so without this swap a "the subscriber reacted" cell could never be true and a
// "nothing happened" cell could never be false.
const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

const CLIENT_ID = "c1c1c1c1-1111-4111-8111-111111111111";
const OTHER_CLIENT_ID = "c2c2c2c2-2222-4222-8222-222222222222";

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

/** The register mounts the Add-client control, which uses `useRouter`; the workspace Home tab's
 *  escalation card uses `usePathname`. Both contexts are supplied so neither surface is being
 *  tested through a stub of its own navigation. */
function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      AppRouterContext.Provider as never,
      { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
      createElement(PathnameContext.Provider as never, { value: `/clients/${CLIENT_ID}` as never }, children),
    ),
  });
}

const EMPTY_QUEUE = {
  // TRUED with the client Home rebuild (裁-190): three of the eight keys were not the
  // contract's (`drafts`/`uncoded_filings` for `open_drafts`/`open_tasks`, and `open_tasks`
  // absent). Nothing read them until the board rendered the eight count chips.
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: null, compliance: null, lint: null, rows: [], next_cursor: null,
};

/**
 * The reads the client Home board makes BESIDES the client record and the review queue, each
 * answered with its honest EMPTY.
 *
 * ADDED WITH THE BOARD REBUILD (裁-190), and it is not padding. This file is about the
 * invalidation seam, and every one of these sections renders its own failed-read banner when a
 * read is unanswered — which is correct behaviour, but it left section B (onboarding progress)
 * permanently on screen for an ACTIVE client, because that section stays mounted while its plan
 * read is loading OR errored and only withdraws once the read settles to "no plan". So the
 * fixture has to answer them for the cells below to be measuring the status, and not the shape
 * of an error state.
 */
function emptyBoardRead(u: string): Response | null {
  const RELATIONS = [
    "/rest/v1/client_fact_keys", "/rest/v1/onboarding_plans", "/rest/v1/onboarding_plan_items",
    "/rest/v1/opening_seed_registry", "/rest/v1/attribution_candidates", "/rest/v1/coding_tasks_visible",
    "/rest/v1/lint_findings", "/rest/v1/close_prep_holds",
  ];
  const RPCS = [
    "/rpc/list_uncoded_filings", "/rpc/list_bank_accounts", "/rpc/list_bank_account_proposals",
    "/rpc/list_bank_statements", "/rpc/list_fiscal_years", "/rpc/list_agent_act_receipts",
  ];
  return [...RELATIONS, ...RPCS].some((p) => u.includes(p)) ? jsonResponse([]) : null;
}

/** The `<h1>`'s own text — the client's name AND its status badge, which is where the status
 *  actually renders. Asserting on the whole page's text would be reading a PROJECTION of the
 *  status ("does the word appear anywhere"), and the board now has a legitimate second use of
 *  the word: the `<h2>` of section B, the onboarding-progress section. */
function headingText(h: { find: (p: (n: unknown) => boolean) => unknown }): string {
  const node = h.find((n) => (n as { tagName?: string }).tagName === "H1");
  assert.ok(node, "the board must render exactly one h1 — the client's own name");
  const read = (n: unknown): string => {
    const s = n as { nodeType?: number; nodeValue?: string; childNodes?: unknown[]; textContent?: string };
    if (s.nodeType === 3) return String(s.nodeValue ?? "");
    const kids = s.childNodes ?? [];
    if (kids.length > 0) return kids.map(read).join("");
    return typeof s.textContent === "string" ? s.textContent : "";
  };
  return read(node);
}

/** The escalation card's own subtree — it is the only element carrying the Clara-muted ground.
 *  Scoped because the board around it now renders many legitimate links ("Open the bank tab",
 *  "Open the close tab", the fact chips), so "is there an anchor on this page" stopped being a
 *  statement about the card. */
function escalationCard(h: { find: (p: (n: unknown) => boolean) => unknown }): unknown {
  return h.find((n) => String((n as { className?: string }).className ?? "").includes("bg-clara-muted"));
}

function findWithin(root: unknown, predicate: (n: unknown) => boolean): unknown {
  if (predicate(root)) return root;
  for (const child of ((root as { childNodes?: unknown[] }).childNodes ?? [])) {
    const found = findWithin(child, predicate);
    if (found) return found;
  }
  return null;
}

/** A live fixture whose client status the test can flip between reads. `clientReads` counts
 *  the reads that actually happened, so "it re-read" is measured, never assumed. */
function mockEstate(state: { status: string }) {
  const clientReads: string[] = [];
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) {
      clientReads.push(u);
      return jsonResponse([{ id: CLIENT_ID, name: "ROME PROPERTIES", status: state.status, created_at: "2026-01-01T00:00:00.000Z" }]);
    }
    if (u.includes("/rest/v1/client_facts")) return jsonResponse([]);
    // The register mounts the Add-client control, which asks what this caller may do. An
    // EMPTY membership is the fail-closed answer, so no control renders here — this file is
    // about the invalidation seam, and `add-client-control.test.tsx` owns that gate.
    if (u.includes("/rest/v1/caller_context")) return jsonResponse([]);
    if (u.includes("/rpc/list_review_queue")) return jsonResponse(EMPTY_QUEUE);
    const board = emptyBoardRead(u);
    if (board) return board;
    // `ContinueOnboardingCard`'s read-only thread resolution. No session is created here and
    // none may be: creating one would race the rail's own resolver.
    if (u.includes("/api/runtime/chat/sessions")) return jsonResponse({ sessions: [] });
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, clientReads };
}

test("H-50 — the client Home tab RE-READS its client on CLIENT_RECORD_CHANGED for that id, and the status it shows changes", async () => {
  const state = { status: "onboarding" };
  const { impl, clientReads } = mockEstate(state);
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(ClientWorkspaceOverview, { clientId: CLIENT_ID })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      // SCOPED TO THE h1 (裁-190). The status badge lives inside the client's own heading, and
      // that is the thing this cell is about; the board also uses the word "Onboarding" as the
      // h2 of its progress section, so a whole-page match would be reading a projection.
      assert.match(headingText(h), /Onboarding/, `the mount read; got: ${headingText(h)}`);
      const readsAtMount = clientReads.length;
      assert.ok(readsAtMount > 0, "positive control: the mount read actually happened");

      // The database moved, exactly as `commit_client_onboarding` moves it (0017:2825).
      state.status = "active";
      await h.act(() => { clientRecordChanged({ clientId: CLIENT_ID }); });
      for (let i = 0; i < 6; i++) await h.settle();

      assert.ok(clientReads.length > readsAtMount, "the announcement provoked a real second read");
      assert.match(headingText(h), /Active/, `the face now shows the DB's own new status; got: ${headingText(h)}`);
      assert.doesNotMatch(headingText(h), /Onboarding/, "and the stale one is gone");
      // The board's own onboarding SECTION follows the same re-read: an activated client with
      // no plan has no onboarding story, so section B withdraws entirely rather than lingering.
      assert.doesNotMatch(h.text(), /required answers recorded/, "the progress section is gone too");
    } finally {
      await h.unmount();
    }
  });
});

test("H-50 — an announcement for a DIFFERENT client is ignored (the subscriber is scoped, not a broadcast listener)", async () => {
  const state = { status: "onboarding" };
  const { impl, clientReads } = mockEstate(state);
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(ClientWorkspaceOverview, { clientId: CLIENT_ID })));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      const readsAtMount = clientReads.length;
      state.status = "active";
      await h.act(() => { clientRecordChanged({ clientId: OTHER_CLIENT_ID }); });
      for (let i = 0; i < 6; i++) await h.settle();
      assert.equal(clientReads.length, readsAtMount, "another client's change is not this page's news");
      assert.match(h.text(), /Onboarding/, "and the face is unchanged");
    } finally {
      await h.unmount();
    }
  });
});

test("H-50 — the /clients register re-reads on ANY client's change (it renders every one of them)", async () => {
  const state = { status: "onboarding" };
  const { impl, clientReads } = mockEstate(state);
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(ClientRegisterList, {})));
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(h.text(), /Onboarding/, `the register's mount read; got: ${h.text()}`);
      const readsAtMount = clientReads.length;

      state.status = "archived";
      await h.act(() => { clientRecordChanged({ clientId: CLIENT_ID }); });
      for (let i = 0; i < 6; i++) await h.settle();

      assert.ok(clientReads.length > readsAtMount, "the register re-read");
      assert.match(h.text(), /Archived/, `cancel archives the client (0017:2865) and the register must say so; got: ${h.text()}`);
    } finally {
      await h.unmount();
    }
  });
});

test("H-50 — the subscription is REMOVED on unmount (an announcement after unmount reaches nothing)", async () => {
  const state = { status: "onboarding" };
  const { impl, clientReads } = mockEstate(state);
  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(ClientWorkspaceOverview, { clientId: CLIENT_ID })));
    for (let i = 0; i < 6; i++) await h.settle();
    await h.unmount();
    const readsAfterUnmount = clientReads.length;
    clientRecordChanged({ clientId: CLIENT_ID });
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(clientReads.length, readsAfterUnmount, "a torn-down page must not keep reading the database");
  });
});

test("the event name is the one both halves use — read from the module, never re-typed here", () => {
  assert.equal(CLIENT_RECORD_CHANGED_EVENT, "clara:client-record-changed");
});

// ===========================================================================================
// The owner's "fullscreen onboarding" ask — the escalation card on the client Home tab.
// ===========================================================================================

/** Like `mockEstate`, but the caller's session list can hold the rail's own client thread —
 *  which is what decides whether the control is a real link or the rail-focus fallback.
 *  `sessionWrites` proves the read-only promise: this card must never CREATE a session, or it
 *  races the rail's own resolver and can mint a duplicate thread for the same (caller, client). */
function mockWithThreads(state: { status: string }, sessions: unknown[]) {
  const sessionWrites: string[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/api/runtime/chat/sessions")) {
      if ((init?.method ?? "GET").toUpperCase() !== "GET") {
        sessionWrites.push(u);
        return jsonResponse({ session_id: "must-never-be-used" });
      }
      return jsonResponse({ sessions });
    }
    if (u.includes("/rest/v1/clients")) {
      return jsonResponse([{ id: CLIENT_ID, name: "ROME PROPERTIES", status: state.status, created_at: "2026-01-01T00:00:00.000Z" }]);
    }
    if (u.includes("/rest/v1/client_facts")) return jsonResponse([]);
    if (u.includes("/rpc/list_review_queue")) return jsonResponse(EMPTY_QUEUE);
    const board = emptyBoardRead(u);
    if (board) return board;
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, sessionWrites };
}

// The subject the runtime's session list reports as the caller. `listSessionsForCaller` reads
// it from the access token, so the token has to be a real JWT shape for `selectOwnSession` to
// match anything at all.
const SUBJECT = "11111111-1111-4111-8111-111111111111";
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const TOKEN = `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: SUBJECT })}.sig`;

function withToken(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => TOKEN);
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

const RAIL_THREAD = "a0a0a0a0-1111-4111-8111-111111111111";

test("the escalation card is offered ONLY while the client is in onboarding — and it links to the rail's OWN thread", async () => {
  const state = { status: "onboarding" };
  const { impl, sessionWrites } = mockWithThreads(state, [
    { id: RAIL_THREAD, client_id: CLIENT_ID, created_by: SUBJECT, visibility: "private", title: "own", created_at: "2026-09-01T00:00:00.000Z" },
  ]);
  await withToken(impl, async () => {
    const h = await renderComponent(App(createElement(ClientWorkspaceOverview, { clientId: CLIENT_ID })));
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      assert.match(h.text(), /Continue onboarding with Clara/, `got: ${h.text()}`);
      const link = h.find((n) => (n as { tagName?: string }).tagName === "A");
      assert.ok(link, "a real link, not a claim of one");
      const href = (link as unknown as { getAttribute: (a: string) => string | null }).getAttribute("href");
      assert.match(String(href), new RegExp(`^/clients/${CLIENT_ID}/clara/${RAIL_THREAD}\\?from=`), `got: ${href}`);
      assert.equal(sessionWrites.length, 0, "READ ONLY: creating a session here would race the rail's own resolver");
    } finally {
      await h.unmount();
    }
  });
});

test("with NO resolvable thread the escalation card offers the rail instead — never a link to a thread nobody saw", async () => {
  const state = { status: "onboarding" };
  const { impl, sessionWrites } = mockWithThreads(state, []);
  await withToken(impl, async () => {
    const h = await renderComponent(App(createElement(ClientWorkspaceOverview, { clientId: CLIENT_ID })));
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      assert.match(h.text(), /Continue onboarding with Clara/, `the control is still offered; got: ${h.text()}`);
      // SCOPED TO THE CARD (裁-190). The board around it now renders many legitimate anchors —
      // the owning-tab links, the fact chips — so "is there an anchor on this page" stopped
      // being a statement about this card's control.
      const card = escalationCard(h);
      assert.ok(card, "the escalation card must be on screen for this claim to mean anything");
      assert.equal(
        findWithin(card, (n) => (n as { tagName?: string }).tagName === "A"),
        null,
        "and the card's control is NOT a link",
      );
      assert.match(h.text(), /could not be resolved/, "it says so, rather than pretending");
      assert.equal(sessionWrites.length, 0, "still no write");
    } finally {
      await h.unmount();
    }
  });
});

for (const status of ["active", "archived"]) {
  test(`a client whose status is '${status}' is NOT offered the onboarding escalation`, async () => {
    const state = { status };
    const { impl } = mockWithThreads(state, [
      { id: RAIL_THREAD, client_id: CLIENT_ID, created_by: SUBJECT, visibility: "private", title: "own", created_at: "2026-09-01T00:00:00.000Z" },
    ]);
    await withToken(impl, async () => {
      const h = await renderComponent(App(createElement(ClientWorkspaceOverview, { clientId: CLIENT_ID })));
      try {
        for (let i = 0; i < 8; i++) await h.settle();
        assert.doesNotMatch(h.text(), /Continue onboarding with Clara/, `got: ${h.text()}`);
      } finally {
        await h.unmount();
      }
    });
  });
}
