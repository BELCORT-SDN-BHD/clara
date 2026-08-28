// lib/registers/staff-advances-doors.ts — argument-shape + refusal-passthrough
// tests (T5 rung-6 battery: "every train's own door-wrapper tests, wire-shape
// pinning"). The wire mechanism itself is proven in doors.test.ts/read.test.ts;
// this file proves each wrapper sends the EXACT function/relation name + args
// this module's own header grounds against the live catalog census, and that a
// refusal survives verbatim through this thin layer.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loadStaffAdvanceAccounts,
  getStaffAdvanceStatement,
  getStaffAdvanceSummary,
  getStaffAdvanceTie,
  bookStaffAdvanceApplication,
  completeStaffAdvanceParticulars,
  enrolStaffAdvanceAccount,
  retireStaffAdvanceAccount,
} from "./staff-advances-doors";
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

test("loadStaffAdvanceAccounts reads staff_advance_accounts scoped by client_id, oldest-enrolled first", async () => {
  const { impl, seen } = captureFetch([]);
  await withMockedFetch(impl, async () => {
    await loadStaffAdvanceAccounts(fakeSession(), "c1");
  });
  const s = seen.first();
  assert.match(s.url, /\/rest\/v1\/staff_advance_accounts\?/);
  assert.match(s.url, /client_id=eq\.c1/);
  assert.match(s.url, /order=enrolled_at\.asc/);
});

test("getStaffAdvanceStatement posts to staff_advance_statement with p_client/p_account_code/p_from/p_to", async () => {
  const envelope = { client_id: "c1", account_code: "2100", from: null, to: "2026-08-28", opening_cents: 0, closing_cents: 0, rows: [], generations: [] };
  const { impl, seen } = captureFetch(envelope);
  await withMockedFetch(impl, async () => {
    const out = await getStaffAdvanceStatement("c1", "2100", null, null, { session: fakeSession() });
    assert.deepEqual(out, envelope);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/staff_advance_statement$/);
  assert.deepEqual(s.body, { p_client: "c1", p_account_code: "2100", p_from: null, p_to: null });
});

test("getStaffAdvanceSummary posts to staff_advance_summary with p_client/p_as_of", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", as_of: "2026-08-28", advances: [], outstanding_cents: 0, incomplete_count: 0, policy_notes: [] });
  await withMockedFetch(impl, async () => {
    await getStaffAdvanceSummary("c1", "2026-08-28", { session: fakeSession() });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/staff_advance_summary$/);
  assert.deepEqual(s.body, { p_client: "c1", p_as_of: "2026-08-28" });
});

test("getStaffAdvanceTie posts to staff_advance_tie with p_client/p_as_of", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", as_of: "2026-08-28", tie: true, accounts: [] });
  await withMockedFetch(impl, async () => {
    await getStaffAdvanceTie("c1", "2026-08-28", { session: fakeSession() });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/staff_advance_tie$/);
  assert.deepEqual(s.body, { p_client: "c1", p_as_of: "2026-08-28" });
});

test("bookStaffAdvanceApplication posts to book_staff_advance_application with every field, a fresh op_key, and returns the receipt verbatim", async () => {
  const receipt = { status: "posted", entry_id: "e1", application_ids: ["a1"], allocated_cents: 5000 };
  const { impl, seen } = captureFetch(receipt);
  const lines = [{ account_code: "5100", debit_cents: 5000, credit_cents: 0, description: "Deduction" }, { account_code: "2100", debit_cents: 0, credit_cents: 5000, description: null }];
  const allocations = [{ line_no: 2, advance_id: "adv1", amount_cents: 5000 }];
  await withMockedFetch(impl, async () => {
    const out = await bookStaffAdvanceApplication("c1", { postingDate: "2026-08-28", memo: "Payroll deduction", lines, allocations, kind: "payroll_deduction", reason: "August payroll" }, { session: fakeSession() });
    assert.deepEqual(out, receipt);
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/book_staff_advance_application$/);
  assert.equal(s.body.p_client, "c1");
  assert.equal(s.body.p_posting_date, "2026-08-28");
  assert.equal(s.body.p_memo, "Payroll deduction");
  assert.deepEqual(s.body.p_lines, lines);
  assert.deepEqual(s.body.p_allocations, allocations);
  assert.equal(s.body.p_kind, "payroll_deduction");
  assert.equal(s.body.p_reason, "August payroll");
  assert.equal(typeof s.body.p_op_key, "string");
  assert.ok((s.body.p_op_key as string).length > 0);
});

test("completeStaffAdvanceParticulars posts p_client/p_advance/p_purpose/p_reference", async () => {
  const { impl, seen } = captureFetch({ advance_id: "adv1", purpose: "Medical", reference: "CHQ-1" });
  await withMockedFetch(impl, async () => {
    await completeStaffAdvanceParticulars("c1", "adv1", "Medical", "CHQ-1", { session: fakeSession() });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/complete_staff_advance_particulars$/);
  assert.equal(s.body.p_client, "c1");
  assert.equal(s.body.p_advance, "adv1");
  assert.equal(s.body.p_purpose, "Medical");
  assert.equal(s.body.p_reference, "CHQ-1");
});

test("enrolStaffAdvanceAccount posts every argument including p_confirm_dedicated", async () => {
  const { impl, seen } = captureFetch({ enrolment_id: "en1", status: "active", client_id: "c1", account_code: "2100", person_label: "Ah Chong" });
  await withMockedFetch(impl, async () => {
    await enrolStaffAdvanceAccount("c1", "2100", "Ah Chong", true, "Not a related party.", { session: fakeSession() });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/enrol_staff_advance_account$/);
  assert.equal(s.body.p_client, "c1");
  assert.equal(s.body.p_account_code, "2100");
  assert.equal(s.body.p_person_label, "Ah Chong");
  assert.equal(s.body.p_confirm_dedicated, true);
  assert.equal(s.body.p_attestation, "Not a related party.");
});

test("retireStaffAdvanceAccount posts p_client/p_enrolment/p_reason", async () => {
  const { impl, seen } = captureFetch({ enrolment_id: "en1", status: "retired", client_id: "c1", account_code: "2100" });
  await withMockedFetch(impl, async () => {
    await retireStaffAdvanceAccount("c1", "en1", "Left the firm", { session: fakeSession() });
  });
  const s = seen.first();
  assert.match(s.url, /\/rpc\/retire_staff_advance_account$/);
  assert.equal(s.body.p_client, "c1");
  assert.equal(s.body.p_enrolment, "en1");
  assert.equal(s.body.p_reason, "Left the firm");
});

test("a governed refusal (e.g. CLR10 advance_outstanding_on_retire) survives verbatim through retireStaffAdvanceAccount", async () => {
  const { impl } = captureFetch(
    { code: "CLR10", message: "account 2100 still has at least one advance outstanding", detail: { reason: "advance_outstanding_on_retire" } },
    400,
  );
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      () => retireStaffAdvanceAccount("c1", "en1", "Left the firm", { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as { code: string }).code, "CLR10");
        assert.match((e as { message: string }).message, /outstanding/);
        return true;
      },
    );
  });
});
