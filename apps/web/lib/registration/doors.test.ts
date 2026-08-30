// lib/registration/doors.ts — wire-shape pinning (P4-5 rung-6 battery).
// Mocked-fetch style ported from lib/firm/reads.test.ts's and
// lib/firm-admin/vendor-bindings.test.ts's own precedent: the property
// under test is that each wrapper names the right relation/rpc, select,
// filter/order or args, and that a governed refusal survives verbatim — not
// a re-derivation of getRows/callDoor's own already-tested CLR/status
// classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approveFirmRegistration,
  isOperatorConsoleEligible,
  loadOperatorRegistrationQueue,
  REGISTRATION_REQUESTS_RELATION,
  REGISTRATION_REQUESTS_SELECT,
  rejectFirmRegistration,
} from "./doors";
import {
  REGISTRATION_REQUESTS_RELATION as READS_RELATION,
  REGISTRATION_REQUESTS_SELECT as READS_SELECT,
} from "./reads";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

// doors.ts DUPLICATES these two constants rather than value-importing them
// from ./reads (that file's OTHER export pulls in next/headers, which
// breaks the webpack build for the "use client" component that imports
// doors.ts — see doors.ts's own header for the full account). This is the
// promised cross-check: Node can safely import ./reads directly (no
// bundler boundary here), so a drift between the two copies goes RED.
test("doors.ts's local REGISTRATION_REQUESTS_RELATION/SELECT stay byte-identical to reads.ts's own pin", () => {
  assert.equal(REGISTRATION_REQUESTS_RELATION, READS_RELATION);
  assert.equal(REGISTRATION_REQUESTS_SELECT, READS_SELECT);
});

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
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

type Seen = { url: string; body: Record<string, unknown> };

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; seen: { first(): Seen } } {
  const calls: Seen[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
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

test("loadOperatorRegistrationQueue: reads firm_registration_requests_visible, status=open, oldest first, UNFILTERED by applicant", async () => {
  let seenUrl = "";
  const row = {
    id: "r1", applicant: "a1", firm_name: "Acme Sdn Bhd", note: null, status: "open",
    decided_by: null, decided_at: null, reason: null, firm_id: null, created_at: "2026-08-01T00:00:00Z",
  };
  await withMockedFetch(
    async (url) => { seenUrl = String(url); return jsonResponse([row], 200); },
    async () => {
      const rows = await loadOperatorRegistrationQueue(fakeSession());
      assert.deepEqual(rows, [row]);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/firm_registration_requests_visible\?/);
  assert.match(seenUrl, /status=eq\.open/);
  assert.match(seenUrl, /order=created_at\.asc/);
  // The whole point of this read (doors.ts's own header): no `applicant=eq.`
  // filter — the view's own OPERATOR arm is what scopes the result.
  assert.doesNotMatch(seenUrl, /applicant=eq\./);
});

test("approveFirmRegistration posts to approve_firm_registration with p_request + a fresh op_key, and returns the RPC's own receipt verbatim", async () => {
  const receipt = { request_id: "r1", firm_id: "f1", plan_id: "p1" };
  const { impl, seen } = captureFetch(receipt);
  await withMockedFetch(impl, async () => {
    const out = await approveFirmRegistration(fakeSession(), "r1");
    assert.deepEqual(out, receipt);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/approve_firm_registration$/);
  assert.equal(s.body.p_request, "r1");
  assert.equal(typeof s.body.p_op_key, "string");
  assert.ok((s.body.p_op_key as string).length > 0);
});

test("rejectFirmRegistration posts p_request/p_reason + a fresh op_key to reject_firm_registration", async () => {
  const { impl, seen } = captureFetch({ request_id: "r1", status: "rejected" });
  await withMockedFetch(impl, async () => {
    const out = await rejectFirmRegistration(fakeSession(), "r1", "Duplicate of an existing client relationship.");
    assert.deepEqual(out, { request_id: "r1", status: "rejected" });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/reject_firm_registration$/);
  assert.equal(s.body.p_request, "r1");
  assert.equal(s.body.p_reason, "Duplicate of an existing client relationship.");
  assert.equal(typeof s.body.p_op_key, "string");
});

test("a governed refusal (CLR04, not owner+operator) survives verbatim through approveFirmRegistration", async () => {
  const { impl } = captureFetch({ code: "CLR04", message: "insufficient role" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => approveFirmRegistration(fakeSession(), "r1"),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR04");
        assert.equal((e as { message: string }).message, "insufficient role");
        return true;
      },
    );
  });
});

test("a governed refusal (CLR10, empty reason) survives verbatim through rejectFirmRegistration — the DB is the wall on content, not this wrapper", async () => {
  const { impl } = captureFetch({ code: "CLR10", message: "a rejection reason is required" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => rejectFirmRegistration(fakeSession(), "r1", ""),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR10");
        return true;
      },
    );
  });
});

test("a governed refusal (CLR09, request no longer open) survives verbatim through rejectFirmRegistration", async () => {
  const { impl } = captureFetch({ code: "CLR09", message: "this request is no longer open (status: approved)" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => rejectFirmRegistration(fakeSession(), "r1", "Too late."),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR09");
        return true;
      },
    );
  });
});

// --- isOperatorConsoleEligible — the client-side AFFORDANCE predicate,
// mirroring the DB's own `_human_ctx(role_rank('owner')) AND is_operator`
// conjunction (doors.ts's own header). Both halves matter independently. ---

test("isOperatorConsoleEligible: TRUE only for is_operator=true AND role_rank>=3 (owner)", () => {
  assert.equal(isOperatorConsoleEligible({ is_operator: true, role_rank: 3 }), true);
});

test("isOperatorConsoleEligible: FALSE for an owner-firm's owner who is NOT the operator firm", () => {
  assert.equal(isOperatorConsoleEligible({ is_operator: false, role_rank: 3 }), false);
});

test("isOperatorConsoleEligible: FALSE for an operator-firm admin (rank 2, below owner)", () => {
  assert.equal(isOperatorConsoleEligible({ is_operator: true, role_rank: 2 }), false);
});

test("isOperatorConsoleEligible: FALSE when role_rank is null (the DB's own coalesce(-1) case)", () => {
  assert.equal(isOperatorConsoleEligible({ is_operator: true, role_rank: null }), false);
});
