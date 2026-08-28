// lib/firm-admin/vendor-bindings.ts — wire-shape pinning (T10 rung-6 battery).
// Proves each wrapper sends the EXACT function name + args this module's own
// header grounds against the live rig census (0028_vendor_identity_binding.
// sql, LIVE-UNTOUCHED), that `proposeVendorIdentityBinding` sends the
// closed-key `{client_id, counterparty_id}` shape the DB requires and no
// other, and that a refusal survives verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listVendorBindings,
  getVendorBinding,
  proposeVendorIdentityBinding,
  signVendorIdentityBinding,
  revokeVendorIdentityBinding,
  loadVendorCounterparties,
} from "./vendor-bindings";
import { isDoorRefusal } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

type Seen = { url: string; body: Record<string, unknown> };

function captureFetch(result: unknown, status = 200): { impl: typeof fetch; seen: { first(): Seen } } {
  const calls: Seen[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return {
    impl,
    seen: {
      first(): Seen {
        assert.equal(calls.length, 1, `expected exactly one fetch call, got ${calls.length}`);
        return calls[0] as Seen;
      },
    },
  };
}

test("listVendorBindings posts to list_vendor_bindings (singular live name) with p_client only", async () => {
  const rows = [
    {
      binding_id: "b1", counterparty_id: "cp1", counterparty_name: "Acme Sdn Bhd", status: "live",
      f1_vendor_name_norm: "acme sdn bhd", f2_invoice_prefix: "INV-A", registration_at_signing: "202401012345",
      signed_by: "u1", signed_at: "2026-01-01T00:00:00Z", expires_at: "2026-12-31T00:00:00Z",
      evidence_count: 3, resolution_count: 5, divergence_documents: 0,
    },
  ];
  const { impl, seen } = captureFetch(rows);
  await withMockedFetch(impl, async () => {
    const out = await listVendorBindings(fakeSession(), "c1");
    assert.deepEqual(out, rows);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/list_vendor_bindings$/);
  assert.deepEqual(s.body, { p_client: "c1" });
});

test("getVendorBinding posts to get_vendor_binding with p_binding only", async () => {
  const detail = {
    binding: {
      id: "b1", firm_id: "f1", client_id: "c1", counterparty_id: "cp1", status: "live",
      f1_vendor_name_norm: "acme sdn bhd", f2_invoice_prefix: "INV-A", registration_at_signing: "202401012345",
      content_hash: "a".repeat(64), created_by: "u1", created_at: "2026-01-01T00:00:00Z",
      signed_by: "u2", signed_at: "2026-01-02T00:00:00Z", revoked_by: null, revoked_at: null,
      revoke_reason: null, expires_at: "2026-12-31T00:00:00Z",
    },
    counterparty: { counterparty_id: "cp1", counterparty_name: "Acme Sdn Bhd" },
    evidence: [],
    resolutions: [],
  };
  const { impl, seen } = captureFetch(detail);
  await withMockedFetch(impl, async () => {
    const out = await getVendorBinding(fakeSession(), "b1");
    assert.deepEqual(out, detail);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/get_vendor_binding$/);
  assert.deepEqual(s.body, { p_binding: "b1" });
});

test("proposeVendorIdentityBinding posts p_proposal as EXACTLY {client_id, counterparty_id} (the DB's own closed-key check) plus a fresh op_key", async () => {
  const { impl, seen } = captureFetch({ binding_id: "b1", status: "proposed" });
  await withMockedFetch(impl, async () => {
    await proposeVendorIdentityBinding(fakeSession(), "c1", "cp1");
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/propose_vendor_identity_binding$/);
  assert.deepEqual(s.body.p_proposal, { client_id: "c1", counterparty_id: "cp1" });
  assert.deepEqual(Object.keys(s.body.p_proposal as object).sort(), ["client_id", "counterparty_id"]);
  assert.equal(typeof s.body.p_op_key, "string");
  assert.ok((s.body.p_op_key as string).length > 0);
});

test("signVendorIdentityBinding posts to sign_vendor_identity_binding with p_binding only", async () => {
  const { impl, seen } = captureFetch({ binding_id: "b1", status: "live" });
  await withMockedFetch(impl, async () => {
    await signVendorIdentityBinding(fakeSession(), "b1");
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/sign_vendor_identity_binding$/);
  assert.equal(s.body.p_binding, "b1");
  assert.equal(typeof s.body.p_op_key, "string");
});

test("revokeVendorIdentityBinding posts p_binding/p_reason to revoke_vendor_identity_binding", async () => {
  const { impl, seen } = captureFetch({ binding_id: "b1", status: "revoked", approved_entries: 2 });
  await withMockedFetch(impl, async () => {
    await revokeVendorIdentityBinding(fakeSession(), "b1", "Vendor changed bank details, re-verifying.");
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/revoke_vendor_identity_binding$/);
  assert.equal(s.body.p_binding, "b1");
  assert.equal(s.body.p_reason, "Vendor changed bank details, re-verifying.");
});

test("loadVendorCounterparties reads counterparties scoped by client_id/kind=vendor/not-merged/not-retired, name ascending", async () => {
  const rows = [{ id: "cp1", name: "Acme Sdn Bhd", registration_normalized: "202401012345" }];
  const { impl, seen } = captureFetch(rows);
  await withMockedFetch(impl, async () => {
    const out = await loadVendorCounterparties(fakeSession(), "c1");
    assert.deepEqual(out, rows);
  });
  const s = seen.first();
  assert.match(s.url, /\/rest\/v1\/counterparties\?/);
  assert.match(s.url, /client_id=eq\.c1/);
  assert.match(s.url, /kind=eq\.vendor/);
  assert.match(s.url, /merged_into=is\.null/);
  assert.match(s.url, /retired_at=is\.null/);
  assert.match(s.url, /order=name\.asc/);
});

test("a governed refusal (CLR04, sign requires admin) survives verbatim through signVendorIdentityBinding", async () => {
  const { impl } = captureFetch({ code: "CLR04", message: "insufficient rank" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => signVendorIdentityBinding(fakeSession(), "b1"),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR04");
        return true;
      },
    );
  });
});
