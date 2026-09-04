// H-51 / CB-AE2E-024 — the "Add client" control on /clients.
//
// WHAT THESE CELLS ARE FOR. The control is an AFFORDANCE gate in front of a door that is the
// real wall: `begin_client_onboarding` is `security definer` and floors at admin inside its own
// body (`_human_ctx(role_rank('admin'))`, 0017_wave_b.sql:2497). So the property under test is
// not "the database refused" — a mock re-implementing a Postgres floor would be a second copy
// of a wall, and greening it would prove the copy. It is: the caller the DATABASE ranks below
// the floor is never OFFERED the control, the caller it ranks above is, the dispatch goes
// through ⌘K's own predicate rather than a second copy of it, and a refusal renders verbatim.
//
// THE PERSONA CHANGES IN THE FIXTURE, not in a flag this file invented: `caller_context` is
// the DB-computed rank (0141:549), and every cell below changes only what that read returns.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { clickButton, renderComponent, setFieldValue, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { findDoAction } from "../../lib/command/do-actions";
import messages from "../../messages/en.json";
import { ClientRegisterList } from "./client-register-list";

enableDomInspection();

const NEW_CLIENT_ID = "9c9c9c9c-9999-4999-8999-999999999999";
const pushed: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      AppRouterContext.Provider as never,
      { value: { replace: () => {}, refresh: () => {}, push: (h: string) => { pushed.push(h); }, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
      createElement(PathnameContext.Provider as never, { value: "/clients" as never }, children),
    ),
  });
}

type Persona = { role: string; role_rank: number } | "unreadable" | "no_membership";

/** `beginCalls` is what proves a dispatch actually reached the door — an absent control and a
 *  control that fires nothing are different failures, and only a counter tells them apart. */
function mockEstate(persona: Persona, opts: { refuse?: boolean } = {}) {
  const beginCalls: unknown[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    if (u.includes("/rest/v1/caller_context")) {
      if (persona === "unreadable") return jsonResponse({ message: "boom" }, 500);
      if (persona === "no_membership") return jsonResponse([]);
      // The ids MUST be real UUIDs: `isCallerContextRow` rejects the row otherwise, and a
      // rejected row is `null`, which meets no floor — a fixture with "u1"/"f1" would make
      // every "the control is absent" cell pass for a reason that has nothing to do with the
      // caller's rank. (Measured: it did, on the first cut of this file.)
      return jsonResponse([{ user_id: "11111111-1111-4111-8111-111111111111", firm_id: "33333333-3333-4333-8333-333333333333", firm_name: "E2E Accounting", role: persona.role, role_rank: persona.role_rank, is_operator: false }]);
    }
    if (u.includes("/rest/v1/clients")) return jsonResponse([]);
    if (u.includes("/rest/v1/client_facts")) return jsonResponse([]);
    if (u.includes("/rpc/begin_client_onboarding")) {
      beginCalls.push(init?.body ? JSON.parse(String(init.body)) : null);
      return opts.refuse
        ? jsonResponse({ code: "CLR04", message: "your role may not open a client file", details: null }, 400)
        : jsonResponse({ client_id: NEW_CLIENT_ID, plan_id: "plan-new" });
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, beginCalls };
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

type Node = { tagName?: string; childNodes?: Node[]; disabled?: boolean; getAttribute?: (a: string) => string | null };

function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

async function mount() {
  const h = await renderComponent(App(createElement(ClientRegisterList, {})));
  for (let i = 0; i < 6; i++) await h.settle();
  return h;
}

function addClientTrigger(h: Awaited<ReturnType<typeof mount>>): Node | null {
  return h.find((n) => (n as Node).tagName === "BUTTON" && textOf(n) === "Add client") as Node | null;
}

test("H-51 — an ADMIN-ranked caller is offered the control on the register", async () => {
  const { impl } = mockEstate({ role: "admin", role_rank: 2 });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      assert.ok(addClientTrigger(h), `expected the Add client control; got: ${h.text()}`);
    } finally {
      await h.unmount();
    }
  });
});

test("H-51 — a BOOKKEEPER-ranked caller is not, and no greyed promise is offered in its place", async () => {
  const { impl } = mockEstate({ role: "bookkeeper", role_rank: 1 });
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      assert.equal(addClientTrigger(h), null, `the row must be ABSENT below the floor; got: ${h.text()}`);
      assert.doesNotMatch(h.text(), /Add client/, "not even as disabled text");
    } finally {
      await h.unmount();
    }
  });
});

