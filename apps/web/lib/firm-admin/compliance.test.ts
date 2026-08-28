// lib/firm-admin/compliance.ts — wire-shape pinning (T10 rung-6 battery: "every
// train's own door-wrapper tests"). The wire mechanism itself is proven in
// doors.test.ts/read.test.ts; this file proves each wrapper sends the EXACT
// function name + args this module's own header grounds against the live rig
// census, that the compliance-register read validates its own envelope shape
// rather than trusting it, and that a refusal survives verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadComplianceRegister, ackComplianceWatch, snoozeComplianceWatch, resolveComplianceWatch } from "./compliance";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

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
