// lib/bank/recon-reads.ts — get_bank_reconciliation (transport via
// callDoor). Pins wire shape + the receipt/preview mode inference only.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getBankReconciliation } from "./recon-reads";
import { reconTieState } from "./recon-types";
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

// BLOCKER-1 (independent review, HIGH): the DB deliberately omits BOTH
// difference_cents and derived_closing_cents on a COMPLETED receipt
// (0040:4180-4211, "preview-only, meaningless on a completed receipt" —
// completion already required difference=0 as its own precondition). The
// prior mapper filled that absence with a FABRICATED difference_cents=0 and
// relabelled the statement's own closing as "computed" — this cell locks the
// FIX, not the fabrication: both terms read null, and reconTieState (the
// same derivation the reconciliation-section screen renders its badge from)
// must answer "unavailable", never a manufactured "tied".
test("getBankReconciliation: a receipt (preview:false) that omits difference_cents/derived_closing_cents renders them null, never a fabricated 0 — the tie state reads 'unavailable'", async () => {
  await withMockedFetch(
    async () => jsonResponse({ statement_id: "s1", status: "complete", preview: false, closing_cents: -500 }),
    async () => {
      const view = await getBankReconciliation("s1", { session: fakeSession("tok") });
      assert.equal(view?.mode, "receipt");
      assert.equal(view?.terms.difference_cents, null, "never a fabricated 0 — the DB did not say the difference, only that it was zero AT COMPLETION time");
      assert.equal(view?.terms.computed_closing_cents, null, "never the statement's own closing relabelled as 'computed'");
      assert.equal(reconTieState(view!), "unavailable", "a receipt missing its own terms cannot be asserted 'tied' by this client");
    },
  );
});

test("getBankReconciliation: a receipt that DOES carry difference_cents/derived_closing_cents (a future RPC shape) renders them verbatim, never re-derived", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse({
        statement_id: "s1", status: "complete", preview: false, closing_cents: -500,
        difference_cents: 0, derived_closing_cents: -500,
        opening_anchor_cents: 0, gl_balance_cents: -500, outstanding_cents: 0, excepted_cents: 0,
        unmatched_capacity_prime_cents: 0,
      }),
    async () => {
      const view = await getBankReconciliation("s1", { session: fakeSession("tok") });
      assert.equal(view?.terms.difference_cents, 0);
      assert.equal(view?.terms.computed_closing_cents, -500);
      assert.equal(reconTieState(view!), "tied");
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
