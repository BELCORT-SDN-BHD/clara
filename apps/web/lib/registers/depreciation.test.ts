import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getDepreciationAuthority,
  proposeDepreciationAuthority,
  signDepreciationAuthority,
  retireDepreciationAuthority,
  listDepreciationRuns,
  getDepreciationRun,
  runDepreciationManual,
  previewDepreciationRun,
  depreciationIntent,
  useDepreciationDecisionKey,
  faSkipListStartsOpen,
  FA_SKIP_REASONS,
  FA_BENIGN_SKIP_REASONS,
} from "./depreciation";
import { renderHook } from "../../test/hookHarness";
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

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("getDepreciationAuthority: posts p_client only, resolves the envelope verbatim (ramp_earned/fy_end never re-derived)", async () => {
  const envelope = { client_id: "c1", authority: null, ramp_earned: false, fy_end: { month: 12, day: 31, fallback: true }, high_stakes_threshold_cents: 500000 };
  const { impl, calls } = captureFetch(envelope);
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await getDepreciationAuthority(fakeSession("tok"), "c1");
  });
  assert.match(calls[0]!.url, /\/rpc\/get_depreciation_authority$/);
  assert.deepEqual(calls[0]!.body, { p_client: "c1" });
  assert.deepEqual(resolved, envelope);
});

