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
  activityWorkHref,
  applyActivityUrlState,
  describeActivity,
  formatEventParam,
  getActivityEvent,
  isActivityKind,
  isDateOnly,
  isKnownActivityStatus,
  listActivity,
  parseActivityUrlState,
  parseEventParam,
  primaryActivityHref,
  ACTIVITY_MAX_LIMIT,
  type ActivityUrlState,
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

test("listActivity: posts exactly 0181's six named parameters — since is that day's inclusive start, until is the NEXT day's exclusive start", async () => {
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
      // EXCLUSIVE: the day AFTER "until", not "2026-01-31T23:59:59.999+08:00" — a millisecond-
      // resolution literal would silently drop a row in the last sub-millisecond of the 31st,
      // since occurred_at carries microsecond precision (0181's own door compares `< p_until`).
      assert.equal(seenBody.p_until, "2026-02-01T00:00:00.000+08:00");
    },
  );
});

test("listActivity: the until boundary rolls over a month AND a year correctly", async () => {
  let seenBody: Record<string, unknown> = {};
  await withFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return jsonResponse({ rows: [], next_cursor: null, truncated: false });
    },
    async () => {
      await listActivity({ until: "2026-12-31" }, { session: fixedTokenAccessor("tok") });
      assert.equal(seenBody.p_until, "2027-01-01T00:00:00.000+08:00", "31 Dec rolls into next year");
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

const C1 = "11111111-1111-1111-1111-111111111111";

test("parseActivityUrlState: every field, including a comma-joined, de-duplicated kinds list", () => {
  const state = parseActivityUrlState(
    params(`client=${C1}&kinds=journal,close,journal&since=2026-01-01&until=2026-01-31&event=event:e1`),
  );
  assert.deepEqual(state, {
    client: C1,
    kinds: ["journal", "close"],
    since: "2026-01-01",
    until: "2026-01-31",
    event: { source: "event", id: "e1" },
  });
});

test("parseActivityUrlState: an empty query is the empty state", () => {
  assert.deepEqual(parseActivityUrlState(params("")), {
    client: null, kinds: [], since: null, until: null, event: null,
  });
});

test("parseActivityUrlState: there is no cursor field at all — a stale ?cursor= is silently ignored", () => {
  const state = parseActivityUrlState(params("client=" + C1 + "&cursor=some-stale-page-token"));
  assert.equal("cursor" in state, false);
  assert.deepEqual(Object.keys(state).sort(), ["client", "event", "kinds", "since", "until"]);
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

test("parseActivityUrlState: a non-uuid-shaped ?client= is DROPPED, never posted to the door's uuid column", () => {
  assert.equal(parseActivityUrlState(params("client=not-a-client")).client, null);
  assert.equal(parseActivityUrlState(params("client=../../etc")).client, null);
  assert.equal(parseActivityUrlState(params(`client=${C1}`)).client, C1, "a real uuid still passes through");
});

test("applyActivityUrlState: patches one field and leaves every other param untouched", () => {
  const base = params("client=c1&kinds=journal&since=2026-01-01");
  const next = applyActivityUrlState(base, { until: "2026-01-31" });
  assert.equal(next.get("client"), "c1");
  assert.equal(next.get("kinds"), "journal");
  assert.equal(next.get("since"), "2026-01-01");
  assert.equal(next.get("until"), "2026-01-31");
  // the input is not mutated
  assert.equal(base.get("until"), null);
});

test("applyActivityUrlState: an explicit null/empty DELETES the key rather than writing an empty string", () => {
  const base = params("client=c1&since=2026-01-01");
  const next = applyActivityUrlState(base, { client: null, since: "" });
  assert.equal(next.has("client"), false);
  assert.equal(next.has("since"), false);
  assert.equal(next.toString(), "");
});

test("applyActivityUrlState: a field absent from the patch object is left exactly as it was", () => {
  const base = params("client=c1&until=2026-01-31");
  const next = applyActivityUrlState(base, { since: "2026-01-01" });
  assert.equal(next.get("client"), "c1", "untouched by a patch that never named it");
  assert.equal(next.get("until"), "2026-01-31", "untouched");
  assert.equal(next.get("since"), "2026-01-01");
});

test("applyActivityUrlState: there is no cursor key to patch — the type has no such field", () => {
  const base = params("client=c1");
  // @ts-expect-error — `cursor` is not part of ActivityUrlState any more (#632 review finding 6).
  const patch: Partial<ActivityUrlState> = { cursor: "x" };
  const next = applyActivityUrlState(base, patch);
  assert.equal(next.has("cursor"), false, "even if a caller smuggled the field in, it is never written to the URL");
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

test("parseActivityUrlState/applyActivityUrlState round trip, compared with plain deepEqual", () => {
  const C2 = "22222222-2222-2222-2222-222222222222";
  const a = parseActivityUrlState(params(`client=${C1}&kinds=journal,close&event=event:e1`));
  const b = parseActivityUrlState(params(`client=${C1}&kinds=journal,close&event=event:e1`));
  assert.deepEqual(a, b);
  const c = parseActivityUrlState(params(`client=${C1}&kinds=close,journal`));
  assert.notDeepEqual(a, c, "kind order differs");
  const d = parseActivityUrlState(params(`client=${C2}&kinds=journal,close&event=event:e1`));
  assert.notDeepEqual(a, d, "client differs");
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

test("activityJournalsHref/activityDocumentsHref: the stable tab by default, and an `?entry=` deep link when an entry id is given", () => {
  assert.equal(activityJournalsHref("c1"), "/clients/c1/journals");
  assert.equal(activityJournalsHref("c1", "e1"), "/clients/c1/journals?entry=e1");
  assert.equal(activityJournalsHref("c1", null), "/clients/c1/journals", "a null entry id is the same as none");
  assert.equal(activityDocumentsHref("c1"), "/clients/c1/documents");
});

test("primaryActivityHref: prefers the Work link over an object link when both are present", () => {
  const href = primaryActivityHref({ client_id: "c1", work_id: "w1", object_kind: "entry", object_id: "e1" });
  assert.equal(href, "/clients/c1/work/w1");
});

test("primaryActivityHref: falls back to the object's tab when there is no Work, deep-linking an entry by its own id", () => {
  assert.equal(
    primaryActivityHref({ client_id: "c1", work_id: null, object_kind: "entry", object_id: "e1" }),
    "/clients/c1/journals?entry=e1",
  );
  assert.equal(
    primaryActivityHref({ client_id: "c1", work_id: null, object_kind: "document", object_id: "d1" }),
    "/clients/c1/documents",
  );
});

test("primaryActivityHref: null when there is no client to scope the link to (e.g. a platform-scope receipt)", () => {
  assert.equal(primaryActivityHref({ client_id: null, work_id: null, object_kind: null, object_id: null }), null);
});

// ── isKnownActivityStatus: the one checked narrowing over the closed status set ─

test("isKnownActivityStatus: the four states 0181's derivation can produce, nothing else", () => {
  assert.equal(isKnownActivityStatus("approved"), true);
  assert.equal(isKnownActivityStatus("reversed"), true);
  assert.equal(isKnownActivityStatus("superseded"), true);
  assert.equal(isKnownActivityStatus("withdrawn"), true);
  assert.equal(isKnownActivityStatus("draft"), false, "the raw je.status pass-through is not a member");
  assert.equal(isKnownActivityStatus(""), false);
});

// ── describeActivity: the ONE sentence-picking function shared by the row and the Sheet ────────

const tActivity = (key: string) => (key === "unlabeledEvent" ? "Unlabelled event" : `Activity.${key}`);
const tReceipt = (key: string) => `FirmActivity.${key}`;

test("describeActivity: an event row uses its own description, falling back to event_type, then the unlabelled copy", () => {
  assert.equal(
    describeActivity({ source: "event", description: "A document was filed.", event_type: "document.filed", id: "e1" }, tActivity, tReceipt),
    "A document was filed.",
  );
  assert.equal(
    describeActivity({ source: "event", description: null, event_type: "document.filed", id: "e1" }, tActivity, tReceipt),
    "document.filed",
  );
  assert.equal(
    describeActivity({ source: "event", description: null, event_type: null, id: "e1" }, tActivity, tReceipt),
    "Unlabelled event",
  );
});

test("describeActivity: an agent_receipt LIST row re-derives its kind from the id; a DETAIL row's own receipt_kind field takes precedence", () => {
  const listRow = { source: "agent_receipt" as const, description: null, event_type: null, id: "freeform_read:42" };
  assert.equal(describeActivity(listRow, tActivity, tReceipt), "FirmActivity.receiptKinds.freeform_read");

  const detailRow = { ...listRow, id: "bogus:1", receipt_kind: "freeform_read" };
  assert.equal(
    describeActivity(detailRow, tActivity, tReceipt),
    "FirmActivity.receiptKinds.freeform_read",
    "the detail door's own receipt_kind field wins over re-deriving one from a (possibly stale) id",
  );
});

test("describeActivity: an operation_receipt row prefers `purpose` over `event_type`, with the journal_entry label", () => {
  const listRow = { source: "operation_receipt" as const, description: null, event_type: "journal_entry", id: "r1" };
  assert.equal(describeActivity(listRow, tActivity, tReceipt), "Activity.workPurposes.journal_entry");

  const detailRow = { ...listRow, event_type: null, purpose: "journal_entry" };
  assert.equal(describeActivity(detailRow, tActivity, tReceipt), "Activity.workPurposes.journal_entry");

  const unregistered = { source: "operation_receipt" as const, description: null, event_type: "some_future_purpose", id: "r2" };
  assert.equal(describeActivity(unregistered, tActivity, tReceipt), "some_future_purpose", "an unregistered purpose renders itself, not a guess");
});
