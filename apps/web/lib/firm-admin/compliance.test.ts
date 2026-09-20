// lib/firm-admin/compliance.ts — wire-shape pinning (T10 rung-6 battery: "every
// train's own door-wrapper tests"). The wire mechanism itself is proven in
// doors.test.ts/read.test.ts; this file proves each wrapper sends the EXACT
// function name + args this module's own header grounds against the live rig
// census, that the compliance-register read validates its own envelope shape
// rather than trusting it, and that a refusal survives verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadComplianceRegister,
  ackComplianceWatch,
  snoozeComplianceWatch,
  resolveComplianceWatch,
  complianceWatchIdsFromRows,
  loadComplianceWatchIdsForClient,
  loadComplianceWatchDispositions,
  type ComplianceClientWatch,
} from "./compliance";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type { ReviewQueueRow } from "@/lib/firm/needs-you";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

type Seen = { url: string; body: Record<string, unknown> };

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; seen: { first(): Seen } } {
  const calls: Seen[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return {
    impl,
    seen: {
      first(): Seen {
        assert.equal(calls.length, 1, `expected exactly one fetch call, got ${calls.length}`);
        return calls[0] as Seen;
      },
    },
  };
}

const ENVELOPE_BASE = {
  watermark: "w1",
  counts: { ready: 0, needs_review: 0, needs_you: 0, open_drafts: 0, open_questions: 0, open_tasks: 0, compliance_watches: 0, lint_findings: 0 },
  sweep: { open_run: false, last_finalized_at: null, last_ack_at: null },
  rows: [],
  next_cursor: null,
};

test("loadComplianceRegister posts to list_review_queue with p_limit=1 and returns the compliance envelope's fields verbatim", async () => {
  const { impl, seen } = captureFetch({
    ...ENVELOPE_BASE,
    compliance: {
      stale_evaluator: false,
      clients: [
        {
          client_id: "c1", service_group: "digital_services", state: "crossed",
          confirmed_included_cents: 50000000, unknown_or_mixed_cents: 0, screening_proxy_cents: 0,
          earliest_crossing_month: "2026-07-01", application_due: "2026-08-28", future_method_status: "not_assessed",
        },
      ],
    },
  });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceRegister(fakeSession(), { client_id: "c1" });
    assert.equal(out.staleEvaluator, false);
    assert.equal(out.clients.length, 1);
    const [row] = out.clients;
    assert.ok(row);
    assert.equal(row.client_id, "c1");
    assert.equal(row.confirmed_included_cents, 50000000);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/list_review_queue$/);
  assert.deepEqual(s.body, { p_scope: { client_id: "c1" }, p_cursor: null, p_limit: 1 });
});

test("loadComplianceRegister throws (never silently empties) when the envelope carries no `compliance` object — absence is not evidence", async () => {
  const { impl } = captureFetch(ENVELOPE_BASE);
  await withMockedFetch(impl, async () => {
    await assert.rejects(() => loadComplianceRegister(fakeSession()), /malformed or absent/);
  });
});

test("loadComplianceRegister throws when a compliance.clients row does not match the expected shape", async () => {
  const { impl } = captureFetch({
    ...ENVELOPE_BASE,
    compliance: { stale_evaluator: true, clients: [{ client_id: "c1" /* service_group/state missing */ }] },
  });
  await withMockedFetch(impl, async () => {
    await assert.rejects(() => loadComplianceRegister(fakeSession()), /did not match the expected shape/);
  });
});

