// lib/bank/rent-settlement-reads.ts — #949's two tenancy READS (transport via callDoor).
// Pins wire shape only: the door name, the argument name, and what an absent or renamed key
// degrades to. Mocks ONE thing, `fetch`, which is a real system boundary (PostgREST).

import { test } from "node:test";
import assert from "node:assert/strict";
import { getRentSettlementCandidates, getTenancyDepositCoding } from "./rent-settlement-reads";
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

test("getRentSettlementCandidates: posts p_client and maps the month, its window and its candidates", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([
        {
          entry_id: "e1", plan_id: "p1", document_id: "d1", filing_id: "f1",
          posting_date: "2026-02-05", period_month: "2026-02-01",
          payable_account_code: "2050", rent_cents: 360000, unsettled_cents: 360000,
          candidate_window_days: 35,
          candidates: [
            {
              line_id: "l1", statement_id: "s1", bank_account_id: "b1",
              bank_account_display: "Maybank 1234", entry_date: "2026-02-25",
              value_date: "2026-02-25", description: "RENTAL PAYMENT",
              amount_cents: -360000, date_delta_days: 20, class_hint: "rent",
            },
          ],
        },
      ]);
    },
    async () => {
      const rows = await getRentSettlementCandidates("c1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/get_rent_settlement_candidates"));
      assert.deepEqual(seenBody, { p_client: "c1" });
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.entry_id, "e1");
      assert.equal(rows[0]?.payable_account_code, "2050");
      assert.equal(rows[0]?.unsettled_cents, 360000);
      // The window travels ON the row: a person is never told less than was searched.
      assert.equal(rows[0]?.candidate_window_days, 35);
      assert.equal(rows[0]?.candidates.length, 1);
      assert.equal(rows[0]?.candidates[0]?.amount_cents, -360000);
      assert.equal(rows[0]?.candidates[0]?.date_delta_days, 20);
    },
  );
});

test("getRentSettlementCandidates: an empty array reads as no open month, never null", async () => {
  await withMockedFetch(
    async () => jsonResponse([]),
    async () => {
      assert.deepEqual(await getRentSettlementCandidates("c1", { session: fakeSession("tok") }), []);
    },
  );
});

test("getRentSettlementCandidates: a month with no candidate line degrades to an empty list and a null window, never a guess", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ entry_id: "e1", rent_cents: 100, unsettled_cents: 100 }]),
    async () => {
      const rows = await getRentSettlementCandidates("c1", { session: fakeSession("tok") });
      assert.deepEqual(rows[0]?.candidates, []);
      assert.equal(rows[0]?.candidate_window_days, null);
    },
  );
});

test("getTenancyDepositCoding: posts p_client and keeps the account balance apart from this deposit's own share", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (u) => {
      seenUrl = String(u);
      return jsonResponse([
        {
          document_id: "d1", deposit_cents: 720000, printed_raw: "7,200.00",
          recorded_at: "2026-01-05T00:00:00Z", basis_kind: "document_region",
          term_start: "2026-01-05", proposed_account_code: "1120",
          proposed_account_name: "Deposits Paid", proposed_account_in_chart: true,
          already_coded: false, coded_cents: 0,
          deposits_account_balance_cents: 800000, deposits_sharing_account: 2,
          candidates: [],
        },
      ]);
    },
    async () => {
      const offers = await getTenancyDepositCoding("c1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/get_tenancy_deposit_coding"));
      assert.equal(offers.length, 1);
      assert.equal(offers[0]?.already_coded, false);
      // THE TWO FIGURES ARE DIFFERENT THINGS, and the wire keeps them apart: `coded_cents` is
      // this deposit's own FIFO share, `deposits_account_balance_cents` is what 1120 holds
      // across every deposit sharing it.
      assert.equal(offers[0]?.coded_cents, 0);
      assert.equal(offers[0]?.deposits_account_balance_cents, 800000);
      assert.equal(offers[0]?.deposits_sharing_account, 2);
    },
  );
});

test("getTenancyDepositCoding: a chart without 1120 degrades to in_chart=false, never a silent code", async () => {
  await withMockedFetch(
    async () => jsonResponse([{ document_id: "d1", deposit_cents: 720000, proposed_account_code: "1120" }]),
    async () => {
      const offers = await getTenancyDepositCoding("c1", { session: fakeSession("tok") });
      assert.equal(offers[0]?.proposed_account_in_chart, false);
      assert.equal(offers[0]?.proposed_account_name, null);
    },
  );
});
