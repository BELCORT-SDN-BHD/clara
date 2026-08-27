// lib/bank/exception-doors.ts — exceptions DOORS. Pins wire shape and the
// receipt-not-row honesty (except_bank_line/resolve_bank_line_exception
// return a narrow receipt, never the full row). Also pins that
// resolveAndBookBankLine never sends a stray p_control_account — the
// dashboard-precedent mistake this build does not reproduce (see this
// file's own header for the grounding).

import { test } from "node:test";
import assert from "node:assert/strict";
import { exceptBankLine, resolveBankLineException, resolveAndBookBankLine } from "./exception-doors";
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

test("exceptBankLine: posts the named args and returns the RPC's own narrow receipt", async () => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (u, init) => {
      seenUrl = String(u);
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ exception_id: "ex1", line_id: "l1", status: "open" });
    },
    async () => {
      const out = await exceptBankLine({ lineId: "l1", kind: "bank_error", reason: "unexplained debit" }, { session: fakeSession("tok") });
      assert.ok(seenUrl.includes("/rpc/except_bank_line"));
      assert.equal(seenBody.p_line, "l1");
      assert.equal(seenBody.p_kind, "bank_error");
      assert.equal(seenBody.p_evidence_document, null);
      assert.equal(out.exception_id, "ex1");
    },
  );
});

test("exceptBankLine: an already-excepted-line refusal surfaces VERBATIM", async () => {
  await withMockedFetch(
    async () => jsonResponse({ code: "CLR10", message: "statement line already carries an open exception", details: '{"reason":"line_already_excepted"}' }, 400),
    async () => {
      await assert.rejects(
        () => exceptBankLine({ lineId: "l1", kind: "disputed", reason: "x" }, { session: fakeSession("tok") }),
        (e: unknown) => e instanceof DoorRefusal && e.reason === "line_already_excepted",
      );
    },
  );
});

test("resolveBankLineException: sends p_counterpart_line only when supplied", async () => {
  const bodies: Record<string, unknown>[] = [];
  await withMockedFetch(
    async (_u, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse({ exception_id: "ex1", status: "resolved" });
    },
    async () => {
      await resolveBankLineException({ exceptionId: "ex1", disposition: "bank_corrective_line", note: "nets a fee reversal", counterpartLineId: "l2" }, { session: fakeSession("tok") });
      assert.equal(bodies[0]?.p_counterpart_line, "l2");
    },
  );
});

test("resolveAndBookBankLine: sends the hand-draft leg, no p_control_account key at all", async () => {
  let seenBody: Record<string, unknown> = {};
  await withMockedFetch(
    async (_u, init) => {
      seenBody = JSON.parse(String(init?.body));
      return jsonResponse({ resolution_exception_id: "ex1", branch: "live", entry_id: "e1" });
    },
    async () => {
      const out = await resolveAndBookBankLine(
        {
          clientId: "c1", exceptionId: "ex1", disposition: "written_off_adjustment", note: "uncollectable, written off",
          draft: { posting_date: "2026-04-30", memo: "write off stale credit", lines: [{ account_code: "700-000", debit_cents: 500, credit_cents: 0 }, { account_code: "601-000", debit_cents: 0, credit_cents: 500 }] },
        },
        { session: fakeSession("tok") },
      );
      assert.ok(!("p_control_account" in seenBody), "resolve_and_book_bank_line's real signature carries no p_control_account");
      assert.equal(seenBody.p_disposition, "written_off_adjustment");
      assert.ok(seenBody.p_draft);
      assert.equal(seenBody.p_allocations, null);
      assert.equal(out.branch, "live");
      assert.equal(out.entry_id, "e1");
    },
  );
});
