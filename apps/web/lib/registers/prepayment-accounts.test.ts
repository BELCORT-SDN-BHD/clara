import { test } from "node:test";
import assert from "node:assert/strict";
import { enrolPrepaymentAccount, retirePrepaymentAccount } from "./prepayment-accounts";
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

// The parameter NAMES are the contract (migration 0306 §B/§C) — a positional mismatch here would
// reach PostgREST as an unknown-argument 404, and `operation-census`'s `named_arg_mismatch` label
// exists because exactly that has happened before.

test("enrolPrepaymentAccount: posts the exact door body shape with the purpose and the stated reason", async () => {
  const { impl, calls } = captureFetch({ enrolment_id: "e1", client_id: "c1", account_code: "1900", purpose: "prepayment", active: true });
  await withMockedFetch(impl, async () => {
    await enrolPrepaymentAccount(fakeSession("tok"), {
      clientId: "c1", accountCode: "1900", reason: "  holds the prepaid insurance  ",
    });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.url, /\/rpc\/enrol_prepayment_account$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_account, "1900");
  assert.equal(body.p_purpose, "prepayment", "the purpose defaults to the only one this build's door admits");
  assert.equal(body.p_reason, "holds the prepaid insurance", "the reason crosses TRIMMED, so a space-only reason is refused by the form rather than stored");
  assert.equal(typeof body.p_op_key, "string");
});

test("retirePrepaymentAccount: posts p_client + p_account + p_purpose with a fresh op_key", async () => {
  const { impl, calls } = captureFetch({ enrolment_id: "e1", active: false });
  await withMockedFetch(impl, async () => {
    await retirePrepaymentAccount(fakeSession("tok"), { clientId: "c1", accountCode: "1900" });
  });
  assert.match(calls[0]!.url, /\/rpc\/retire_prepayment_account$/);
  assert.deepEqual(
    { p_client: calls[0]!.body.p_client, p_account: calls[0]!.body.p_account, p_purpose: calls[0]!.body.p_purpose },
    { p_client: "c1", p_account: "1900", p_purpose: "prepayment" },
  );
  assert.equal(typeof calls[0]!.body.p_op_key, "string");
});

test("enrolPrepaymentAccount: a CLR37 refusal surfaces as a DoorRefusal, never masked", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        {
          code: "CLR37",
          message: "account 374-C56 cannot be enrolled as a prepayment account for this client",
          details: '{"reason":"prepayment_account_enrolment_invalid","axis":"control_account","account_class":"receivable"}',
        },
        400,
      ),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(
        enrolPrepaymentAccount(fakeSession("tok"), { clientId: "c1", accountCode: "374-C56", reason: "why" }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          assert.equal(e.reason, "prepayment_account_enrolment_invalid");
          return true;
        },
      );
    },
  );
});
