import { test } from "node:test";
import assert from "node:assert/strict";
import { loadChartOfAccounts, upsertAccount } from "./accounts";
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

test("loadChartOfAccounts: reads coa_accounts scoped by client_id, ordered by account_code", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadChartOfAccounts(fakeSession("tok"), "c1");
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/coa_accounts\?/);
  assert.match(seenUrl, /client_id=eq\.c1/);
  assert.match(seenUrl, /select=account_code%2Cname%2Caccount_type/);
  assert.match(seenUrl, /order=account_code\.asc/);
});

test("loadChartOfAccounts: a no_session state throws without ever calling fetch", async () => {
  let called = false;
  await withMockedFetch(
    async () => {
      called = true;
      throw new Error("must not be called");
    },
    async () => {
      const { isReadError } = await import("../read");
      await assert.rejects(loadChartOfAccounts(fakeSession(null), "c1"), (e: unknown) => {
        assert.ok(isReadError(e));
        return true;
      });
    },
  );
  assert.equal(called, false);
});

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return { impl, calls };
}

test("upsertAccount: posts every field with a fresh op_key, nulls omitted as null (never dropped)", async () => {
  const { impl, calls } = captureFetch({ client_id: "c1", account_code: "5100" });
  await withMockedFetch(impl, async () => {
    await upsertAccount(fakeSession("tok"), {
      clientId: "c1",
      code: "5100",
      name: "Rent expense",
      type: "expense",
      accountClass: null,
      specialAccType: null,
    });
  });
  assert.match(calls[0]!.url, /\/rpc\/upsert_account$/);
  const body = calls[0]!.body;
  assert.equal(body.p_client, "c1");
  assert.equal(body.p_code, "5100");
  assert.equal(body.p_name, "Rent expense");
  assert.equal(body.p_type, "expense");
  assert.equal(body.p_special_acc_type, null);
  assert.equal(typeof body.p_op_key, "string");
  assert.equal(body.p_account_class, null);
});

test("upsertAccount: a CLR10 'cannot change type/class of an account that has lines' refusal surfaces verbatim as a DoorRefusal", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "cannot change type/class of an account that has lines" }, 400),
    async () => {
      const { isDoorRefusal } = await import("../doors");
      await assert.rejects(
        upsertAccount(fakeSession("tok"), { clientId: "c1", code: "5100", name: "x", type: "asset", accountClass: null, specialAccType: null }),
        (e: unknown) => {
          assert.ok(isDoorRefusal(e));
          return true;
        },
      );
    },
  );
});
