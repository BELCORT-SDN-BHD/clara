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
  setClientFyEnd,
  proposeFiscalYear,
  openFiscalYear,
  getCloseReadiness,
  recordFutureAttestation,
  holdClosePrep,
  releaseClosePrep,
  listAgentActReceipts,
  settleCloseProposal,
  getClientFyEnd,
  getCloseGateCatalog,
  listCloseProposalsForRun,
  getLiveClosePrepHold,
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

// ---------------------------------------------------------------------------
// T1 (port-wave, 2026-08-29) — rung-0-census-pinned wire shapes for the nine
// doors this train builds. Every verb name and every arg name below is
// pinned against the LIVE pg_get_functiondef read at this train's own rung-0
// (see the file-header block above ./api.ts's re-export line).

test("setClientFyEnd posts p_client + p_month + p_day + a fresh op_key to set_client_fy_end", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", fy_end_month: 6, fy_end_day: 30 });
  await withMockedFetch(impl, async () => {
    await setClientFyEnd("c1", 6, 30, { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "set_client_fy_end");
  assert.deepEqual({ p_client: s.body.p_client, p_month: s.body.p_month, p_day: s.body.p_day }, { p_client: "c1", p_month: 6, p_day: 30 });
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("proposeFiscalYear posts p_client + p_starts_on to propose_fiscal_year and returns the DB's own preview verbatim", async () => {
  const preview = { starts_on: "2026-01-01", ends_on: "2026-12-31", fy_end: { month: 12, day: 31, fallback: true } };
  const { impl, seen } = captureFetch(preview);
  await withMockedFetch(impl, async () => {
    const out = await proposeFiscalYear("c1", "2026-01-01", { session: fakeSession() });
    assert.deepEqual(out, preview);
  });
  const s = seen.first();
  assert.equal(s.fn, "propose_fiscal_year");
  assert.deepEqual(s.body, { p_client: "c1", p_starts_on: "2026-01-01" });
});

test("openFiscalYear posts all six args + a fresh op_key to open_fiscal_year, p_length_reason null when omitted", async () => {
  const { impl, seen } = captureFetch({ fiscal_year_id: "fy1" });
  await withMockedFetch(impl, async () => {
    await openFiscalYear(
      { clientId: "c1", label: "FY2026", startsOn: "2026-01-01", endsOn: "2026-12-31", lengthReason: null },
      { session: fakeSession() },
    );
  });
  const s = seen.first();
  assert.equal(s.fn, "open_fiscal_year");
  assert.deepEqual(
    { p_client: s.body.p_client, p_label: s.body.p_label, p_starts_on: s.body.p_starts_on, p_ends_on: s.body.p_ends_on, p_length_reason: s.body.p_length_reason },
    { p_client: "c1", p_label: "FY2026", p_starts_on: "2026-01-01", p_ends_on: "2026-12-31", p_length_reason: null },
  );
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("openFiscalYear's CLR10 fy_length_reason_required refusal surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse({ code: "CLR10", message: "a fiscal year spanning ~14 months needs its length_reason stated", details: '{"reason":"fy_length_reason_required"}' }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      openFiscalYear({ clientId: "c1", label: "FY2026", startsOn: "2025-01-01", endsOn: "2026-12-31", lengthReason: null }, { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR10");
        assert.equal((e as import("./api").DoorRefusal).reason, "fy_length_reason_required");
        return true;
      },
    );
  });
});

test("getCloseReadiness posts p_client + p_fy to get_close_readiness and returns the verbatim jsonb", async () => {
  const readiness = { fiscal_year_id: "fy1", close_run_id: null, run_state: null, fy_end_source: null, gates: [] };
  const { impl, seen } = captureFetch(readiness);
  await withMockedFetch(impl, async () => {
    const out = await getCloseReadiness("c1", "fy1", { session: fakeSession() });
    assert.deepEqual(out, readiness);
  });
  const s = seen.first();
  assert.equal(s.fn, "get_close_readiness");
  assert.deepEqual(s.body, { p_client: "c1", p_fy: "fy1" });
});

