// lib/firm-admin/vendor-bindings.ts — wire-shape pinning (T10 rung-6 battery).
// Proves each wrapper sends the EXACT function name + args this module's own
// header grounds against the live rig census (0028_vendor_identity_binding.
// sql, LIVE-UNTOUCHED), and that a refusal survives verbatim.
//
// #921 [0273]: the propose/sign wire-shape cells (and loadVendorCounterparties',
// its picker-only sibling) went with the wrappers they pinned — migration 0273
// revoked clara_authenticated's EXECUTE on both doors for every rank, so
// pinning their wire shape would pin a call no human can ever make. Full
// history: git blame on this file before #921.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listVendorBindings,
  getVendorBinding,
  revokeVendorIdentityBinding,
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

test("a governed refusal (CLR04) survives verbatim through revokeVendorIdentityBinding", async () => {
  const { impl } = captureFetch({ code: "CLR04", message: "insufficient rank" }, 400);
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => revokeVendorIdentityBinding(fakeSession(), "b1", "a reason"),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR04");
        return true;
      },
    );
  });
});
