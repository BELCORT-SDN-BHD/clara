// counterpartyApi tests (migration 0021). Mocks globalThis.fetch — the openingApi.test.ts
// idiom, no live DB. Locks the things that are wrong in a way TypeScript cannot see:
//   - the list read excludes MERGED and RETIRED parties. Both still hold their slot in the
//     partial unique indexes, so offering one would let a human pick a party the DB then
//     refuses to re-mint — a dead option that reads like a bug.
//   - the list is kind-scoped. A vendor and a customer may legitimately share a name for one
//     client (both indexes carry `kind`), so an unscoped list would offer the wrong party.
//   - an EMPTY registration box sends null, not "". The indexes branch on
//     registration_normalized IS NULL; an empty string would put the row on the registration
//     branch with a blank key and the two branches would stop agreeing.
//   - `created` is reported, not swallowed: create-or-get means a caller who typed a new
//     supplier may have recovered an existing one, and must be told.
//   - a fresh op_key per attempt (idempotency is on firm,fn,op_key — reusing one would
//     replay the FIRST call's receipt, which is right for a retry and wrong for a new party).

import { test } from "node:test";
import assert from "node:assert/strict";
import { listCounterparties, createCounterparty } from "./counterpartyApi";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("listCounterparties excludes merged and retired parties, and scopes by kind", async (t) => {
  let url = "";
  t.mock.method(globalThis, "fetch", async (u: string) => { url = String(u); return jsonRes([]); });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

  await listCounterparties("jwt", "client-1", "vendor");
  assert.match(url, /merged_into=is\.null/, "merged parties are excluded at the query");
  assert.match(url, /retired_at=is\.null/, "…and retired ones too");
  assert.match(url, /kind=eq\.vendor/, "…and the list is kind-scoped");
  assert.match(url, /client_id=eq\.client-1/, "…and client-scoped");
  assert.match(url, /order=name\.asc/, "ordered by name, so a human can find one");
});

test("listCounterparties asks for the customer list when the item is a receivable", async (t) => {
  let url = "";
  t.mock.method(globalThis, "fetch", async (u: string) => { url = String(u); return jsonRes([]); });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await listCounterparties("jwt", "client-1", "customer");
  assert.match(url, /kind=eq\.customer/, "AR names a customer, not a vendor");
});

test("createCounterparty sends a blank registration and TIN as NULL, never as an empty string", async (t) => {
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return jsonRes({ counterparty_id: "cp-1", created: true });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";

  await createCounterparty("jwt", {
    clientId: "client-1", kind: "vendor", name: "Lost Invention Sdn Bhd",
    registrationNo: "   ", tin: "",
  });
  assert.equal(body.p_registration_no, null, "a blank registration box is NULL, not ''");
  assert.equal(body.p_tin, null, "…and so is a blank TIN");
  assert.equal(body.p_name, "Lost Invention Sdn Bhd", "the name goes through verbatim — the DB normalises");
  assert.equal(body.p_kind, "vendor");
  assert.equal(typeof body.p_op_key, "string", "a fresh op_key accompanies the call");
});

test("createCounterparty reports a RECOVERED party honestly rather than as a creation", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ counterparty_id: "cp-9", created: false }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const r = await createCounterparty("jwt", { clientId: "c", kind: "vendor", name: "Acme" });
  assert.deepEqual(r, { counterparty_id: "cp-9", created: false },
    "create-or-get: the caller must be able to tell which happened");
});

test("createCounterparty uses a DIFFERENT op_key on each attempt", async (t) => {
  const keys: unknown[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    keys.push(JSON.parse(String(init?.body)).p_op_key);
    return jsonRes({ counterparty_id: "cp-1", created: true });
  });
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await createCounterparty("jwt", { clientId: "c", kind: "vendor", name: "A" });
  await createCounterparty("jwt", { clientId: "c", kind: "vendor", name: "B" });
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1], "a reused op_key would replay the FIRST party's receipt");
});

test("createCounterparty refuses a body with no counterparty id rather than returning undefined", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ created: true }));
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  await assert.rejects(
    () => createCounterparty("jwt", { clientId: "c", kind: "vendor", name: "A" }),
    /no counterparty id/,
    "a malformed receipt must not become an undefined id on an opening item");
});