test("recordFutureAttestation posts all six args + a fresh op_key to record_future_attestation", async () => {
  const { impl, seen } = captureFetch({ id: "a1", expires_at: "2027-01-01" });
  await withMockedFetch(impl, async () => {
    await recordFutureAttestation(
      { clientId: "c1", serviceGroup: "G", expectedCents: 10000, horizonStart: "2026-01-01", evidence: "signed mandate", expiresAt: "2027-01-01" },
      { session: fakeSession() },
    );
  });
  const s = seen.first();
  assert.equal(s.fn, "record_future_attestation");
  assert.deepEqual(
    {
      p_client: s.body.p_client,
      p_service_group: s.body.p_service_group,
      p_expected_cents: s.body.p_expected_cents,
      p_horizon_start: s.body.p_horizon_start,
      p_evidence: s.body.p_evidence,
      p_expires_at: s.body.p_expires_at,
    },
    { p_client: "c1", p_service_group: "G", p_expected_cents: 10000, p_horizon_start: "2026-01-01", p_evidence: "signed mandate", p_expires_at: "2027-01-01" },
  );
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("recordFutureAttestation's CLR03 agent-identity refusal surfaces verbatim", async () => {
  const impl = (async () => jsonResponse({ code: "CLR03", message: "agent identity cannot attest the future method" }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      recordFutureAttestation(
        { clientId: "c1", serviceGroup: "G", expectedCents: 1, horizonStart: "2026-01-01", evidence: "x", expiresAt: "2027-01-01" },
        { session: fakeSession() },
      ),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR03");
        return true;
      },
    );
  });
});

