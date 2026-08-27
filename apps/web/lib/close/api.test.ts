// lib/close/api.ts — argument-shape + refusal-passthrough tests. The wire
// mechanism itself (status-before-CLR, abort carve-out, malformed body) is already
// proven in doors.test.ts/wire.test.ts; this file proves each wrapper sends the
// EXACT function name + args ground in ./types.ts's header, and that a refusal
// (e.g. reopen's four CLR05 arms) survives verbatim through this thin layer.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listFiscalYears,
  getClosePlan,
  verifyClose,
  beginClose,
  finalizeClose,
  abandonClose,
  reopenFiscalYear,
  attestCloseException,
  isDoorRefusal,
} from "./api";
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

type Seen = { fn: string; body: Record<string, unknown> };

/** `seen.first()` asserts there was EXACTLY one fetch call before handing it back
 *  (never a silently-`undefined` index under `noUncheckedIndexedAccess`, and a
 *  real, loud failure if a wrapper ever calls fetch zero or more than once). */
function captureFetch(result: unknown, status = 200): { impl: typeof fetch; seen: { first(): Seen } } {
  const calls: Seen[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const fn = String(url).split("/rpc/")[1] ?? "";
    calls.push({ fn, body: JSON.parse(String(init?.body ?? "{}")) });
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

test("listFiscalYears posts to list_fiscal_years with p_client and returns the array", async () => {
  const rows = [{ fiscal_year_id: "f1", label: "FY2025" }];
  const { impl, seen } = captureFetch(rows);
  await withMockedFetch(impl, async () => {
    const out = await listFiscalYears("c1", { session: fakeSession() });
    assert.deepEqual(out, rows);
  });
  const s = seen.first();
  assert.equal(s.fn, "list_fiscal_years");
  assert.deepEqual(s.body, { p_client: "c1" });
});

test("listFiscalYears tolerates a non-array RPC result (never throws on a shape surprise)", async () => {
  const { impl } = captureFetch(null);
  await withMockedFetch(impl, async () => {
    const out = await listFiscalYears("c1", { session: fakeSession() });
    assert.deepEqual(out, []);
  });
});

test("getClosePlan posts p_fiscal_year_id and returns the parsed plan", async () => {
  const plan = {
    fiscal_year: { id: "fy1", client_id: "c1", label: "FY2025" },
    close_run: { state: "absent" },
    checks: [],
    receipt: { state: "absent" },
  };
  const { impl, seen } = captureFetch(plan);
  await withMockedFetch(impl, async () => {
    const out = await getClosePlan("fy1", { session: fakeSession() });
    assert.deepEqual(out, plan);
  });
  const s = seen.first();
  assert.equal(s.fn, "get_close_plan");
  assert.deepEqual(s.body, { p_fiscal_year_id: "fy1" });
});

test("getClosePlan resolves null on a malformed/unrecognised shape — never a half-rendered guess", async () => {
  const { impl } = captureFetch({ fiscal_year: { id: "fy1" } /* no client_id, no close_run, no checks */ });
  await withMockedFetch(impl, async () => {
    const out = await getClosePlan("fy1", { session: fakeSession() });
    assert.equal(out, null);
  });
});

test("verifyClose posts p_receipt and returns the verbatim jsonb", async () => {
  const result = { receipt_id: "r1", fiscal_year_id: "fy1", verified: true };
  const { impl, seen } = captureFetch(result);
  await withMockedFetch(impl, async () => {
    const out = await verifyClose("r1", { session: fakeSession() });
    assert.deepEqual(out, result);
  });
  const s = seen.first();
  assert.equal(s.fn, "verify_close");
  assert.deepEqual(s.body, { p_receipt: "r1" });
});

test("beginClose posts p_fy + a fresh op_key (UUID-shaped) to begin_close", async () => {
  const { impl, seen } = captureFetch({ close_run_id: "run1" });
  await withMockedFetch(impl, async () => {
    await beginClose("fy1", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "begin_close");
  assert.equal(s.body.p_fy, "fy1");
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("finalizeClose posts p_fy + p_self_attestation + op_key, never a segregation_mode argument", async () => {
  const { impl, seen } = captureFetch({ receipt_id: "r1" });
  await withMockedFetch(impl, async () => {
    await finalizeClose("fy1", "I attest this alone", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "finalize_close");
  assert.equal(s.body.p_fy, "fy1");
  assert.equal(s.body.p_self_attestation, "I attest this alone");
  assert.ok(!("segregation_mode" in s.body) && !("p_segregation_mode" in s.body));
});

test("abandonClose posts p_close_run + p_reason + op_key", async () => {
  const { impl, seen } = captureFetch({ state: "abandoned" });
  await withMockedFetch(impl, async () => {
    await abandonClose("run1", "wrong year selected", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "abandon_close");
  assert.deepEqual(
    { p_close_run: s.body.p_close_run, p_reason: s.body.p_reason },
    { p_close_run: "run1", p_reason: "wrong year selected" },
  );
});

test("reopenFiscalYear posts all five args, p_attestation defaulting null when omitted", async () => {
  const { impl, seen } = captureFetch({ fiscal_year_id: "fy1" });
  await withMockedFetch(impl, async () => {
    await reopenFiscalYear(
      { fiscalYearId: "fy1", reason: "correction needed", correctionTarget: { check_key: "ar_control_tie" } },
      { session: fakeSession() },
    );
  });
  const s = seen.first();
  assert.equal(s.fn, "reopen_fiscal_year");
  assert.equal(s.body.p_fy, "fy1");
  assert.equal(s.body.p_reason, "correction needed");
  assert.deepEqual(s.body.p_correction_target, { check_key: "ar_control_tie" });
  assert.equal(s.body.p_attestation, null);
});

test("reopenFiscalYear carries an explicit attestation through when supplied", async () => {
  const { impl, seen } = captureFetch({ fiscal_year_id: "fy1" });
  await withMockedFetch(impl, async () => {
    await reopenFiscalYear(
      {
        fiscalYearId: "fy1",
        reason: "the sole checker reverses their own close",
        correctionTarget: { entry_ids: ["e1"] },
        attestation: "I attest I am reversing my own close",
      },
      { session: fakeSession() },
    );
  });
  assert.equal(seen.first().body.p_attestation, "I attest I am reversing my own close");
});

test("reopenFiscalYear's CLR05 refusal (e.g. distinct_checker) surfaces as a DoorRefusal, verbatim", async () => {
  const impl = (async () =>
    jsonResponse(
      {
        code: "CLR05",
        message: "the reversal of a year-end close is high-stakes and needs a distinct checker",
        details: '{"reason":"distinct_checker"}',
      },
      400,
    )) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      reopenFiscalYear(
        { fiscalYearId: "fy1", reason: "reopen for correction", correctionTarget: { check_key: "x" } },
        { session: fakeSession() },
      ),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR05");
        assert.equal((e as import("./api").DoorRefusal).reason, "distinct_checker");
        return true;
      },
    );
  });
});

test("attestCloseException posts five args; p_from_proposal is never sent (defaults null on the DB side)", async () => {
  const { impl, seen } = captureFetch(null);
  await withMockedFetch(impl, async () => {
    await attestCloseException(
      { closeRunId: "run1", checkKey: "ar_control_tie", reason: "manually verified", itemKey: null },
      { session: fakeSession() },
    );
  });
  const s = seen.first();
  assert.equal(s.fn, "attest_close_exception");
  assert.deepEqual(
    { p_close_run: s.body.p_close_run, p_check_key: s.body.p_check_key, p_reason: s.body.p_reason, p_item_key: s.body.p_item_key },
    { p_close_run: "run1", p_check_key: "ar_control_tie", p_reason: "manually verified", p_item_key: null },
  );
  assert.ok(!("p_from_proposal" in s.body), "p_from_proposal must never be sent — no close_proposals carrier exists");
});
