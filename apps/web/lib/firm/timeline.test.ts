// The firm-timeline contract wrapper: the wire shape it posts, and — the load-bearing half —
// the ONE failure shape it is allowed to call "not deployed yet".
//
// WHY THAT SECOND HALF MATTERS ENOUGH TO HAVE ITS OWN FILE. The section built on this module
// renders an honest `NotBuiltNote` when the read is absent. If the predicate were even slightly
// too wide, a genuine outage, a lost session or a bookkeeper-floor refusal would all be painted
// as "this feature is not built" — telling a professional the product is missing something it
// has, and hiding a real failure behind a designed-looking state. Every cell below is a
// different failure shape, and only one of them is allowed to say yes.

import { test } from "node:test";
import assert from "node:assert/strict";

import { DoorError } from "../doors";
import { RefusalError } from "../wire";
import { isTimelineNotDeployed, listFirmTimeline, FIRM_TIMELINE_MAX_LIMIT } from "./timeline";
import { fixedTokenAccessor } from "../supabase/server-session";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

const ROW = {
  seq: 42, event_type: "entry_posted", event_description: "An entry was posted.",
  client_id: "c1", actor: "u1", on_behalf_of: null, via_wake_kind: null,
  created_at: "2026-09-04T02:00:00Z",
};

test("listFirmTimeline: posts p_after_seq and p_limit to the RPC and returns the rows verbatim", async () => {
  let seenUrl = "";
  let seenBody: unknown = null;
  await withFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([ROW]);
    },
    async () => {
      const rows = await listFirmTimeline(fixedTokenAccessor("tok"), 99, 20);
      assert.match(seenUrl, /\/rest\/v1\/rpc\/list_firm_timeline$/);
      assert.deepEqual(seenBody, { p_after_seq: 99, p_limit: 20 });
      // Verbatim: no field is renamed, dropped or defaulted on the way through.
      assert.deepEqual(rows, [ROW]);
    },
  );
});

test("listFirmTimeline: a null cursor is sent as null — 'the newest page', which is the contract's own NULL meaning", async () => {
  let seenBody: Record<string, unknown> = {};
  await withFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse([]);
    },
    async () => {
      await listFirmTimeline(fixedTokenAccessor("tok"), null, 5);
      assert.equal(seenBody.p_after_seq, null);
    },
  );
});

test("listFirmTimeline: clamps the page size to the DB's own [1, 200] ceiling rather than asking for more", async () => {
  const sent: number[] = [];
  await withFetch(
    async (_u, init) => {
      sent.push((JSON.parse(String(init?.body)) as { p_limit: number }).p_limit);
      return jsonResponse([]);
    },
    async () => {
      await listFirmTimeline(fixedTokenAccessor("tok"), null, 100_000);
      await listFirmTimeline(fixedTokenAccessor("tok"), null, 0);
      assert.deepEqual(sent, [FIRM_TIMELINE_MAX_LIMIT, 1]);
    },
  );
});

test("listFirmTimeline: a non-array body is reported as EMPTY, never coerced into fabricated rows", async () => {
  await withFetch(
    async () => jsonResponse({ unexpected: true }),
    async () => {
      assert.deepEqual(await listFirmTimeline(fixedTokenAccessor("tok")), []);
    },
  );
});

// --- isTimelineNotDeployed: one YES, and every other shape a NO -------------------------------

test("isTimelineNotDeployed: a 404 (PostgREST does not know the function) is the ONE yes", () => {
  assert.equal(
    isTimelineNotDeployed(new DoorError("not found", { status: 404, pgCode: "PGRST202", kind: "not_found" })),
    true,
  );
});

test("isTimelineNotDeployed: SQLSTATE 42883 (undefined_function) is the other yes, whatever status carried it", () => {
  assert.equal(
    isTimelineNotDeployed(new DoorError("undefined function", { status: 400, pgCode: "42883", kind: "unexpected" })),
    true,
  );
});

test("isTimelineNotDeployed: a GOVERNED REFUSAL is NO — a viewer's CLR04 is an answer about rank, not an absent feature", () => {
  // `codeSource: "sqlstate"` is the REAL shape: a governed raise puts the CLR code in the
  // SQLSTATE, which PostgREST reports as `body.code` (lib/wire.ts's own ordering note).
  const refusal = new RefusalError("CLR04", "insufficient rank", { reason: null, status: 400, pgCode: "CLR04", codeSource: "sqlstate" });
  assert.equal(isTimelineNotDeployed(refusal), false);
});

test("isTimelineNotDeployed: 403, 401, 5xx and a transport failure are all NO — a read that did not answer proves nothing", () => {
  const cases: [string, DoorError][] = [
    ["forbidden", new DoorError("forbidden", { status: 403, kind: "forbidden" })],
    ["unauthenticated", new DoorError("jwt expired", { status: 401, kind: "unauthenticated" })],
    ["server_error", new DoorError("boom", { status: 500, kind: "server_error" })],
    ["transport", new DoorError("network failed", { status: null, kind: "transport" })],
    ["no_session", new DoorError("no live session", { status: null, kind: "no_session" })],
  ];
  for (const [name, error] of cases) {
    assert.equal(isTimelineNotDeployed(error), false, `${name} must not be painted as "not built yet"`);
  }
});

test("isTimelineNotDeployed: a plain Error and null are NO — only a typed door failure can answer this question", () => {
  assert.equal(isTimelineNotDeployed(new Error("something")), false);
  assert.equal(isTimelineNotDeployed(null), false);
  assert.equal(isTimelineNotDeployed(undefined), false);
});
