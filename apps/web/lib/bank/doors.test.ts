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

// H-06 — RE-CUT, not merely extended. The previous cell built a seven-key header
// and asserted `deepEqual(seenBody.p_header, header)`, which made the DEFECT the
// pin: the header it canonised carried neither `institution_code` nor
// `account_number`, and `clara._stmt_header_norm` reads exactly that pair first and
// raises CLR10 `header_unreadable` when either is absent (0038:1189-1200). A
// deepEqual against a defective literal can only ever agree with itself. The cell
// below still proves the body is posted VERBATIM, and additionally NAMES the pair,
// so deleting either field from `BankStatementHeaderInput` (or dropping it on the
// way to the wire) reds this test.
test("enterBankStatement: posts p_header/p_lines verbatim, and the header NAMES the institution/account pair the DB normalizer reads first", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  const header = {
    institution_code: "MBBEMYKL",
    account_number: "5141-2233-4455",
    period_start: "2026-04-01", period_end: "2026-04-30", statement_date: "2026-04-30",
    opening_cents: 0, closing_cents: -500, total_debit_cents: 500, total_credit_cents: 0, currency: null,
  };
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
      // The pair, asserted BY NAME and non-empty — the deepEqual above would still
      // pass against a header literal that omitted both.
      const posted = seenBody.p_header as Record<string, unknown>;
      assert.equal(posted.institution_code, "MBBEMYKL");
      assert.equal(posted.account_number, "5141-2233-4455");
      assert.ok(String(posted.institution_code ?? "").length > 0, "institution_code must reach the wire");
      assert.ok(String(posted.account_number ?? "").length > 0, "account_number must reach the wire");
      // The PRINTED spelling survives — hyphens included. add_bank_account's own
      // normalizer preserves them (0038:1190-1196) and this door digit-strips what
      // it is handed, so a caller must never "helpfully" pre-normalize.
      assert.ok(String(posted.account_number).includes("-"), "the printed account number is sent, not a digits-only normalization");
      // statement_date is REQUIRED by the same normalizer (0038:1211-1218).
      assert.equal(posted.statement_date, "2026-04-30");
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
