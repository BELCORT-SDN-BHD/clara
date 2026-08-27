// lib/bank/recon-reads.ts — get_bank_reconciliation (transport via
// callDoor). Pins wire shape + the receipt/preview mode inference only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getBankReconciliation } from "./recon-reads";
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

test("getBankReconciliation: posts p_statement to /rpc/get_bank_reconciliation", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ statement_id: "s1", status: "open", preview: true, can_complete: false, blockers: ["line_unsettled"] });
    },
    async () => {
      const view = await getBankReconciliation("s1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/get_bank_reconciliation"));
      assert.equal(seenBody.p_statement, "s1");
      assert.equal(view?.mode, "preview");
      assert.equal(view?.can_complete, false);
      assert.deepEqual(view?.blockers, ["line_unsettled"]);
    },
  );
});

test("getBankReconciliation: a receipt (preview:false) infers mode 'receipt' and difference_cents 0", async () => {
  await withMockedFetch(
    async () => jsonResponse({ statement_id: "s1", status: "complete", preview: false, closing_cents: -500 }),
    async () => {
      const view = await getBankReconciliation("s1", { session: fakeSession("tok") });
      assert.equal(view?.mode, "receipt");
      assert.equal(view?.terms.difference_cents, 0);
    },
  );
});

test("getBankReconciliation: an empty RPC reply resolves null, never throws", async () => {
  await withMockedFetch(
    async () => jsonResponse(null),
    async () => {
      assert.equal(await getBankReconciliation("s1", { session: fakeSession("tok") }), null);
    },
  );
});
