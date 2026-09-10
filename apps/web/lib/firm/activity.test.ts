// lib/firm/activity.ts — wire pins (the exact p_* names 0181 declares), the URL-state model's
// parse/serialise round trip (including the `?event=` double-colon agent_receipt case), the
// business-timezone since/until conversion, and the link builders.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  ACTIVITY_KINDS,
  agentReceiptKindOf,
  activityDocumentsHref,
  activityJournalsHref,
  activityReportsHref,
  activityUrlStateEqual,
  activityWorkHref,
  applyActivityUrlState,
  EMPTY_ACTIVITY_URL_STATE,
  formatEventParam,
  getActivityEvent,
  isActivityKind,
  isDateOnly,
  listActivity,
  parseActivityUrlState,
  parseEventParam,
  primaryActivityHref,
  ACTIVITY_MAX_LIMIT,
} from "./activity";
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

// ── wire pins ──────────────────────────────────────────────────────────────────

test("listActivity: posts exactly 0181's six named parameters, converting since/until to the inclusive business-day instant range", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    },
    async () => {
      await listActivity(
        { client: "c1", kinds: ["journal", "close"], since: "2026-01-01", until: "2026-01-31" },
        { session: fixedTokenAccessor("tok"), cursor: "abc", limit: 10 },
      );
      assert.match(seenUrl, /\/rest\/v1\/rpc\/list_activity$/);
      assert.deepEqual(Object.keys(seenBody).sort(), ["p_client", "p_cursor", "p_kinds", "p_limit", "p_since", "p_until"]);
      assert.equal(seenBody.p_client, "c1");
      assert.equal(seenBody.p_cursor, "abc");
      assert.equal(seenBody.p_limit, 10);
      assert.deepEqual(seenBody.p_kinds, ["journal", "close"]);
      assert.equal(seenBody.p_since, "2026-01-01T00:00:00.000+08:00");
      assert.equal(seenBody.p_until, "2026-01-31T23:59:59.999+08:00");
    },
  );
});

test("listActivity: an absent filter posts null, never a missing key or an empty string", async () => {
  let seenBody: Record<string, unknown> = {};
  await withFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    },
    async () => {
      await listActivity({}, { session: fixedTokenAccessor("tok") });
      assert.deepEqual(seenBody, {
        p_cursor: null, p_limit: 25, p_client: null, p_kinds: null, p_since: null, p_until: null,
      });
    },
  );
});

test("listActivity: clamps the limit to the door's own [1, 100] ceiling", async () => {
  const sent: number[] = [];
  await withFetch(
    async (_u, init) => {
      sent.push((JSON.parse(String(init?.body)) as { p_limit: number }).p_limit);
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    },
    async () => {
      await listActivity({}, { session: fixedTokenAccessor("tok"), limit: 100_000 });
      await listActivity({}, { session: fixedTokenAccessor("tok"), limit: 0 });
      assert.deepEqual(sent, [ACTIVITY_MAX_LIMIT, 1]);
    },
  );
});

test("listActivity: a malformed envelope degrades to an empty, non-truncated page rather than throwing", async () => {
  await withFetch(
    async () => jsonResponse({ rows: "not-an-array" }),
    async () => {
      const page = await listActivity({}, { session: fixedTokenAccessor("tok") });
      assert.deepEqual(page, { rows: [], next_cursor: null, truncated: false });
    },
  );
});

test("getActivityEvent: posts p_source/p_id verbatim, including an agent_receipt id that itself carries a colon", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ id: "freeform_read:42", source: "agent_receipt" });
    },
    async () => {
      await getActivityEvent("agent_receipt", "freeform_read:42", { session: fixedTokenAccessor("tok") });
      assert.match(seenUrl, /\/rest\/v1\/rpc\/get_activity_event$/);
      assert.deepEqual(seenBody, { p_source: "agent_receipt", p_id: "freeform_read:42" });
    },
  );
});

// ── the closed kind vocabulary ─────────────────────────────────────────────────

