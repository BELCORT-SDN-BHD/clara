// accounts/api.ts tests (closes live-gate-run-2026-07-24 finding 1). Mocks
// globalThis.fetch — the openingApi.test.ts / documents/api.test.ts idiom — no live DB.
//   - upsertAccount maps every arg to upsert_account's 0009 7-arg signature verbatim
//     (p_client/p_code/p_name/p_type/p_special_acc_type/p_op_key/p_account_class).
//   - opKeyOverride (the deterministic WB-R19 op_key) is sent through UNCHANGED when
//     supplied, and a fresh op_key is minted only when it is omitted (the ad-hoc
//     single-account form's one-off intent).
//   - a governed refusal (e.g. CLR10 duplicate/invalid) surfaces as a typed PgrestError,
//     the DB's message intact — never swallowed.
//   - hasAnyAccounts reads with limit=1 and reports existence only, never a count.

import { test } from "node:test";
import assert from "node:assert/strict";
import { upsertAccount, hasAnyAccounts, listAccounts } from "./api";
import type { PgrestError } from "../shared/wire";
import { coaSeedOpKey } from "./accountsModel";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("upsertAccount calls upsert_account with every arg mapped to its p_-name", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ client_id: "client-1", account_code: "900-A01" });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const out = await upsertAccount("jwt", {
    clientId: "client-1", code: "900-A01", name: "Accounting fee", type: "expense",
    special: null, accountClass: null, opKeyOverride: coaSeedOpKey("client-1", "900-A01"),
  });
  assert.ok(seenUrl.includes("/rpc/upsert_account"));
  assert.equal(bodies[0]?.p_client, "client-1");
  assert.equal(bodies[0]?.p_code, "900-A01");
  assert.equal(bodies[0]?.p_name, "Accounting fee");
  assert.equal(bodies[0]?.p_type, "expense");
  assert.equal(bodies[0]?.p_special_acc_type, null);
  assert.equal(bodies[0]?.p_account_class, null);
  assert.equal(bodies[0]?.p_op_key, "coaseed:client-1:900-A01", "the deterministic op_key rides through UNCHANGED");
  assert.deepEqual(out, { client_id: "client-1", account_code: "900-A01" });
});

test("upsertAccount mints a fresh op_key when opKeyOverride is omitted (the ad-hoc add form)", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ client_id: "client-1", account_code: "999-Z01" });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await upsertAccount("jwt", { clientId: "client-1", code: "999-Z01", name: "Ad hoc", type: "asset" });
  assert.ok(typeof bodies[0]?.p_op_key === "string" && (bodies[0]?.p_op_key as string).length > 0);
  assert.notEqual(bodies[0]?.p_op_key, "coaseed:client-1:999-Z01", "a one-off add never reuses the template's derivation");
});

test("upsertAccount propagates a governed refusal as a typed PgrestError, message intact", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonRes({ code: "CLR10", message: "cannot change type/class of an account that has lines" }, 400));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(
    () => upsertAccount("jwt", { clientId: "client-1", code: "1000", name: "x", type: "asset" }),
    (e: PgrestError) => {
      assert.equal(e.clr, "CLR10");
      assert.ok(e.message.includes("cannot change type/class"), "the DB message renders verbatim");
      return true;
    },
  );
});

test("upsertAccount throws when the DB body carries no account_code (never a fabricated success)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({}));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(() => upsertAccount("jwt", { clientId: "c", code: "1000", name: "x", type: "asset" }));
});

test("listAccounts reads coa_accounts scoped to the client, ordered by code", async (t) => {
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string) => {
    seenUrl = u;
    return jsonRes([]);
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await listAccounts("jwt", "client-1");
  assert.ok(seenUrl.includes("coa_accounts"));
  assert.ok(seenUrl.includes("client_id=eq.client-1"));
  assert.ok(seenUrl.includes("order=account_code.asc"));
});

test("hasAnyAccounts is a limit=1 existence probe, true/false — never a count", async (t) => {
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string) => {
    seenUrl = u;
    return jsonRes([{ account_code: "1000" }]);
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  assert.equal(await hasAnyAccounts("jwt", "client-1"), true);
  assert.ok(seenUrl.includes("limit=1"));
});

test("hasAnyAccounts reports false on an empty chart of accounts", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  assert.equal(await hasAnyAccounts("jwt", "client-1"), false);
});