test("ackComplianceWatch posts to ack_compliance_watch with p_watch/p_rationale and a fresh op_key", async () => {
  const { impl, seen } = captureFetch({ watch_id: "w1", state: "crossed", acknowledged: true });
  await withMockedFetch(impl, async () => {
    await ackComplianceWatch(fakeSession(), "w1", "Registration filed with LHDN today.");
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/ack_compliance_watch$/);
  assert.equal(s.body.p_watch, "w1");
  assert.equal(s.body.p_rationale, "Registration filed with LHDN today.");
  assert.equal(typeof s.body.p_op_key, "string");
  assert.ok((s.body.p_op_key as string).length > 0);
});

test("snoozeComplianceWatch posts to snooze_compliance_watch with p_watch/p_until/p_rationale", async () => {
  const { impl, seen } = captureFetch({ watch_id: "w1", snoozed_until: "2026-09-15T00:00:00Z" });
  await withMockedFetch(impl, async () => {
    await snoozeComplianceWatch(fakeSession(), "w1", "2026-09-15T00:00:00Z", "Waiting on the client's bank statement.");
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/snooze_compliance_watch$/);
  assert.equal(s.body.p_watch, "w1");
  assert.equal(s.body.p_until, "2026-09-15T00:00:00Z");
  assert.equal(s.body.p_rationale, "Waiting on the client's bank statement.");
});

test("resolveComplianceWatch posts to resolve_compliance_watch with p_watch/p_conclusion/p_evidence", async () => {
  const { impl, seen } = captureFetch({ watch_id: "w1", state: "resolved", conclusion: "registration_recorded" });
  await withMockedFetch(impl, async () => {
    await resolveComplianceWatch(fakeSession(), "w1", "registration_recorded", "SST reg no. filed, receipt attached.");
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/resolve_compliance_watch$/);
  assert.equal(s.body.p_watch, "w1");
  assert.equal(s.body.p_conclusion, "registration_recorded");
  assert.equal(s.body.p_evidence, "SST reg no. filed, receipt attached.");
});

test("a governed refusal (CLR04, the admin-only not_liable_documented conclusion) survives verbatim through resolveComplianceWatch", async () => {
  const { impl } = captureFetch({ code: "CLR04", message: "a not-liable resolution requires admin" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => resolveComplianceWatch(fakeSession(), "w1", "not_liable_documented", "Below threshold, documented analysis attached."),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR04");
        assert.match((e as { message: string }).message, /requires admin/);
        return true;
      },
    );
  });
});

// ===========================================================================
// #996 — the register's own disposition read: `compliance.clients` deliberately
// carries no watch id (this module's own header); `complianceWatchIdsFromRows`
// is the pure extraction of THAT id from `list_review_queue`'s own
// `row_kind==='compliance_watch'` rows, which the same door already returns.
// ===========================================================================

function makeRow(overrides: Partial<ReviewQueueRow>): ReviewQueueRow {
  return {
    row_kind: "compliance_watch",
    section: "needs_review",
    client_id: "c1",
    counterparty_id: null,
    filing_id: null,
    entry_id: null,
    question_id: null,
    task_id: null,
    document_id: null,
    lane: null,
    auto: false,
    rule_backed: false,
    high_stakes: false,
    aged_since: "2026-07-01T00:00:00Z",
    amount_cents: null,
    period: "2026-07-31",
    question_text: "SST registration threshold watch (digital_services)",
    created_at: "2026-07-01T00:00:00Z",
    id: "w1",
    coding_kind: null,
    watch_id: "w1",
    tier: "crossed",
    finding_id: null,
    asset_id: null,
    advance_id: null,
    client_name: null,
    batch_ids: null,
    open_proposal_count: null,
    ...overrides,
  };
}

test("complianceWatchIdsFromRows: a compliance_watch row's watch_id is extracted; every other row_kind is ignored", () => {
  const rows = [
    makeRow({ row_kind: "draft", watch_id: null, id: "e1" }),
    makeRow({ row_kind: "compliance_watch", watch_id: "w1", id: "w1" }),
    makeRow({ row_kind: "compliance_watch", watch_id: "w2", id: "w2", client_id: "c2" }),
  ];
  assert.deepEqual(complianceWatchIdsFromRows(rows), ["w1", "w2"]);
});

test("complianceWatchIdsFromRows: no compliance_watch rows yields an empty list, not an error", () => {
  assert.deepEqual(complianceWatchIdsFromRows([makeRow({ row_kind: "open_question", watch_id: null })]), []);
});

test("loadComplianceWatchIdsForClient posts to list_review_queue scoped to the client with p_limit=500", async () => {
  const { impl, seen } = captureFetch({
    ...ENVELOPE_BASE,
    rows: [makeRow({ watch_id: "w1", id: "w1" }), makeRow({ row_kind: "draft", watch_id: null, id: "e1" })],
  });
  await withMockedFetch(impl, async () => {
    const ids = await loadComplianceWatchIdsForClient(fakeSession(), "c1");
    assert.deepEqual(ids, ["w1"]);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/list_review_queue$/);
  assert.deepEqual(s.body, { p_scope: { client_id: "c1" }, p_cursor: null, p_limit: 500 });
});

// ===========================================================================
// loadComplianceWatchDispositions — folding both doors into one lookup keyed
// exactly the way ComplianceClientWatch rows are keyed (client_id + service_group).
// ===========================================================================

function watchRow(clientId: string, watchId: string): ReviewQueueRow {
  return makeRow({ client_id: clientId, watch_id: watchId, id: watchId });
}

function acknowledgedDisposition(clientId: string, watchId: string, serviceGroup: string) {
  return {
    watch_id: watchId, client_id: clientId, service_group: serviceGroup, watch_kind: "sst_registration", state: "crossed",
    acknowledged_by: "u1", acknowledged_at: "2026-09-18T00:00:00Z", snoozed_until: null,
    resolved_conclusion: null, resolved_by: null, resolved_at: null, resolved_evidence: null,
    updated_at: "2026-09-18T00:00:00Z",
    events: [
      { event_kind: "created", state_before: null, state_after: "monitored", actor: null, rationale: null, created_at: "2026-07-01T00:00:00Z" },
      { event_kind: "acknowledged", state_before: "crossed", state_after: "crossed", actor: "u1", rationale: "Registration in progress.", created_at: "2026-09-18T00:00:00Z" },
    ],
  };
}

function unacknowledgedDisposition(clientId: string, watchId: string, serviceGroup: string) {
  return {
    ...acknowledgedDisposition(clientId, watchId, serviceGroup),
    acknowledged_by: null,
    acknowledged_at: null,
    events: [{ event_kind: "created", state_before: null, state_after: "monitored", actor: null, rationale: null, created_at: "2026-07-01T00:00:00Z" }],
  };
}

function clientWatch(overrides: Partial<ComplianceClientWatch>): ComplianceClientWatch {
  return {
    client_id: "c1",
    service_group: "digital_services",
    state: "crossed",
    confirmed_included_cents: 0,
    unknown_or_mixed_cents: 0,
    screening_proxy_cents: 0,
    earliest_crossing_month: null,
    application_due: null,
    future_method_status: null,
    ...overrides,
  };
}

function mockDispositionFetch(opts: {
  queueRowsByClient: Record<string, ReviewQueueRow[]>;
  dispositionsByWatch: Record<string, unknown | { code: string; message: string; status?: number }>;
}) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    calls.push({ url: u, body });
    if (u.includes("/rpc/list_review_queue")) {
      const scope = body.p_scope as { client_id?: string } | undefined;
      const rows = opts.queueRowsByClient[scope?.client_id ?? ""] ?? [];
      return jsonResponse({ ...ENVELOPE_BASE, rows }, 200);
    }
    if (u.includes("/rpc/get_compliance_watch_disposition")) {
      const watchId = body.p_watch as string;
      const answer = opts.dispositionsByWatch[watchId];
      if (answer && typeof answer === "object" && "code" in (answer as Record<string, unknown>) && "message" in (answer as Record<string, unknown>)) {
        const a = answer as { code: string; message: string; status?: number };
        return jsonResponse({ code: a.code, message: a.message }, a.status ?? 400);
      }
      return jsonResponse(answer, 200);
    }
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return { impl, calls };
}

test("loadComplianceWatchDispositions: a resolvable watch with a recorded act is keyed by client_id:service_group", async () => {
  const clients = [clientWatch({})];
  const { impl } = mockDispositionFetch({
    queueRowsByClient: { c1: [watchRow("c1", "w1")] },
    dispositionsByWatch: { w1: acknowledgedDisposition("c1", "w1", "digital_services") },
  });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceWatchDispositions(fakeSession(), clients);
    assert.equal(out.flooredBelowBookkeeper, false);
    const d = out.byKey.get("c1:digital_services");
    assert.ok(d, "the disposition must be keyed exactly as the aggregate row is");
    assert.equal(d.watchId, "w1");
    assert.equal(d.acknowledgedBy, "u1");
  });
});

