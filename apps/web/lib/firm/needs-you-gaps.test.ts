// lib/firm/needs-you-gaps.test.ts — the two 0137 read surfaces and their four
// 0103 act doors. Mocked-fetch style ported from ../doors.test.ts's own
// precedent (also lib/firm/needs-you.test.ts's direct sibling): the property
// under test is that each wrapper hits the right relation/RPC with the right
// args, not a re-derivation of getRows/callDoor's own already-tested CLR/
// refusal classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadFirmOpenQuestions,
  resolveFirmQuestion,
  dismissFirmQuestion,
  loadIdentifierPromotions,
  confirmIdentifierPromotion,
  declineIdentifierPromotion,
  isActingRowPresent,
  shouldShowGapErrorBanner,
} from "./needs-you-gaps";
import { isDoorRefusal } from "../doors";
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

test("loadFirmOpenQuestions: GETs firm_open_questions_visible filtered to status=open, ordered opened_at desc", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadFirmOpenQuestions(fakeSession("tok"));
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/firm_open_questions_visible\?/);
  assert.match(seenUrl, /status=eq\.open/);
  assert.match(seenUrl, /order=opened_at\.desc/);
});

test("resolveFirmQuestion: POSTs resolve_firm_question with p_client and a fresh op_key", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ question_id: "q1", status: "resolved", named_client: "c1" }, 200);
    },
    async () => {
      await resolveFirmQuestion(fakeSession("tok"), "q1", "It's Acme.", "c1");
    },
  );
  assert.match(seenUrl, /\/rpc\/resolve_firm_question$/);
  assert.equal(seenBody.p_question, "q1");
  assert.equal(seenBody.p_resolution, "It's Acme.");
  assert.equal(seenBody.p_client, "c1");
  assert.ok(typeof seenBody.p_op_key === "string" && seenBody.p_op_key.length > 0);
});

test("resolveFirmQuestion: a null clientId is passed through as p_client: null (the door's own optional arg)", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_url, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ question_id: "q1", status: "resolved", named_client: null }, 200);
    },
    async () => {
      await resolveFirmQuestion(fakeSession("tok"), "q1", "Not attributable.", null);
    },
  );
  assert.equal(seenBody.p_client, null);
});

test("dismissFirmQuestion: POSTs dismiss_firm_question, no client argument at all", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ question_id: "q1", status: "dismissed" }, 200);
    },
    async () => {
      await dismissFirmQuestion(fakeSession("tok"), "q1", "Not a real question.");
    },
  );
  assert.match(seenUrl, /\/rpc\/dismiss_firm_question$/);
  assert.deepEqual(Object.keys(seenBody).sort(), ["p_op_key", "p_question", "p_reason"]);
  assert.equal(seenBody.p_reason, "Not a real question.");
});

test("dismissFirmQuestion: a governed CLR refusal surfaces as DoorRefusal verbatim, never retried", async () => {
  let attempts = 0;
  await withMockedFetch(
    async () => {
      attempts += 1;
      return jsonResponse({ code: "CLR10", message: "firm question is not open" }, 400);
    },
    async () => {
      await assert.rejects(dismissFirmQuestion(fakeSession("tok"), "q1", "irrelevant"), (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR10");
        assert.equal((e as { message: string }).message, "firm question is not open");
        return true;
      });
    },
  );
  assert.equal(attempts, 1);
});

test("loadIdentifierPromotions: GETs client_identifier_promotions_visible filtered to status=proposed, ordered proposed_at desc", async () => {
  let seenUrl = "";
  await withMockedFetch(
    async (url) => {
      seenUrl = String(url);
      return jsonResponse([], 200);
    },
    async () => {
      await loadIdentifierPromotions(fakeSession("tok"));
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/client_identifier_promotions_visible\?/);
  assert.match(seenUrl, /status=eq\.proposed/);
  assert.match(seenUrl, /order=proposed_at\.desc/);
});

test("confirmIdentifierPromotion: POSTs confirm_identifier_promotion with p_proposal + p_op_key ONLY (no kind argument — the door takes none)", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ promotion_id: "p1", status: "confirmed", identifier_id: "i1" }, 200);
    },
    async () => {
      await confirmIdentifierPromotion(fakeSession("tok"), "p1");
    },
  );
  assert.match(seenUrl, /\/rpc\/confirm_identifier_promotion$/);
  assert.deepEqual(Object.keys(seenBody).sort(), ["p_op_key", "p_proposal"]);
  assert.equal(seenBody.p_proposal, "p1");
});

test("declineIdentifierPromotion: POSTs decline_identifier_promotion with p_proposal/p_reason/p_op_key", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ promotion_id: "p1", status: "declined" }, 200);
    },
    async () => {
      await declineIdentifierPromotion(fakeSession("tok"), "p1", "Wrong account.");
    },
  );
  assert.match(seenUrl, /\/rpc\/decline_identifier_promotion$/);
  assert.equal(seenBody.p_reason, "Wrong account.");
});

test("isActingRowPresent: false when actingId is null", () => {
  assert.equal(isActingRowPresent([{ id: "q1" }], null), false);
});

test("isActingRowPresent: true when the acted-on row is still present", () => {
  assert.equal(isActingRowPresent([{ id: "q1" }, { id: "q2" }], "q1"), true);
});

test("isActingRowPresent: false when the acted-on row VANISHED (e.g. someone else already settled it)", () => {
  assert.equal(isActingRowPresent([{ id: "q2" }], "q1"), false);
});

test("shouldShowGapErrorBanner: no data ever loaded -> false (DataState's full-page error owns it)", () => {
  assert.equal(shouldShowGapErrorBanner(false, new Error("boom"), [{ id: "q1" }], null), false);
});

test("shouldShowGapErrorBanner: the acting row is still present -> false (the row shows it instead)", () => {
  assert.equal(shouldShowGapErrorBanner(true, new Error("boom"), [{ id: "q1" }], "q1"), false);
});

test("shouldShowGapErrorBanner: the acting row VANISHED -> true (the same class R1 fixed on the review queue)", () => {
  assert.equal(shouldShowGapErrorBanner(true, new Error("CLR10: not open"), [{ id: "q2" }], "q1"), true);
});

test("shouldShowGapErrorBanner: data has loaded but there is no error at all -> false (the !error short-circuit)", () => {
  assert.equal(shouldShowGapErrorBanner(true, null, [{ id: "q1" }], "q1"), false);
});