test("H-51 — the transcribed floor is the DOOR's, held by the ⌘K drift guard rather than re-typed here", () => {
  // Review law 3: a floor in a component is a PROJECTION of the door. This cell reads the
  // floor out of the SAME spec the control gates on, so the two cannot diverge; keeping the
  // floor honest against the live SQL body is `lib/command/do-action-floors.test.ts`'s job,
  // and this surface inherits that guard by using its spec instead of a copy.
  const spec = findDoAction("beginClientOnboarding");
  assert.ok(spec, "the register's control gates on this spec");
  assert.equal(spec.floor, "admin");
  assert.deepEqual(spec.floorSource, { kind: "sql", fn: "begin_client_onboarding" });
});

test("H-51 — a FAILED authority read renders an honest note, never an absence that reads as 'your role grants nothing'", async () => {
  const { impl } = mockEstate("unreadable");
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      assert.equal(addClientTrigger(h), null, "fail-closed: no control on a read that never landed");
      assert.match(h.text(), /could not read what your role is allowed to do/, `got: ${h.text()}`);
      assert.match(h.text(), /This is a failed read, not a decision about your role/, "the two sentences are different facts");
    } finally {
      await h.unmount();
    }
  });
});

test("H-51 — a caller with NO membership gets neither the control nor the failed-read note", async () => {
  const { impl } = mockEstate("no_membership");
  await withMockedEnv(impl, async () => {
    const h = await mount();
    try {
      assert.equal(addClientTrigger(h), null);
      assert.doesNotMatch(h.text(), /could not read what your role is allowed to do/, "a successful read that found no membership is not a failed read");
    } finally {
      await h.unmount();
    }
  });
});

test("CB-AE2E-024 — the CONFIRM is gated on the typed name, and a real dispatch calls the door once and navigates to the id the DATABASE returned", async () => {
  const { impl, beginCalls } = mockEstate({ role: "owner", role_rank: 3 });
  await withMockedEnv(impl, async () => {
    pushed.length = 0;
    const h = await mount();
    try {
      const trigger = addClientTrigger(h);
      assert.ok(trigger);
      await clickButton(trigger as never);
      for (let i = 0; i < 4; i++) await h.settle();

      const body = globalThis.document.body as unknown as Node;
      const field = findIn(body, (n) => n.tagName === "INPUT" && n.getAttribute?.("aria-label") === "Client name");
      const confirm = findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Begin onboarding");
      assert.ok(field && confirm, "the dialog's own name field and Confirm");

      // ASSERT THE GATE, THEN ACT: an empty name fails the action's own `ready` predicate.
      assert.equal(confirm.disabled, true, "no name typed — the same predicate ⌘K filters with says no");
      assert.equal(beginCalls.length, 0, "and the door has not been touched");

      await h.act(() => setFieldValue(field as never, "ROME PUBLIC ADVISORY"));
      assert.equal(confirm.disabled, false, "a typed name satisfies the predicate");

      await clickButton(confirm as never);
      for (let i = 0; i < 6; i++) await h.settle();

      assert.equal(beginCalls.length, 1, "exactly one governed call");
      assert.equal((beginCalls[0] as { p_name: string }).p_name, "ROME PUBLIC ADVISORY", "the typed name IS the door's p_name");
      assert.deepEqual(pushed, [`/clients/${NEW_CLIENT_ID}`], "the human lands on the client the DATABASE returned, never a guessed path");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("CB-AE2E-024 — a DoorRefusal renders VERBATIM with its code, and adds no row", async () => {
  const { impl, beginCalls } = mockEstate({ role: "owner", role_rank: 3 }, { refuse: true });
  await withMockedEnv(impl, async () => {
    pushed.length = 0;
    const h = await mount();
    try {
      await clickButton(addClientTrigger(h) as never);
      for (let i = 0; i < 4; i++) await h.settle();
      const body = globalThis.document.body as unknown as Node;
      const field = findIn(body, (n) => n.tagName === "INPUT" && n.getAttribute?.("aria-label") === "Client name");
      await h.act(() => setFieldValue(field as never, "ROME PUBLIC ADVISORY"));
      await clickButton(findIn(body, (n) => n.tagName === "BUTTON" && textOf(n as never) === "Begin onboarding") as never);
      for (let i = 0; i < 6; i++) await h.settle();

      assert.equal(beginCalls.length, 1, "attempted once, and NEVER retried");
      assert.match(h.text(), /your role may not open a client file/, `the DB's own words, unedited; got: ${h.text()}`);
      assert.match(h.text(), /CLR04/, "and its code");
      assert.deepEqual(pushed, [], "a refusal navigates nowhere");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});
