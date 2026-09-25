// lib/documents/payroll-posting-state.ts — `clara.get_payroll_posting_state` (migration 0363,
// #1148), the ONE web module that names the payroll lane's granted read.
//
// Mocked-fetch style ported from `lib/firm/needs-you.test.ts`'s own precedent: the property under
// test is that the wrapper posts the right RPC name and argument and repairs the wire at the
// boundary, NOT a re-derivation of `callDoor`'s already-tested CLR/refusal classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getPayrollPostingState, isNotAPayrollSummary, toPayrollPostingState,
} from "./payroll-posting-state";
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

/** The door's own answer for the state #1048 exists for, transcribed from the database cell
 *  `p1148.read.projection` rather than invented: six keys, the parked question's sentence, and no
 *  `rung_vector`. */
const PARKED = {
  document_id: "11111111-1111-4111-8111-111111111111",
  sentence:
    "This payroll summary for March 2026 prints no total; is this every employee for the month? "
    + "Clara read 2 employee line(s), totalling RM 5,000.00 gross and RM 4,255.70 net. "
    + "Answer yes and the run posts from those lines; answer no and it stays unposted.",
  verdict: "blocked",
  rung: "completeness_witness",
  reason: "completeness_unwitnessed",
  completeness: {
    parked: true, state: null, witness: null, answer: null,
    rows_read: 2, gross_sum_cents: 500000, net_sum_cents: 425570,
  },
};

test("getPayrollPostingState: POSTs /rpc/get_payroll_posting_state with p_document and returns the door's own sentence", async () => {
  let seenUrl = "";
  let seenBody: unknown;
  await withMockedFetch(
    async (url, init) => {
      seenUrl = String(url);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse(PARKED, 200);
    },
    async () => {
      const state = await getPayrollPostingState(PARKED.document_id, { session: fakeSession("tok") });
      assert.equal(state.sentence, PARKED.sentence, "the database's sentence, verbatim -- never reworded here");
      assert.equal(state.verdict, "blocked");
      assert.equal(state.rung, "completeness_witness");
      assert.equal(state.reason, "completeness_unwitnessed");
      assert.equal(state.completeness?.parked, true);
    },
  );
  assert.match(seenUrl, /\/rest\/v1\/rpc\/get_payroll_posting_state$/);
  assert.deepEqual(seenBody, { p_document: PARKED.document_id });
});

test("toPayrollPostingState: repairs the wire at the boundary -- a bigint arrives as a string, an absent completeness is null", () => {
  // `rows_read`, `gross_sum_cents` and `net_sum_cents` are bigint-shaped on the database side and
  // PostgREST is free to hand any of them over as a STRING. Repaired HERE, once, so no component
  // ever writes Number(x) inline and no two of them disagree about a missing field.
  const wired = toPayrollPostingState({
    ...PARKED,
    completeness: { parked: true, rows_read: "2", gross_sum_cents: "500000", net_sum_cents: null },
  });
  assert.equal(wired.completeness?.rows_read, 2);
  assert.equal(wired.completeness?.gross_sum_cents, 500000);
  assert.equal(wired.completeness?.net_sum_cents, null);

  // A door answer that carried no completeness object at all is NULL, not an empty object a
  // caller would then read `undefined` out of and paint as "nothing is parked".
  const none = toPayrollPostingState({ document_id: "d", sentence: "s", verdict: "ready", rung: null, reason: null });
  assert.equal(none.completeness, null);
  assert.equal(none.rung, null);
  assert.equal(none.reason, null);
  assert.equal(none.verdict, "ready");

  // AND NOTHING IS INVENTED: the ladder the door does not project must not appear here either.
  assert.equal("rung_vector" in (wired as unknown as Record<string, unknown>), false);
});

test("getPayrollPostingState: `not_a_payroll_summary` is a named refusal, recognised rather than reworded", async () => {
  let attempts = 0;
  await withMockedFetch(
    async () => {
      attempts += 1;
      return jsonResponse(
        {
          code: "CLR10",
          message: "this document is not a payroll summary, so it has no payroll posting state",
          details: '{"reason":"not_a_payroll_summary"}',
        },
        400,
      );
    },
    async () => {
      let caught: unknown = null;
      try {
        await getPayrollPostingState("d", { session: fakeSession("tok") });
      } catch (e) {
        caught = e;
      }
      assert.ok(isDoorRefusal(caught), "a governed refusal surfaces as DoorRefusal, verbatim");
      assert.ok(isNotAPayrollSummary(caught),
        "the ONE refusal a surface answers by rendering nothing -- the page asked about a document "
        + "whose kind moved under it");
      assert.equal(
        (caught as { message: string }).message,
        "this document is not a payroll summary, so it has no payroll posting state",
        "the database's words, not ours",
      );
    },
  );
  assert.equal(attempts, 1, "a refusal is never retried");
});

test("isNotAPayrollSummary: every OTHER refusal is somebody else's to render", async () => {
  await withMockedFetch(
    async () =>
      jsonResponse({ code: "CLR11", message: "payroll summary not found", details: null }, 404),
    async () => {
      let caught: unknown = null;
      try {
        await getPayrollPostingState("d", { session: fakeSession("tok") });
      } catch (e) {
        caught = e;
      }
      assert.ok(isDoorRefusal(caught));
      assert.equal(isNotAPayrollSummary(caught), false,
        "CLR11 means the document is not this firm's or is not there -- that is a banner, not silence");
    },
  );
  assert.equal(isNotAPayrollSummary(new Error("transport")), false, "a transport failure is not a refusal");
  assert.equal(isNotAPayrollSummary(null), false);
});