test("holdClosePrep posts p_client + p_reason + a fresh op_key to hold_close_prep", async () => {
  const { impl, seen } = captureFetch({ hold_id: "h1", held: true });
  await withMockedFetch(impl, async () => {
    await holdClosePrep("c1", "awaiting a client document", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "hold_close_prep");
  assert.deepEqual({ p_client: s.body.p_client, p_reason: s.body.p_reason }, { p_client: "c1", p_reason: "awaiting a client document" });
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("releaseClosePrep posts p_client + p_reason + a fresh op_key to release_close_prep", async () => {
  const { impl, seen } = captureFetch({ hold_id: "h1", held: false });
  await withMockedFetch(impl, async () => {
    await releaseClosePrep("c1", "document received", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "release_close_prep");
  assert.deepEqual({ p_client: s.body.p_client, p_reason: s.body.p_reason }, { p_client: "c1", p_reason: "document received" });
});

test("releaseClosePrep's CLR10 close_prep_hold_absent refusal surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse({ code: "CLR10", message: "no live close-prep hold stands for this client", details: '{"reason":"close_prep_hold_absent"}' }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(releaseClosePrep("c1", "x", { session: fakeSession() }), (e: unknown) => {
      assert.ok(isDoorRefusal(e));
      assert.equal((e as import("./api").DoorRefusal).reason, "close_prep_hold_absent");
      return true;
    });
  });
});

test("listAgentActReceipts posts p_client + p_since (null when omitted) to list_agent_act_receipts, tolerates a non-array result", async () => {
  const { impl: impl1, seen } = captureFetch([{ receipt_id: "r1" }]);
  await withMockedFetch(impl1, async () => {
    const out = await listAgentActReceipts("c1", null, { session: fakeSession() });
    assert.deepEqual(out, [{ receipt_id: "r1" }]);
  });
  const s = seen.first();
  assert.equal(s.fn, "list_agent_act_receipts");
  assert.deepEqual(s.body, { p_client: "c1", p_since: null });

  const { impl: impl2 } = captureFetch(null);
  await withMockedFetch(impl2, async () => {
    const out = await listAgentActReceipts("c1", null, { session: fakeSession() });
    assert.deepEqual(out, []);
  });
});

test("settleCloseProposal posts p_proposal + p_state + p_reason + a fresh op_key to settle_close_proposal", async () => {
  const { impl, seen } = captureFetch({ proposal_id: "p1", state: "adopted" });
  await withMockedFetch(impl, async () => {
    await settleCloseProposal("p1", "adopted", null, { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "settle_close_proposal");
  assert.deepEqual({ p_proposal: s.body.p_proposal, p_state: s.body.p_state, p_reason: s.body.p_reason }, { p_proposal: "p1", p_state: "adopted", p_reason: null });
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("settleCloseProposal's CLR41 close_proposal_already_settled refusal surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse({ code: "CLR41", message: "close proposal p1 is already withdrawn; a settled proposal is terminal", details: '{"reason":"close_proposal_already_settled","state":"withdrawn"}' }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(settleCloseProposal("p1", "adopted", null, { session: fakeSession() }), (e: unknown) => {
      assert.ok(isDoorRefusal(e));
      assert.equal((e as import("./api").DoorRefusal).code, "CLR41");
      return true;
    });
  });
});

test("getClientFyEnd GETs clients filtered to id=eq, selecting fy_end_month/fy_end_day; null when RLS admits no row", async () => {
  let seenUrl = "";
  const { impl } = ((): { impl: typeof fetch } => ({
    impl: (async (u: RequestInfo | URL) => {
      seenUrl = String(u);
      return jsonResponse([{ id: "c1", name: "ROME PROPERTIES", fy_end_month: 6, fy_end_day: 30 }], 200);
    }) as typeof fetch,
  }))();
  await withMockedFetch(impl, async () => {
    const out = await getClientFyEnd("c1", { session: fakeSession() });
    assert.deepEqual(out, { id: "c1", name: "ROME PROPERTIES", fy_end_month: 6, fy_end_day: 30 });
  });
  assert.match(seenUrl, /\/rest\/v1\/clients\?/);
  assert.match(seenUrl, /id=eq\.c1/);
  assert.match(seenUrl, /select=id%2Cname%2Cfy_end_month%2Cfy_end_day/);

  const emptyImpl = (async () => jsonResponse([], 200)) as typeof fetch;
  await withMockedFetch(emptyImpl, async () => {
    const out = await getClientFyEnd("c1", { session: fakeSession() });
    assert.equal(out, null);
  });
});

test("getCloseGateCatalog GETs close_gate_checks ordered drawer,check_key", async () => {
  let seenUrl = "";
  const impl = (async (u: RequestInfo | URL) => {
    seenUrl = String(u);
    return jsonResponse([{ check_key: "ar_control_tie", drawer: 1, title: "AR control tie", applies_when: "always" }], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await getCloseGateCatalog({ session: fakeSession() });
  });
  assert.match(seenUrl, /\/rest\/v1\/close_gate_checks\?/);
  assert.match(seenUrl, /order=drawer\.asc%2Ccheck_key\.asc/);
});

test("listCloseProposalsForRun GETs close_proposals filtered to close_run_id=eq, ordered created_at desc, limit 5", async () => {
  let seenUrl = "";
  const impl = (async (u: RequestInfo | URL) => {
    seenUrl = String(u);
    return jsonResponse([], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await listCloseProposalsForRun("run1", { session: fakeSession() });
  });
  assert.match(seenUrl, /\/rest\/v1\/close_proposals\?/);
  assert.match(seenUrl, /close_run_id=eq\.run1/);
  assert.match(seenUrl, /order=created_at\.desc/);
  assert.match(seenUrl, /limit=5/);
});

test("getLiveClosePrepHold GETs close_prep_holds filtered to client_id=eq + purpose=eq.close_prep + released_at=is.null", async () => {
  let seenUrl = "";
  const impl = (async (u: RequestInfo | URL) => {
    seenUrl = String(u);
    return jsonResponse([], 200);
  }) as typeof fetch;
  await withMockedFetch(impl, async () => {
    const out = await getLiveClosePrepHold("c1", { session: fakeSession() });
    assert.equal(out, null);
  });
  assert.match(seenUrl, /\/rest\/v1\/close_prep_holds\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /purpose=eq\.close_prep/);
  assert.match(seenUrl, /released_at=is\.null/);
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
  assert.ok(
    !("p_from_proposal" in s.body),
    "p_from_proposal must never be sent from THIS wrapper — the carrier and its doors are live (0138), and CloseProposalPanel.tsx now reads it; there is no per-gate 'attest from this proposal' affordance wired into attestCloseException's own call sites yet",
  );
});
