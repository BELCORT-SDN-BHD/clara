// lib/bank/payroll-settlement-reads.ts — the #947 payroll net-pay settlement READ (transport via
// callDoor). Pins wire shape only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getPayrollSettlementCandidates } from "./payroll-settlement-reads";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}
function jsonResponse(body: unknown, status = 200): Response {
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

test("getPayrollSettlementCandidates: posts p_client and maps rows, candidates included", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([
        {
          entry_id: "e1", document_id: "d1", filing_id: "f1", posting_date: "2026-08-31",
          period_month: "2026-08-01", net_pay_cents: 425570, unsettled_cents: 425570,
          candidates: [
            { line_id: "l1", statement_id: "s1", bank_account_id: "b1", bank_account_display: "Maybank 1234",
              entry_date: "2026-09-02", value_date: "2026-09-02", description: "SALARY GIRO",
              amount_cents: -425570, date_delta_days: 2, class_hint: "payroll" },
          ],
        },
      ]);
    },
    async () => {
      const rows = await getPayrollSettlementCandidates("c1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/get_payroll_settlement_candidates"));
      assert.deepEqual(seenBody, { p_client: "c1" });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.entry_id, "e1");
      assert.equal(rows[0]?.unsettled_cents, 425570);
      assert.equal(rows[0]?.candidates.length, 1);
      assert.equal(rows[0]?.candidates[0]?.amount_cents, -425570);
      assert.equal(rows[0]?.candidates[0]?.class_hint, "payroll");
    },
  );
});

test("getPayrollSettlementCandidates: an empty array reads as no unsettled runs, never null/undefined", async () => {
  await withMockedFetch(
    async () => jsonResponse([]),
    async () => {
      const rows = await getPayrollSettlementCandidates("c1", { session: fakeSession("tok") });
      assert.deepEqual(rows, []);
    },
  );
});

test("getPayrollSettlementCandidates: a run with no candidate line reads candidates as an empty array, never a guess", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ entry_id: "e1", net_pay_cents: 100, unsettled_cents: 100, candidates: [] }]),
    async () => {
      const rows = await getPayrollSettlementCandidates("c1", { session: fakeSession("tok") });
      assert.deepEqual(rows[0]?.candidates, []);
    },
  );
});
