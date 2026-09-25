// lib/documents/payroll-posting-state.ts — `clara.get_payroll_posting_state` (migration 0363,
// #1148), the ONE web module that names the payroll lane's granted read.
//
// Mocked-fetch style ported from `lib/firm/needs-you.test.ts`'s own precedent: the property under
// test is that the wrapper posts the right RPC name and argument and repairs the wire at the
// boundary, NOT a re-derivation of `callDoor`'s already-tested CLR/refusal classification.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blocksOnThisDocumentsOwnEntry, getPayrollPostingState, isNotAPayrollSummary, toPayrollPostingState,
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

// #1148 FIX ROUND (SPEC-01 / ADV-02) — WHOSE ENTRY THE TENTH RUNG IS TALKING ABOUT.
//
// `no_duplicate_entry` fires for four scopes, and the first is `same_document`: the payslip's OWN
// entry. 0343's sentence for it is written for a re-file attempt made from somewhere else ("This
// payslip was not posted again -- open that entry to decide whether this is a correction or a
// re-upload"), so on the document's own page it invites a person to decide something about their
// own entry. The rule lives HERE, once, rather than as a condition inside the component, because it
// is a fact about the door's answer and two surfaces must not each spell it their own way.
//
// THE ANSWERS BELOW ARE THE DATABASE'S, transcribed from the db cell `p1148.read.posted`.
const POSTED = {
  document_id: "11111111-1111-4111-8111-111111111111",
  sentence:
    "Payroll run September 2026 is already posted (Payroll run September 2026, 2026-09-30). "
    + "This payslip was not posted again -- open that entry to decide whether this is a correction "
    + "or a re-upload.",
  verdict: "blocked",
  rung: "no_duplicate_entry",
  reason: "duplicate_entry",
  duplicate_scope: "same_document",
  completeness: { parked: false, rows_read: 2, gross_sum_cents: 500000, net_sum_cents: 425570 },
};

test("toPayrollPostingState: the duplicate's scope crosses the boundary, and an absent one is null", () => {
  assert.equal(toPayrollPostingState(POSTED).duplicate_scope, "same_document");
  assert.equal(toPayrollPostingState(PARKED).duplicate_scope, null,
    "no duplicate, no scope -- and null rather than undefined, so a caller never reads a hole");
});

test("blocksOnThisDocumentsOwnEntry: true only for the tenth rung on THIS document's own entry", () => {
  assert.equal(blocksOnThisDocumentsOwnEntry(toPayrollPostingState(POSTED)), true,
    "a payslip whose own entry stands is not a payslip that 'was not posted again'");

  // ANOTHER DOCUMENT'S ENTRY on the same rung IS this page's business: it is the re-upload case
  // 0343 wrote the sentence for, and the reader has no other way to learn it.
  for (const scope of ["same_filing", "same_month_payroll_run", "payroll_obligation"]) {
    assert.equal(
      blocksOnThisDocumentsOwnEntry(toPayrollPostingState({ ...POSTED, duplicate_scope: scope })),
      false, `scope ${scope} is somebody else's entry and the sentence about it must be shown`);
  }

  // …and no other rung is silenced, whatever the scope says.
  assert.equal(blocksOnThisDocumentsOwnEntry(toPayrollPostingState(PARKED)), false);
  assert.equal(
    blocksOnThisDocumentsOwnEntry(
      toPayrollPostingState({ ...PARKED, duplicate_scope: "same_document" })),
    false, "the scope alone must not silence a rung that is not about a duplicate");
});
