// lib/bank/reads.ts — account + statement READS (transport via doors.ts's
// callDoor). Pins the WIRE SHAPE this lane sends (RPC name + args) and the
// defensive mapping, not DB behaviour — the CLR/status classification
// itself stays proven in wire.test.ts/doors.test.ts.

import { test } from "node:test";
import assert from "node:assert/strict";
import { listBankAccounts, listBankAccountProposals, listBankStatements, getBankStatement } from "./reads";
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

test("listBankAccounts: POSTs /rpc/list_bank_accounts with p_client and maps rows", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([{ id: "acc1", bank_code: "MBB", bank_name_display: "Maybank current" }]);
    },
    async () => {
      const rows = await listBankAccounts("client-1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/list_bank_accounts"));
      assert.equal(seenBody.p_client, "client-1");
      assert.equal(rows.length, 1);
      assert.equal(rows[0]?.bank_name_display, "Maybank current");
    },
  );
});

test("listBankAccountProposals: degrades a non-array reply to []", async () => {
  await withMockedFetch(
    async () => jsonResponse({ not: "an array" }),
    async () => {
      assert.deepEqual(await listBankAccountProposals("client-1", { session: fakeSession("tok") }), []);
    },
  );
});

test("listBankStatements: POSTs /rpc/list_bank_statements with p_client + p_bank_account", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse([]);
    },
    async () => {
      await listBankStatements("client-1", "acc-1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/list_bank_statements"));
      assert.equal(seenBody.p_client, "client-1");
      assert.equal(seenBody.p_bank_account, "acc-1");
    },
  );
});

test("getBankStatement: returns null when the RPC carries no statement, never throws", async () => {
  await withMockedFetch(
    async () => jsonResponse({}),
    async () => {
      assert.equal(await getBankStatement("s1", { session: fakeSession("tok") }), null);
    },
  );
});

test("getBankStatement: maps header + lines together", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse({
        statement: { id: "s1", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 0, closing_cents: -500 },
        lines: [{ id: "l1", statement_id: "s1", line_no: 1, entry_date: "2026-04-05", amount_cents: -500, match_state: "live" }],
      }),
    async () => {
      const detail = await getBankStatement("s1", { session: fakeSession("tok") });
      assert.equal(detail?.statement.id, "s1");
      assert.equal(detail?.lines.length, 1);
      assert.equal(detail?.lines[0]?.match_state, "live");
    },
  );
});
