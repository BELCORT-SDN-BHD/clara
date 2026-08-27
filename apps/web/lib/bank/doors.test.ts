// lib/bank/doors.ts — account + statement DOORS. Pins wire shape, a fresh
// op_key per call, and refusal-verbatim propagation (the COA-binding check
// on add_bank_account).

import { test } from "node:test";
import assert from "node:assert/strict";
import { addBankAccount, deactivateBankAccount, remapBankAccountCoa, enterBankStatement, voidBankStatement } from "./doors";
import { DoorRefusal } from "../doors";
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

test("addBankAccount: sends the named args + a fresh op_key per call, omits p_proposal_id when absent", async () => {
  const bodies: Record<string, unknown>[] = [];
  await withMockedFetch(
    async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({ bank_account_id: "acc1" });
    },
    async () => {
      await addBankAccount(
        { clientId: "c1", coaAccountCode: "601-000", bankCode: "MBB", accountNumber: "1-2-3", bankNameDisplay: "Maybank current" },
        { session: fakeSession("tok") },
      );
      assert.ok(!("p_proposal_id" in (bodies[0] ?? {})));
      await addBankAccount(
        { clientId: "c1", coaAccountCode: "601-000", bankCode: "MBB", accountNumber: "1-2-3", bankNameDisplay: "Maybank current", proposalId: "prop1" },
        { session: fakeSession("tok") },
      );
      assert.equal(bodies[1]?.p_proposal_id, "prop1");
      assert.notEqual(bodies[0]?.p_op_key, bodies[1]?.p_op_key, "a fresh op_key every call");
    },
  );
});

test("addBankAccount: the COA-binding refusal surfaces VERBATIM as a DoorRefusal, never retried", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR10", message: "this chart account is already bound to another active bank account", details: '{"reason":"coa_account_already_bank"}' },
        400,
      ),
    async () => {
      await assert.rejects(
        addBankAccount(
          { clientId: "c1", coaAccountCode: "601-000", bankCode: "MBB", accountNumber: "1", bankNameDisplay: "x" },
          { session: fakeSession("tok") },
        ),
        (e: unknown) => {
          assert.ok(e instanceof DoorRefusal);
          assert.equal((e as InstanceType<typeof DoorRefusal>).code, "CLR10");
          assert.equal((e as InstanceType<typeof DoorRefusal>).reason, "coa_account_already_bank");
          assert.match((e as Error).message, /already bound to another active bank account/);
          return true;
        },
      );
    },
  );
});

test("addBankAccount: throws when the DB returns no id, never fabricates one", async () => {
  await withMockedFetch(
    async () => jsonResponse({}),
    async () => {
      await assert.rejects(() =>
        addBankAccount({ clientId: "c1", coaAccountCode: "601-000", bankCode: "MBB", accountNumber: "1", bankNameDisplay: "x" }, { session: fakeSession("tok") }),
      );
    },
  );
});

test("deactivateBankAccount / remapBankAccountCoa: post the named args verbatim", async () => {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  await withMockedFetch(
    async (u, init) => {
      urls.push(String(u));
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({});
    },
    async () => {
      await deactivateBankAccount("c1", "acc1", "closed by the bank", { session: fakeSession("tok") });
      assert.ok(urls[0]?.includes("/rpc/deactivate_bank_account"));
      assert.equal(bodies[0]?.p_reason, "closed by the bank");
      await remapBankAccountCoa("c1", "acc1", "602-000", { session: fakeSession("tok") });
      assert.ok(urls[1]?.includes("/rpc/remap_bank_account_coa"));
      assert.equal(bodies[1]?.p_new_coa_account_code, "602-000");
    },
  );
});

test("enterBankStatement: posts p_header/p_lines verbatim under enter_bank_statement", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  const header = { period_start: "2026-04-01", period_end: "2026-04-30", statement_date: "2026-04-30", opening_cents: 0, closing_cents: -500, total_debit_cents: 500, total_credit_cents: 0, currency: null };
  const lines = [{ line_no: 1, entry_date: "2026-04-05", value_date: null, description: "fee", amount_cents: -500, running_balance_cents: -500 }];
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ statement_id: "s1" });
    },
    async () => {
      const out = await enterBankStatement({ clientId: "c1", bankAccountId: "acc1", documentId: "doc1", header, lines }, { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/enter_bank_statement"));
      assert.deepEqual(seenBody.p_header, header);
      assert.deepEqual(seenBody.p_lines, lines);
      assert.equal(out.statement_id, "s1");
    },
  );
});

test("voidBankStatement: a governed refusal propagates as a typed DoorRefusal", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "refused", details: '{"reason":"live_bank_match_present"}' }, 400),
    async () => {
      await assert.rejects(
        () => voidBankStatement("c1", "s1", "duplicate upload", { session: fakeSession("tok") }),
        (e: unknown) => {
          assert.ok(e instanceof DoorRefusal);
          assert.equal((e as InstanceType<typeof DoorRefusal>).reason, "live_bank_match_present");
          return true;
        },
      );
    },
  );
});
