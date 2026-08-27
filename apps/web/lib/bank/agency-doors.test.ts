// lib/bank/agency-doors.ts — the agency-hold toggle + the identifier-
// promotion confirm door. Pins wire shape and BOTH of the confirm door's
// typed refusals verbatim (identifier_kind_out_of_scope,
// promotion_target_ambiguous), plus promotion_target_unavailable.

import { test } from "node:test";
import assert from "node:assert/strict";
import { setBankAgencyHold, confirmBankIdentifierPromotion } from "./agency-doors";
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

test("setBankAgencyHold: posts exactly p_client/p_on/p_reason/p_op_key, nothing else", async () => {
  let seenUrl = "";
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      body = JSON.parse(String(init?.body));
      return jsonResponse({ client_id: "client-1", on: true });
    },
    async () => {
      await setBankAgencyHold("client-1", true, "suspicious statement", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/set_bank_agency_hold"));
      assert.equal(body.p_client, "client-1");
      assert.equal(body.p_on, true);
      assert.equal(body.p_reason, "suspicious statement");
      assert.deepEqual(Object.keys(body).sort(), ["p_client", "p_on", "p_op_key", "p_reason"]);
    },
  );
});

test("setBankAgencyHold: a reason_required refusal surfaces VERBATIM", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "a hold reason is required", details: '{"reason":"reason_required"}' }, 400),
    async () => {
      await assert.rejects(
        () => setBankAgencyHold("client-1", true, "", { session: fakeSession("tok") }),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "reason_required",
      );
    },
  );
});

test("confirmBankIdentifierPromotion: posts exactly p_proposal + a fresh p_op_key", async () => {
  let seenUrl = "";
  let body: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      body = JSON.parse(String(init?.body));
      return jsonResponse({ status: "confirmed" });
    },
    async () => {
      await confirmBankIdentifierPromotion("prop-1", { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/confirm_bank_identifier_promotion"));
      assert.equal(body.p_proposal, "prop-1");
      assert.deepEqual(Object.keys(body).sort(), ["p_op_key", "p_proposal"]);
    },
  );
});

test("confirmBankIdentifierPromotion: identifier_kind_out_of_scope surfaces VERBATIM", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse(
        { code: "CLR10", message: "this door confirms a promoted payer BANK ACCOUNT only -- tin is out of scope for confirm_bank_identifier_promotion", details: '{"reason":"identifier_kind_out_of_scope","class":"promotion"}' },
        400,
      ),
    async () => {
      await assert.rejects(
        () => confirmBankIdentifierPromotion("prop-1", { session: fakeSession("tok") }),
        (e: unknown) => {
          assert.ok(e instanceof DoorRefusal);
          assert.equal((e as InstanceType<typeof DoorRefusal>).reason, "identifier_kind_out_of_scope");
          assert.match((e as Error).message, /BANK ACCOUNT only/);
          return true;
        },
      );
    },
  );
});

test("confirmBankIdentifierPromotion: promotion_target_ambiguous surfaces VERBATIM", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "more than one client identity matches this identifier", details: '{"reason":"promotion_target_ambiguous","class":"promotion"}' }, 400),
    async () => {
      await assert.rejects(
        () => confirmBankIdentifierPromotion("prop-1", { session: fakeSession("tok") }),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "promotion_target_ambiguous",
      );
    },
  );
});

test("confirmBankIdentifierPromotion: promotion_target_unavailable surfaces VERBATIM (proposal stays open)", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "no matching client identity was found", details: '{"reason":"promotion_target_unavailable","class":"promotion"}' }, 400),
    async () => {
      await assert.rejects(
        () => confirmBankIdentifierPromotion("prop-1", { session: fakeSession("tok") }),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "promotion_target_unavailable",
      );
    },
  );
});
