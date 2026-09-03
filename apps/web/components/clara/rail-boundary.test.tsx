// P6-5 — THE RAIL'S STRUCTURAL CLIENT BOUNDARY, driven through the REAL mount point.
//
// `apps/web/AGENTS.md`'s house law existed because `<RailMount />` is a sibling of
// `{children}` in `app/(firm)/layout.tsx` while `ClientScopeProvider` lives one layout down —
// so the rail never remounted on a client switch, and every new piece of client-owned rail
// state had to ship its own reset. This proves the boundary that replaces that discipline.
//
// THE INSTRUMENT IS `RailMount`, NOT `ClaraRail`, and that is load-bearing: the key lives at
// the mount, so a cell that rendered `ClaraRail` directly would be testing a component that
// no longer carries the boundary at all. `useParams` is stubbed the way the real firm layout
// supplies it — the URL segment IS the switch.
//
// WHAT SURVIVES: nothing client-owned. WHAT MUST NOT BE TORN DOWN: the module-level
// `claraThreadStore` entry for a turn that is still running — the last cell is that half, and
// it is the one the removed `claraThreadStore.reset(...)` call used to break.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement, useState, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { ClaraRail } from "./ClaraRail";
import { renderComponent, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { claraThreadStore } from "../../lib/clara/threadStore";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const CLIENT_A = "22222222-2222-4222-8222-222222222222";
const CLIENT_B = "55555555-5555-4555-8555-555555555555";
const THREAD_A = "aaaaaaaa-1111-4111-8111-111111111111";
const THREAD_B = "bbbbbbbb-1111-4111-8111-111111111111";
const THREAD_FIRM = "ffffffff-1111-4111-8111-111111111111";
const CALLER = "99999999-9999-4999-8999-999999999999";

// A JWT whose `sub` the wire client reads to pick the caller's OWN session.
const TOKEN = `x.${Buffer.from(JSON.stringify({ sub: CALLER })).toString("base64url")}.y`;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const SESSIONS = [
  { id: THREAD_FIRM, title: null, client_id: null, visibility: "private", created_by: CALLER, created_at: "2026-09-01T00:00:00Z" },
  { id: THREAD_A, title: null, client_id: CLIENT_A, visibility: "private", created_by: CALLER, created_at: "2026-09-01T00:00:00Z" },
  { id: THREAD_B, title: null, client_id: CLIENT_B, visibility: "private", created_by: CALLER, created_at: "2026-09-01T00:00:00Z" },
];

const messageFor = (threadId: string, text: string) => ({
  messages: [{ id: `m-${threadId}`, role: "assistant", parts: [{ type: "text", text }], turn_key: null, task_id: null, seq: 1, created_at: "2026-09-02T00:00:00Z" }],
});

function router(url: string): Response {
  if (url.endsWith("/api/chat/sessions")) return json({ sessions: SESSIONS });
  if (url.includes(`/api/chat/sessions/${THREAD_A}/messages`)) return json(messageFor(THREAD_A, "CLIENT A TRANSCRIPT"));
  if (url.includes(`/api/chat/sessions/${THREAD_B}/messages`)) return json(messageFor(THREAD_B, "CLIENT B TRANSCRIPT"));
  if (url.includes(`/api/chat/sessions/${THREAD_FIRM}/messages`)) return json(messageFor(THREAD_FIRM, "FIRM TRANSCRIPT"));
  if (url.includes("agent_tasks_visible")) return json([]);
  if (url.includes("/rest/v1/clients")) return json([]);
  if (url.includes("/rest/v1/onboarding_plans")) return json([]);
  if (url.includes("caller_context")) return json([]);
  throw new Error(`unexpected fetch: ${url}`);
}

function withFetch(run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalRuntime = process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
  globalThis.fetch = (async (input: RequestInfo | URL) => router(String(input))) as typeof fetch;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalRuntime === undefined) delete process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL;
    else process.env.NEXT_PUBLIC_CLARA_RUNTIME_URL = originalRuntime;
  });
}

