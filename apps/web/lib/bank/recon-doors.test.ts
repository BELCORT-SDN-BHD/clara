// lib/bank/recon-doors.ts — the "certify" DOORS. Pins wire shape,
// refusal-verbatim propagation, and the opaque-receipt discipline (N14:
// completeBankReconciliation returns the RPC's own bytes, never mapped
// through toBankReconciliationView — the caller re-reads getBankReconciliation
// for the real, mapped view).

import { test } from "node:test";
import assert from "node:assert/strict";
import { completeBankReconciliation, voidBankReconciliation } from "./recon-doors";
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

test("completeBankReconciliation: posts p_statement/p_ack_outstanding and returns the RPC's own bytes opaque, never mapped", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ statement_id: "s1", status: "complete", preview: false, closing_cents: -500 });
    },
    async () => {
      const receipt = await completeBankReconciliation("s1", ["oi1", "oi2"], { session: fakeSession("tok") });
      assert.deepEqual(seenBody.p_ack_outstanding, ["oi1", "oi2"]);
      // Opaque pass-through, not a mapped BankReconciliationView (N14) — the
      // RPC's own `status` key survives verbatim; there is no `.terms`/
      // `.mode` on this return type to assert against.
      assert.equal(receipt.status, "complete");
    },
  );
});

test("completeBankReconciliation: a difference_nonzero refusal surfaces VERBATIM", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "the statement does not tie", details: '{"reason":"difference_nonzero"}' }, 400),
    async () => {
      await assert.rejects(
        () => completeBankReconciliation("s1", [], { session: fakeSession("tok") }),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "difference_nonzero",
      );
    },
  );
});

test("voidBankReconciliation: posts p_recon/p_reason", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({});
    },
    async () => {
      await voidBankReconciliation("recon1", "wrong period certified", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/void_bank_reconciliation"));
      assert.equal(seenBody.p_recon, "recon1");
      assert.equal(seenBody.p_reason, "wrong period certified");
    },
  );
});
