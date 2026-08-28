import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadAdjustmentTemplates,
  loadAdjustmentRuns,
  loadAdjustmentPairReversals,
  listAdjustmentRuns,
  adjustmentRunDue,
  proposeAdjustmentTemplate,
  signAdjustmentTemplate,
  retireAdjustmentTemplate,
  runAdjustmentManual,
  reverseAdjustmentPair,
  approvePairReversal,
  cancelPairReversal,
} from "./adjustments";
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

test("loadAdjustmentTemplates: reads adjustment_templates scoped by client_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadAdjustmentTemplates(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/adjustment_templates\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=start_date\.desc/);
});

test("loadAdjustmentRuns: reads adjustment_runs scoped by client_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadAdjustmentRuns(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/adjustment_runs\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=period_end\.desc/);
});

test("loadAdjustmentPairReversals: reads adjustment_pair_reversals scoped by client_id", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadAdjustmentPairReversals(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/adjustment_pair_reversals\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /order=created_at\.desc/);
});

test("listAdjustmentRuns: posts p_client, unwraps the .runs array (never the raw envelope)", async () => {
  const runs = [{ id: "r1", client_id: "c1", template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31", mode: "post", entry_id: "e1", reversal_entry_id: null, amount_cents: 5000, created_at: "t", correctable: true, active_pair_id: null, active_pair_status: null, correction_verb: "clara.reverse_adjustment_pair", correction_entry: "e1", correction_wall: null, correction_wall_advice: null }];
  const { impl, calls } = captureFetch({ client_id: "c1", runs });
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await listAdjustmentRuns(fakeSession("tok"), "c1");
  });
  assert.match(calls[0]!.url, /\/rpc\/list_adjustment_runs$/);
  assert.deepEqual(calls[0]!.body, { p_client: "c1" });
  assert.deepEqual(resolved, runs);
});

test("adjustmentRunDue: posts p_client only, resolves the envelope verbatim", async () => {
  const due = { due: true, template_id: "t1", period_start: "2026-01-01", period_end: "2026-01-31", blocked: [] };
  const { impl, calls } = captureFetch(due);
  let resolved: unknown;
  await withMockedFetch(impl, async () => {
    resolved = await adjustmentRunDue(fakeSession("tok"), "c1");
  });
  assert.match(calls[0]!.url, /\/rpc\/adjustment_run_due$/);
  assert.deepEqual(calls[0]!.body, { p_client: "c1" });
  assert.deepEqual(resolved, due);
});

test("proposeAdjustmentTemplate: posts every field with p_replaces/p_schedule null and a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ template_id: "tpl1", status: "proposed", content_hash: "h", warnings: [] });
  await withMockedFetch(impl, async () => {
    await proposeAdjustmentTemplate(fakeSession("tok"), {
      clientId: "c1",
      name: "Monthly rent accrual",
      cadence: "monthly",
      startDate: "2026-01-01",
      endDate: null,
      autoReverse: true,
      lines: [
        { account_code: "5100", debit_cents: 10000, credit_cents: 0 },
        { account_code: "2100", debit_cents: 0, credit_cents: 10000 },
      ],
      memoTemplate: "Rent accrual",
    });
  });
  assert.match(calls[0]!.url, /\/rpc\/propose_adjustment_template$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_name, "Monthly rent accrual");
  assert.equal(body.p_cadence, "monthly");
  assert.equal(body.p_start_date, "2026-01-01");
  assert.equal(body.p_end_date, null);
  assert.equal(body.p_auto_reverse, true);
  assert.equal((body.p_lines as unknown[]).length, 2);
  assert.equal(body.p_memo_template, "Rent accrual");
  assert.equal(typeof body.p_op_key, "string");
  assert.equal(body.p_replaces, null);
  assert.equal(body.p_schedule, null);
});

test("signAdjustmentTemplate: posts p_client + p_template with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ template_id: "tpl1", status: "live", warnings: [] });
  await withMockedFetch(impl, async () => {
    await signAdjustmentTemplate(fakeSession("tok"), "c1", "tpl1");
  });
  assert.match(calls[0]!.url, /\/rpc\/sign_adjustment_template$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_template, "tpl1");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("retireAdjustmentTemplate: posts p_reason alongside p_client/p_template", async () => {
  const { impl, calls } = captureFetch({ template_id: "tpl1", status: "retired" });
  await withMockedFetch(impl, async () => {
    await retireAdjustmentTemplate(fakeSession("tok"), "c1", "tpl1", "duplicated by a corrected template");
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_adjustment_template$/);
  assert.equal(calls[0]!.body.p_reason, "duplicated by a corrected template");
});

test("runAdjustmentManual: posts the exact period-window arguments with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ status: "posted", entry_id: "e1", amount_cents: 10000 });
  await withMockedFetch(impl, async () => {
    await runAdjustmentManual(fakeSession("tok"), "c1", "tpl1", "2026-01-01", "2026-01-31");
  });
  assert.match(calls[0]!.url, /\/rpc\/run_adjustment_manual$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_template, "tpl1");
  assert.equal(calls[0]!.body.p_period_start, "2026-01-01");
  assert.equal(calls[0]!.body.p_period_end, "2026-01-31");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("reverseAdjustmentPair: posts p_occurrence (the run's own entry_id) + p_reason", async () => {
  const { impl, calls } = captureFetch({ pair_id: "pr1", status: "pending" });
  await withMockedFetch(impl, async () => {
    await reverseAdjustmentPair(fakeSession("tok"), "c1", "e1", "wrong period charged");
  });
  assert.match(calls[0]!.url, /\/rpc\/reverse_adjustment_pair$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_occurrence, "e1");
  assert.equal(calls[0]!.body.p_reason, "wrong period charged");
});

test("approvePairReversal: posts p_client/p_pair/p_attestation with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ pair_id: "pr1", status: "completed" });
  await withMockedFetch(impl, async () => {
    await approvePairReversal(fakeSession("tok"), "c1", "pr1", "confirmed against the source document");
  });
  assert.match(calls[0]!.url, /\/rpc\/approve_pair_reversal$/);
  assert.equal(calls[0]!.body.p_client, "c1");
  assert.equal(calls[0]!.body.p_pair, "pr1");
  assert.equal(calls[0]!.body.p_attestation, "confirmed against the source document");
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("cancelPairReversal: posts p_reason alongside p_client/p_pair", async () => {
  const { impl, calls } = captureFetch({ pair_id: "pr1", status: "cancelled" });
  await withMockedFetch(impl, async () => {
    await cancelPairReversal(fakeSession("tok"), "c1", "pr1", "raised in error");
  });
  assert.match(calls[0]!.url, /\/rpc\/cancel_pair_reversal$/);
  assert.equal(calls[0]!.body.p_reason, "raised in error");
});

test("retireAdjustmentTemplate: a CLR38 occurrence_draft_outstanding refusal surfaces verbatim as a DoorRefusal", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR38", message: "an occurrence draft for this template is still outstanding; approve or withdraw it before retiring the template", details: '{"reason":"occurrence_draft_outstanding"}' },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(retireAdjustmentTemplate(fakeSession("tok"), "c1", "tpl1", "test"), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        return true;
      });
    },
  );
});