test("proposeDepreciationAuthority: posts p_client + p_cadence with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ authority_id: "au1", client_id: "c1", cadence: "monthly", status: "proposed" });
  await withMockedFetch(impl, async () => {
    await proposeDepreciationAuthority(fakeSession("tok"), { clientId: "c1", cadence: "monthly" });
  });
  assert.match(calls[0]!.url, /\/rpc\/propose_depreciation_authority$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_cadence, "monthly");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("signDepreciationAuthority: posts p_client + p_authority + the REQUIRED instruction reference — no client-side role gate on this call", async () => {
  const { impl, calls } = captureFetch({ authority_id: "au1", status: "live" });
  await withMockedFetch(impl, async () => {
    await signDepreciationAuthority(fakeSession("tok"), {
      clientId: "c1", authorityId: "au1",
      authorityRef: { kind: "accounting_work", id: "w-1" },
    });
  });
  assert.match(calls[0]!.url, /\/rpc\/sign_depreciation_authority$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_authority, "au1");
  // #651 [0227] — the fourth argument. It is REQUIRED and the door RESOLVES it against
  // clara.accounting_work / clara.agent_tasks in the same firm AND client, so a signature can no
  // longer be a bare assertion of authority.
  assert.deepEqual(calls[0]!.body.p_authority_ref, { kind: "accounting_work", id: "w-1" });
});

test("retireDepreciationAuthority: posts p_reason alongside p_client/p_authority", async () => {
  const { impl, calls } = captureFetch({ authority_id: "au1", status: "retired" });
  await withMockedFetch(impl, async () => {
    await retireDepreciationAuthority(fakeSession("tok"), { clientId: "c1", authorityId: "au1", reason: "client switched vendor" });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_depreciation_authority$/);
  assert.equal(calls[0]!.body.p_reason, "client switched vendor");
});

test("listDepreciationRuns: posts p_client, unwraps the .runs array (never the raw envelope)", async () => {
  const runs = [{ id: "r1", authority_id: "au1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entries: 3, charged_cents: 12000, skipped: [], entry_id: "e1", created_at: "t" }];
  const { impl, calls } = captureFetch({ client_id: "c1", runs });
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await listDepreciationRuns(fakeSession("tok"), "c1");
  });
  assert.deepEqual(calls[0]!.body, { p_client: "c1" });
  assert.deepEqual(resolved, runs);
});

test("getDepreciationRun: posts p_run (NOT p_client — the live signature is per-run, singular), unwraps .run", async () => {
  const run = { id: "r1", authority_id: "au1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entries: 3, charged_cents: 12000, skipped: [], entry_id: "e1", created_at: "t" };
  const { impl, calls } = captureFetch({ run });
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await getDepreciationRun(fakeSession("tok"), "r1");
  });
  assert.match(calls[0]!.url, /\/rpc\/get_depreciation_run$/);
  assert.deepEqual(calls[0]!.body, { p_run: "r1" });
  assert.deepEqual(resolved, run);
});

test("runDepreciationManual: posts the exact cadence-window arguments with the CALLER'S op key", async () => {
  const { impl, calls } = captureFetch({ status: "posted", entry_id: "e1", charged_cents: 12000, entries: 3, skipped: [] });
  await withMockedFetch(impl, async () => {
    await runDepreciationManual(fakeSession("tok"), {
      clientId: "c1", periodStart: "2026-01-01", periodEnd: "2026-01-31", opKey: "decision-1",
    });
  });
  assert.match(calls[0]!.url, /\/rpc\/run_depreciation_manual$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_period_start, "2026-01-01");
  assert.equal(calls[0]!.body.p_period_end, "2026-01-31");
  // #651 — the key is the CALLER'S, and that is the whole fix: this wrapper used to mint
  // crypto.randomUUID() inside itself, so the retry a person makes after a lost response was a
  // DIFFERENT operation and the door answered it with a refusal instead of the original receipt.
  assert.equal(calls[0]!.body.p_op_key, "decision-1");
});

test("runDepreciationManual: a CLR38 not_cadence_aligned refusal surfaces verbatim as a DoorRefusal", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR38", message: "this client's monthly depreciation cadence runs 2026-01-01 .. 2026-01-31, not 2026-01-05 .. 2026-01-31", details: '{"reason":"period_request_invalid","axis":"not_cadence_aligned"}' },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(
        runDepreciationManual(fakeSession("tok"), { clientId: "c1", periodStart: "2026-01-05", periodEnd: "2026-01-31", opKey: "decision-2" }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});

// =================================================================================================
// #651 [0227] — THE PREVIEW READ, THE MEASURED SKIP VOCABULARY, AND ONE DECISION / ONE KEY.
// =================================================================================================

test("previewDepreciationRun: posts p_client alone and resolves the envelope VERBATIM — it names no period, because the period is the database's", async () => {
  const envelope = {
    client_id: "c1", due: true, period_start: "2026-07-01", period_end: "2026-07-31",
    cadence: "monthly", authority_from: "2026-03-01",
    charges: [{ asset_id: "a1", description: "Compressor", period_start: "2026-07-01", period_end: "2026-07-31", amount_cents: 7500 }],
    skipped: [{ asset_id: "a2", reason: "incomplete" }],
    legs: [
      { account_code: "6510", debit_cents: 7500, credit_cents: 0 },
      { account_code: "1519", debit_cents: 0, credit_cents: 7500 },
    ],
    charged_cents: 7500, entries: 1, mode_would_be: "draft", ramp_earned: false,
    skipped_closed: [{ period_start: "2026-06-01", period_end: "2026-06-30", fiscal_year_id: "fy1", fy_label: "2026", fy_status: "closed" }],
  };
  const { impl, calls } = captureFetch(envelope);
  let resolved: unknown = null;
  await withMockedFetch(impl, async () => {
    resolved = await previewDepreciationRun(fakeSession("tok"), "c1");
  });
  assert.match(calls[0]!.url, /\/rpc\/preview_depreciation_run$/);
  assert.deepEqual(calls[0]!.body, { p_client: "c1" },
    "ONE argument: a caller cannot name a period, and there is no op key because the read writes nothing");
  assert.deepEqual(resolved, envelope, "the envelope is reported verbatim, never re-shaped");
});

test("the skip vocabulary is the FIVE names measured off the live catalog, and the benign ones are the three that describe a settled fact", () => {
  assert.deepEqual([...FA_SKIP_REASONS].sort(),
    ["disposal_draft_outstanding", "fully_depreciated", "incomplete", "none_method", "not_in_service"],
    "four from clara._fa_asset_charges plus disposal_draft_outstanding, which clara._fa_compute_charges writes itself");
  assert.deepEqual([...FA_BENIGN_SKIP_REASONS].sort(),
    ["fully_depreciated", "none_method", "not_in_service"]);

  // Appendix D row 17: a collapsible may never hide an unresolved question by default.
  assert.equal(faSkipListStartsOpen([{ reason: "fully_depreciated" }, { reason: "none_method" }]), false,
    "a list of settled facts may collapse");
  assert.equal(faSkipListStartsOpen([{ reason: "fully_depreciated" }, { reason: "incomplete" }]), true,
    "…but one asset waiting on its particulars opens the whole list");
  assert.equal(faSkipListStartsOpen([{ reason: "disposal_draft_outstanding" }]), true,
    "…and so does a disposal draft somebody still has to approve or withdraw");
  assert.equal(faSkipListStartsOpen([{ reason: "some_sixth_reason" }]), true,
    "an UNKNOWN reason opens it too: a vocabulary that grew is not a reason to hide the row");
});

test("depreciationIntent is exactly the tuple clara._fa_run_period_core hashes into its own key", () => {
  assert.equal(depreciationIntent({ clientId: "c1", periodStart: "2026-07-01", periodEnd: "2026-07-31" }),
    "c1|2026-07-01|2026-07-31");
  assert.notEqual(
    depreciationIntent({ clientId: "c1", periodStart: "2026-07-01", periodEnd: "2026-07-31" }),
    depreciationIntent({ clientId: "c1", periodStart: "2026-08-01", periodEnd: "2026-08-31" }),
    "a different period is a different decision");
});

test("useDepreciationDecisionKey: ONE key per decision — stable across retries, renewed on a new decision", async () => {
  const h = await renderHook(() => useDepreciationDecisionKey());
  try {
    const intentA = depreciationIntent({ clientId: "c1", periodStart: "2026-07-01", periodEnd: "2026-07-31" });
    const first = h.current.key(intentA);
    // THE RETRY IS THE WHOLE POINT. A person whose response never arrived presses Confirm again;
    // with a fresh uuid that second press was a DIFFERENT operation and the door refused it
    // instead of handing back the receipt it had already earned.
    assert.equal(h.current.key(intentA), first, "a retry of the SAME decision reuses the key");
    assert.equal(h.current.key(intentA), first, "…however many times it is retried");

    const intentB = depreciationIntent({ clientId: "c1", periodStart: "2026-08-01", periodEnd: "2026-08-31" });
    const second = h.current.key(intentB);
    assert.notEqual(second, first, "a DIFFERENT intent is a different decision and mints its own key");

    // …and an explicit end (the dialog closed) renews it, because a run that was withdrawn and is
    // being made again must not be answered with the withdrawn run's receipt.
    h.current.renew();
    const third = h.current.key(intentB);
    assert.notEqual(third, second, "renew() ends the decision");
    assert.match(third, /^[0-9a-f-]{16,}$/i, "…and the key is still a real opaque identity");
  } finally {
    await h.unmount();
  }
});