test("loadComplianceWatchDispositions: a watch id the scoped queue read never returns leaves the row absent from byKey", async () => {
  const clients = [clientWatch({})];
  const { impl } = mockDispositionFetch({ queueRowsByClient: {}, dispositionsByWatch: {} });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceWatchDispositions(fakeSession(), clients);
    assert.equal(out.byKey.size, 0);
    assert.equal(out.flooredBelowBookkeeper, false);
  });
});

test("loadComplianceWatchDispositions: a resolvable watch with nothing recorded yet (only the evaluator's own `created` row) leaves the row absent from byKey", async () => {
  const clients = [clientWatch({})];
  const { impl } = mockDispositionFetch({
    queueRowsByClient: { c1: [watchRow("c1", "w1")] },
    dispositionsByWatch: { w1: unacknowledgedDisposition("c1", "w1", "digital_services") },
  });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceWatchDispositions(fakeSession(), clients);
    assert.equal(out.byKey.has("c1:digital_services"), false);
    assert.equal(out.flooredBelowBookkeeper, false);
  });
});

test("loadComplianceWatchDispositions: a CLR04 refusal (below the bookkeeper floor) is named ONCE, and adds nothing to byKey", async () => {
  const clients = [clientWatch({})];
  const { impl } = mockDispositionFetch({
    queueRowsByClient: { c1: [watchRow("c1", "w1")] },
    dispositionsByWatch: { w1: { code: "CLR04", message: "insufficient role" } },
  });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceWatchDispositions(fakeSession(), clients);
    assert.equal(out.flooredBelowBookkeeper, true);
    assert.equal(out.byKey.size, 0);
  });
});