test("isActivityKind: exactly the six declared groups, nothing else", () => {
  for (const k of ACTIVITY_KINDS) assert.ok(isActivityKind(k));
  assert.equal(isActivityKind("receipts"), false);
  assert.equal(isActivityKind(""), false);
});

// ── the `?event=` param, including the double-colon agent_receipt shape ───────

test("formatEventParam/parseEventParam round-trip a plain uuid id", () => {
  const raw = formatEventParam("event", "11111111-1111-1111-1111-111111111111");
  assert.equal(raw, "event:11111111-1111-1111-1111-111111111111");
  assert.deepEqual(parseEventParam(raw), { source: "event", id: "11111111-1111-1111-1111-111111111111" });
});

test("parseEventParam: an agent_receipt id that itself contains a colon splits on the FIRST colon only", () => {
  const raw = formatEventParam("agent_receipt", "freeform_read:42");
  assert.equal(raw, "agent_receipt:freeform_read:42");
  assert.deepEqual(parseEventParam(raw), { source: "agent_receipt", id: "freeform_read:42" });
});

test("parseEventParam: absent, empty, sourceless or unrecognised-source values are null, never thrown", () => {
  assert.equal(parseEventParam(null), null);
  assert.equal(parseEventParam(undefined), null);
  assert.equal(parseEventParam(""), null);
  assert.equal(parseEventParam("no-colon-here"), null);
  assert.equal(parseEventParam("bogus_source:123"), null);
  assert.equal(parseEventParam(":missing-source"), null);
  assert.equal(parseEventParam("event:"), null);
});

// ── date-only validation ───────────────────────────────────────────────────────

test("isDateOnly: shape AND calendar validity", () => {
  assert.equal(isDateOnly("2026-09-11"), true);
  assert.equal(isDateOnly("2026-02-30"), false, "not a real day");
  assert.equal(isDateOnly("2026-9-1"), false, "not zero-padded");
  assert.equal(isDateOnly("not-a-date"), false);
});

// ── URL-state parse/serialise round trip ───────────────────────────────────────

function params(query: string): URLSearchParams {
  return new URLSearchParams(query);
}

test("parseActivityUrlState: every field, including a comma-joined, de-duplicated kinds list", () => {
  const state = parseActivityUrlState(
    params("client=c1&kinds=journal,close,journal&since=2026-01-01&until=2026-01-31&cursor=abc&event=event:e1"),
  );
  assert.deepEqual(state, {
    client: "c1",
    kinds: ["journal", "close"],
    since: "2026-01-01",
    until: "2026-01-31",
    cursor: "abc",
    event: { source: "event", id: "e1" },
  });
});

test("parseActivityUrlState: an empty query is the empty state", () => {
  assert.deepEqual(parseActivityUrlState(params("")), EMPTY_ACTIVITY_URL_STATE);
});

test("parseActivityUrlState: an unrecognised kind token is dropped, not sent to the door as garbage", () => {
  const state = parseActivityUrlState(params("kinds=journal,not_a_kind,close"));
  assert.deepEqual(state.kinds, ["journal", "close"]);
});

test("parseActivityUrlState: a malformed since/until degrades to absent rather than an invalid door call", () => {
  const state = parseActivityUrlState(params("since=not-a-date&until=2026-02-30"));
  assert.equal(state.since, null);
  assert.equal(state.until, null);
});

test("applyActivityUrlState: patches one field and leaves every other param untouched", () => {
  const base = params("client=c1&kinds=journal&since=2026-01-01");
  const next = applyActivityUrlState(base, { cursor: "page2" });
  assert.equal(next.get("client"), "c1");
  assert.equal(next.get("kinds"), "journal");
  assert.equal(next.get("since"), "2026-01-01");
  assert.equal(next.get("cursor"), "page2");
  // the input is not mutated
  assert.equal(base.get("cursor"), null);
});

test("applyActivityUrlState: an explicit null/empty DELETES the key rather than writing an empty string", () => {
  const base = params("client=c1&since=2026-01-01");
  const next = applyActivityUrlState(base, { client: null, since: "" });
  assert.equal(next.has("client"), false);
  assert.equal(next.has("since"), false);
  assert.equal(next.toString(), "");
});

