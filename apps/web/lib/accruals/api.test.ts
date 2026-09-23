// #938 — the two remedy wrappers this ticket adds to lib/accruals/api.ts
// (reverseAccrualNow / skipNextAccrualOccurrence) and the pure date mirror
// (accrualReversalDate) they share. Mocked-fetch style ported from
// lib/firm/needs-you.test.ts's own precedent: the property under test is that
// each wrapper posts the right RPC name/args, not a re-derivation of callDoor's
// already-tested CLR/refusal classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import { accrualReversalDate, reverseAccrualNow, skipNextAccrualOccurrence } from "./api";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

// ── accrualReversalDate — the pure mirror of clara._plan_reversal_date (0193:837) ─────────────

test("accrualReversalDate: the first day of the month AFTER due's", () => {
  assert.equal(accrualReversalDate("2026-01-31"), "2026-02-01");
  assert.equal(accrualReversalDate("2026-01-01"), "2026-02-01");
});

test("accrualReversalDate: December rolls into January of the NEXT year", () => {
  assert.equal(accrualReversalDate("2026-12-31"), "2027-01-01");
});

test("accrualReversalDate: a short (28-day) February still rolls to March 1st", () => {
  assert.equal(accrualReversalDate("2026-02-28"), "2026-03-01");
});

// ── reverseAccrualNow — clara.request_plan_catch_up, the EXISTING door, never a new one ───────

test("reverseAccrualNow: POSTs request_plan_catch_up with p_from=dueDate, p_to=the reversal date, a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: { p_plan?: string; p_from?: string; p_to?: string; p_op_key?: string } = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ plan_id: "plan-1", admitted: 1 }, 200);
    },
    async () => {
      await reverseAccrualNow("plan-1", "2026-01-31", { session: fakeSession("tok") });
    },
  );
  assert.match(seenUrl, /\/rpc\/request_plan_catch_up$/);
  assert.equal(seenBody.p_plan, "plan-1");
  assert.equal(seenBody.p_from, "2026-01-31", "the window starts at the flagged occurrence's own due date");
  assert.equal(seenBody.p_to, "2026-02-01", "the window ends at the scheduled reversal date, never earlier");
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
});

// ── skipNextAccrualOccurrence — clara.skip_plan_occurrence, #938's own new door ────────────────

test("skipNextAccrualOccurrence: POSTs skip_plan_occurrence with p_plan/p_after_due/p_reason and a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: { p_plan?: string; p_after_due?: string; p_reason?: string; p_op_key?: string } = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ plan_id: "plan-1", due_date: "2026-02-28", skipped: true }, 200);
    },
    async () => {
      await skipNextAccrualOccurrence("plan-1", "2026-01-31", "vendor now bills directly", {
        session: fakeSession("tok"),
      });
    },
  );
  assert.match(seenUrl, /\/rpc\/skip_plan_occurrence$/);
  assert.equal(seenBody.p_plan, "plan-1");
  assert.equal(seenBody.p_after_due, "2026-01-31");
  assert.equal(seenBody.p_reason, "vendor now bills directly");
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
});