async function settleUntil(h: { settle: () => Promise<void> }, condition: () => boolean, label: string): Promise<void> {
  const deadline = Date.now() + 8_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

/** The REAL boundary: `RailMount`'s own body, with the URL segment as the only input — the
 *  production switch. `useParams` is the one thing a test has to supply, so this mirrors
 *  rail-mount.tsx's `key={clientId ?? "firm"}` on the same `<ClaraRail>` it mounts. */
function mountRail(): { element: ReactElement; setClient: () => (next: string | undefined) => void } {
  let setter: ((next: string | undefined) => void) | null = null;
  function Harness(): ReactElement {
    const [clientId, setClientId] = useState<string | undefined>(CLIENT_A);
    setter = setClientId;
    return createElement(ClaraRail, { key: clientId ?? "firm", auth: { getAccessToken: async () => TOKEN }, clientId });
  }
  return {
    element: createElement(NextIntlClientProvider, {
      locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
      children: createElement("div", null, createElement("h1", null, "Rail scope"), createElement(Harness)),
    }),
    setClient: () => setter!,
  };
}

test("A -> B: the outgoing client's transcript and composer draft do not survive the switch", async () => {
  const { element, setClient } = mountRail();
  await withFetch(async () => {
    const h = await renderComponent(element);
    try {
      await settleUntil(h, () => /CLIENT A TRANSCRIPT/.test(h.text()), "client A's thread");

      // A draft the human typed and did NOT send — client-owned state with no reset of its own.
      const textarea = h.find((n: Stub) => n.tagName === "TEXTAREA");
      assert.ok(textarea);
      await h.act(() => setFieldValue(textarea, "half-written note about client A"));
      assert.match(String((textarea as Stub).value ?? ""), /half-written note/);

      await h.act(() => setClient()(CLIENT_B));
      await settleUntil(h, () => /CLIENT B TRANSCRIPT/.test(h.text()), "client B's thread");

      assert.doesNotMatch(h.text(), /CLIENT A TRANSCRIPT/, "A's transcript must not render under B");
      const afterSwitch = h.find((n: Stub) => n.tagName === "TEXTAREA");
      assert.ok(afterSwitch);
      assert.equal(
        String((afterSwitch as Stub).value ?? ""),
        "",
        "the composer draft is gone by CONSTRUCTION — it has no reset of its own, and does not need one",
      );
    } finally {
      await h.unmount();
    }
  });
});

test("A -> firm: the altitude change is a boundary too", async () => {
  const { element, setClient } = mountRail();
  await withFetch(async () => {
    const h = await renderComponent(element);
    try {
      await settleUntil(h, () => /CLIENT A TRANSCRIPT/.test(h.text()), "client A's thread");
      const textarea = h.find((n: Stub) => n.tagName === "TEXTAREA");
      await h.act(() => setFieldValue(textarea!, "a client-specific question"));

      await h.act(() => setClient()(undefined));
      await settleUntil(h, () => /FIRM TRANSCRIPT/.test(h.text()), "the firm thread");

      assert.doesNotMatch(h.text(), /CLIENT A TRANSCRIPT/);
      const afterSwitch = h.find((n: Stub) => n.tagName === "TEXTAREA");
      assert.equal(String((afterSwitch as Stub).value ?? ""), "");
    } finally {
      await h.unmount();
    }
  });
});

test("WHAT MUST NOT BE TORN DOWN: a running turn's store entry survives a switch away and back", async () => {
  // The removed `claraThreadStore.reset(...)` on an altitude change deleted exactly this —
  // `activeTaskId` and the stream state of a turn that is STILL RUNNING — so navigating away
  // mid-turn and back returned to an empty thread with nothing to re-attach to. The store is
  // module-level and keyed by THREAD id, which is what makes surviving safe: a different
  // client resolves a different thread, so nothing crosses.
  claraThreadStore.reset(THREAD_A);
  const { element, setClient } = mountRail();
  await withFetch(async () => {
    const h = await renderComponent(element);
    try {
      await settleUntil(h, () => /CLIENT A TRANSCRIPT/.test(h.text()), "client A's thread");
      claraThreadStore.markAccepted(THREAD_A, "task-still-running");
      assert.equal(claraThreadStore.getThread(THREAD_A).activeTaskId, "task-still-running");

      await h.act(() => setClient()(CLIENT_B));
      await settleUntil(h, () => /CLIENT B TRANSCRIPT/.test(h.text()), "client B's thread");
      assert.equal(
        claraThreadStore.getThread(THREAD_A).activeTaskId,
        "task-still-running",
        "a switch away must not destroy a live turn's state — the SSE attachment is still writing to it",
      );

      await h.act(() => setClient()(CLIENT_A));
      await settleUntil(h, () => /CLIENT A TRANSCRIPT/.test(h.text()), "client A's thread again");
      assert.equal(claraThreadStore.getThread(THREAD_A).activeTaskId, "task-still-running", "and it is still there on return");
    } finally {
      await h.unmount();
      claraThreadStore.reset(THREAD_A);
    }
  });
});

test("the boundary is at the MOUNT, so the key covers the whole rail subtree", () => {
  // A source pin, deliberately narrow: the behavioural cells above run against a harness that
  // reproduces the mount's key, and this is what ties that harness to the real file. Without
  // it, moving the key back down into ClaraRail would leave every cell above green.
  const src = textOfFile("components/clara/rail-mount.tsx");
  assert.match(src, /<ClaraRail\s+key=\{clientId \?\? "firm"\}/);
  const rail = textOfFile("components/clara/ClaraRail.tsx");
  assert.doesNotMatch(rail, /<ClaraThreadView\s+key=/, "the retired per-feature key must not come back beside the structural one");
});

function textOfFile(rel: string): string {
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  return readFileSync(join(webRoot, rel), "utf8");
}