test("applyActivityUrlState: a field absent from the patch object is left exactly as it was", () => {
  const base = params("client=c1&cursor=abc");
  const next = applyActivityUrlState(base, { since: "2026-01-01" });
  assert.equal(next.get("client"), "c1", "untouched by a patch that never named it");
  assert.equal(next.get("cursor"), "abc", "untouched");
  assert.equal(next.get("since"), "2026-01-01");
});

test("applyActivityUrlState: opening/closing the event Sheet round-trips through the same param", () => {
  const base = params("client=c1&kinds=journal");
  const opened = applyActivityUrlState(base, { event: { source: "agent_receipt", id: "freeform_read:42" } });
  assert.equal(opened.get("event"), "agent_receipt:freeform_read:42");
  const closed = applyActivityUrlState(opened, { event: null });
  assert.equal(closed.has("event"), false);
  assert.equal(closed.get("client"), "c1", "closing the Sheet preserves the filters");
  assert.equal(closed.get("kinds"), "journal");
});

test("activityUrlStateEqual: filters equal, order-sensitive on kinds, event compared by (source,id)", () => {
  const a = parseActivityUrlState(params("client=c1&kinds=journal,close&event=event:e1"));
  const b = parseActivityUrlState(params("client=c1&kinds=journal,close&event=event:e1"));
  assert.equal(activityUrlStateEqual(a, b), true);
  const c = parseActivityUrlState(params("client=c1&kinds=close,journal"));
  assert.equal(activityUrlStateEqual(a, c), false, "kind order differs");
  const d = parseActivityUrlState(params("client=c2&kinds=journal,close&event=event:e1"));
  assert.equal(activityUrlStateEqual(a, d), false, "client differs");
});

// ── agentReceiptKindOf: the client-side re-derivation of the same id encoding ──

test("agentReceiptKindOf: the receipt_kind half of an agent_receipt row's id", () => {
  assert.equal(agentReceiptKindOf({ source: "agent_receipt", id: "freeform_read:42" }), "freeform_read");
  assert.equal(agentReceiptKindOf({ source: "agent_receipt", id: "agent_filing:11111111-1111-1111-1111-111111111111" }), "agent_filing");
});

test("agentReceiptKindOf: null for any other source, or a malformed id with no colon", () => {
  assert.equal(agentReceiptKindOf({ source: "event", id: "e1" }), null);
  assert.equal(agentReceiptKindOf({ source: "operation_receipt", id: "r1" }), null);
  assert.equal(agentReceiptKindOf({ source: "agent_receipt", id: "no-colon" }), null);
});

// ── link builders ────────────────────────────────────────────────────────────

test("activityWorkHref: the durable Work record's own address", () => {
  assert.equal(activityWorkHref("c1", "w1"), "/clients/c1/work/w1");
});

test("activityJournalsHref/activityDocumentsHref/activityReportsHref: the stable tab, not a per-row deep link", () => {
  assert.equal(activityJournalsHref("c1"), "/clients/c1/journals");
  assert.equal(activityDocumentsHref("c1"), "/clients/c1/documents");
  assert.equal(activityReportsHref("c1"), "/clients/c1/reports");
});

test("primaryActivityHref: prefers the Work link over an object link when both are present", () => {
  const href = primaryActivityHref({ client_id: "c1", work_id: "w1", object_kind: "entry" });
  assert.equal(href, "/clients/c1/work/w1");
});

test("primaryActivityHref: falls back to the object's tab when there is no Work", () => {
  assert.equal(primaryActivityHref({ client_id: "c1", work_id: null, object_kind: "entry" }), "/clients/c1/journals");
  assert.equal(primaryActivityHref({ client_id: "c1", work_id: null, object_kind: "document" }), "/clients/c1/documents");
});

test("primaryActivityHref: null when there is no client to scope the link to (e.g. a platform-scope receipt)", () => {
  assert.equal(primaryActivityHref({ client_id: null, work_id: null, object_kind: null }), null);
});