test("loadComplianceWatchDispositions: a non-floor refusal (CLR11 watch not found) never sets flooredBelowBookkeeper", async () => {
  const clients = [clientWatch({})];
  const { impl } = mockDispositionFetch({
    queueRowsByClient: { c1: [watchRow("c1", "w1")] },
    dispositionsByWatch: { w1: { code: "CLR11", message: "watch not found" } },
  });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceWatchDispositions(fakeSession(), clients);
    assert.equal(out.flooredBelowBookkeeper, false);
    assert.equal(out.byKey.size, 0);
  });
});

test("loadComplianceWatchDispositions: two clients with two service groups each resolve independently", async () => {
  const clients = [
    clientWatch({ client_id: "c1", service_group: "G" }),
    clientWatch({ client_id: "c1", service_group: "I" }),
    clientWatch({ client_id: "c2", service_group: "G" }),
  ];
  const { impl } = mockDispositionFetch({
    queueRowsByClient: {
      c1: [watchRow("c1", "w1"), watchRow("c1", "w2")],
      c2: [watchRow("c2", "w3")],
    },
    dispositionsByWatch: {
      w1: acknowledgedDisposition("c1", "w1", "G"),
      w2: unacknowledgedDisposition("c1", "w2", "I"),
      w3: acknowledgedDisposition("c2", "w3", "G"),
    },
  });
  await withMockedFetch(impl, async () => {
    const out = await loadComplianceWatchDispositions(fakeSession(), clients);
    assert.ok(out.byKey.has("c1:G"));
    assert.ok(!out.byKey.has("c1:I"), "unacknowledged stays absent even alongside an acknowledged sibling");
    assert.ok(out.byKey.has("c2:G"));
    assert.equal(out.flooredBelowBookkeeper, false);
  });
});
