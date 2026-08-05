// shared/reconApi.ts tests — mocks globalThis.fetch (the bankApi.test.ts
// idiom). [fix-wave item 4, re-verified against the LANDED 0040 text] the
// get_bank_reconciliation fixtures below are copied LITERALLY from
// packages/db/migrations/0040_wave_c_c_tieout.sql's jsonb_build_object
// blocks: receipt branch ~4043-4074, preview branch ~4238-4262, the
// recon_coa_shared labelled-unavailable branch ~4094-4104. can_complete/
// blockers[]/opening_anchor_cents/statement_opening_cents/statement_closing_
// cents/derived_closing_cents/voided_receipt (the follow-up: once no
// COMPLETE receipt exists, the preview becomes primary with the newest VOID
// receipt attached under this key) are now CONFIRMED LANDED (grep-verified
// present in the migration, the C6 amendment) — the [pending-DB] markers
// below are resolved and kept only as history in the test names.

import { test } from "node:test";
import assert from "node:assert/strict";
import { getBankReconciliation, getBankRule, resolveBankLineException, resolveAndBookBankLine, acceptBankRuleSuggestion } from "./reconApi";
import type { PgrestError } from "./wire";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

// The LITERAL receipt envelope (0040:4043-4074).
const RECEIPT_ENVELOPE = {
  preview: false, available: true,
  reconciliation_id: "r1", statement_id: "s1",
  bank_account_id: "acc1", coa_account_code: "601-000",
  prior_statement_id: "s0", prior_reconciliation_id: "r0",
  period_start: "2026-04-01", period_end: "2026-04-30", status: "complete",
  opening_cents: 5000000, statement_opening_cents: 5000000, opening_anchor_cents: 5000000,
  closing_cents: 2000000, statement_closing_cents: 2000000,
  gl_balance_cents: -3000000, outstanding_cents: -500000, excepted_cents: 0,
  completed_by: "user1", completed_at: "2026-05-01T00:00:00Z",
  voided_by: null, voided_at: null, voided_reason: null,
  first_period: true, precondition_met: true, chain_ok: true,
  stale_outstanding_ids: [],
  can_complete: false, blockers: ["recon_already_complete"],
  snapshot: {
    cutoff: "2026-05-01T00:00:00Z", coa_account_code: "601-000",
    period_start: "2026-04-01", period_end: "2026-04-30",
    statement_opening_cents: 5000000, statement_closing_cents: 2000000,
    opening_anchor_cents: 5000000, anchor_amount_cents: 5000000, bank_uncleared_opening_cents: 0,
    terms: { gl_prime_cents: -3000000, uncleared_cents: -500000, capacity_prime_cents: 0, outstanding_cents: -500000, excepted_cents: 0, matched_line_cents: -3000000 },
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [],
    exceptions: [], bank_uncleared_opening: [], reversal_pairs_excluded: [], acknowledged_outstanding: [],
  },
};

// The LITERAL preview envelope (0040:4238-4262). derived_closing_cents is
// DELIBERATELY set apart from statement_closing_cents (a nonzero difference)
// to prove computed_closing_cents reads the real derived key, not the
// statement's own printed figure.
const PREVIEW_ENVELOPE = {
  preview: true, available: true, statement_id: "s2",
  first_period: false, precondition_met: false, chain_ok: true,
  stale_outstanding_ids: [],
  can_complete: false, blockers: ["recon_line_unsettled"],
  bank_account_id: "acc1", coa_account_code: "601-000",
  period_start: "2026-05-01", period_end: "2026-05-31",
  opening_cents: 2000000, statement_opening_cents: 2000000, opening_anchor_cents: 2000000,
  closing_cents: 800000, statement_closing_cents: 800000, derived_closing_cents: 750000,
  gl_balance_cents: -1000000, outstanding_cents: -200000, excepted_cents: 0, difference_cents: -50000,
  snapshot: {
    outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [],
    exceptions: [], bank_uncleared_opening: [],
  },
};

// The LITERAL recon_coa_shared labelled-unavailable branch (0040:4094-4104)
// — no terms/snapshot key at all.
const COA_SHARED_ENVELOPE = {
  preview: true, available: false, unavailable_reason: "recon_coa_shared",
  statement_id: "s3", bank_account_id: "acc1", coa_account_code: "601-000",
  bank_account_ids: ["acc1", "acc2"],
  period_start: "2026-05-01", period_end: "2026-05-31",
  precondition_met: false, chain_ok: false, stale_outstanding_ids: [],
  can_complete: false, blockers: ["recon_coa_shared"],
};

test("getBankReconciliation maps the LITERAL receipt envelope: mode, [D8 LANDED] can_complete/blockers, [C1 LANDED] distinct opening/closing keys", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(RECEIPT_ENVELOPE));
  setup();
  const v = await getBankReconciliation("jwt", "s1");
  assert.equal(v?.mode, "receipt");
  assert.equal(v?.status, "complete");
  assert.equal(v?.terms.opening_anchor_cents, 5000000);
  assert.equal(v?.terms.statement_opening_cents, 5000000, "[C1 LANDED] no longer null on a receipt");
  assert.equal(v?.terms.statement_closing_cents, 2000000);
  assert.equal(v?.terms.computed_closing_cents, 2000000, "a receipt's computed IS the statement figure, by construction");
  assert.equal(v?.terms.difference_cents, 0, "a complete receipt is definitionally tied");
  assert.equal(v?.can_complete, false, "[D8 LANDED] a receipt is not a completable preview");
  assert.deepEqual(v?.blockers, ["recon_already_complete"]);
  assert.equal(v?.completed_by, "user1");
  assert.equal(v?.voided_receipt, null, "no voided_receipt key on this shape");
});

test("getBankReconciliation maps the LITERAL preview envelope: [D8 LANDED] can_complete/blockers, [C1 LANDED] computed_closing_cents reads derived_closing_cents (NOT closing_cents)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(PREVIEW_ENVELOPE));
  setup();
  const v = await getBankReconciliation("jwt", "s2");
  assert.equal(v?.mode, "preview");
  assert.equal(v?.precondition_met, false);
  assert.equal(v?.can_complete, false, "[D8 LANDED]");
  assert.deepEqual(v?.blockers, ["recon_line_unsettled"], "[D8 LANDED] the server's own named blocker");
  assert.equal(v?.terms.statement_opening_cents, 2000000, "[C1 LANDED]");
  assert.equal(v?.terms.statement_closing_cents, 800000, "the statement's own printed closing");
  assert.equal(v?.terms.computed_closing_cents, 750000, "[C1 LANDED] computed reads derived_closing_cents, distinct from the printed statement_closing_cents — a prior version of this mapper conflated the two");
  assert.equal(v?.terms.difference_cents, -50000);
});

test("[fail-closed] getBankReconciliation on the recon_coa_shared labelled-unavailable branch: identity terms null, the named blocker renders, snapshot degrades to unavailable (no snapshot key at all)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(COA_SHARED_ENVELOPE));
  setup();
  const v = await getBankReconciliation("jwt", "s3");
  assert.equal(v?.mode, "preview");
  assert.equal(v?.can_complete, false);
  assert.deepEqual(v?.blockers, ["recon_coa_shared"]);
  assert.equal(v?.terms.opening_anchor_cents, null, "no money is fabricated when the accounts are ambiguous");
  assert.equal(v?.terms.computed_closing_cents, null);
  assert.equal(v?.snapshot.shapeOk, false, "no known collection is present at all — must never read as a clean period");
});

test("getBankReconciliation returns null on a genuinely empty response, never a fabricated preview", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(null));
  setup();
  assert.equal(await getBankReconciliation("jwt", "s404"), null);
});

// --- [voided_receipt follow-up, LANDED] -------------------------------------------

test("getBankReconciliation maps a present, well-formed voided_receipt (status:'void') onto the primary preview", async (t) => {
  const withVoided = {
    ...PREVIEW_ENVELOPE,
    voided_receipt: {
      reconciliation_id: "r-old", status: "void",
      opening_cents: 2000000, closing_cents: 1800000,
      gl_balance_cents: -200000, outstanding_cents: 0, excepted_cents: 0,
      completed_by: "user1", completed_at: "2026-05-01T00:00:00Z",
      voided_by: "user2", voided_at: "2026-05-02T00:00:00Z", voided_reason: "wrong statement uploaded",
      snapshot: { outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [], exceptions: [], bank_uncleared_opening: [] },
    },
  };
  t.mock.method(globalThis, "fetch", async () => jsonRes(withVoided));
  setup();
  const v = await getBankReconciliation("jwt", "s2");
  assert.equal(v?.mode, "preview", "the preview stays PRIMARY — re-completion is reachable");
  assert.equal(v?.voided_receipt?.reconciliation_id, "r-old");
  assert.equal(v?.voided_receipt?.voided_reason, "wrong statement uploaded");
  assert.equal(v?.voided_receipt?.closing_cents, 1800000);
  assert.equal(v?.voided_receipt?.snapshot.shapeOk, true);
});

test("[fail-closed] getBankReconciliation degrades an absent/malformed voided_receipt to null, never guessed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(PREVIEW_ENVELOPE));
  setup();
  const absent = await getBankReconciliation("jwt", "s2");
  assert.equal(absent?.voided_receipt, null, "no void receipt on this statement — the key is present but null");

  t.mock.method(globalThis, "fetch", async () => jsonRes({ ...PREVIEW_ENVELOPE, voided_receipt: { status: "complete" } }));
  const wrongStatus = await getBankReconciliation("jwt", "s2");
  assert.equal(wrongStatus?.voided_receipt, null, "a non-'void' status is not this key's contract — never rendered as a voided receipt");

  t.mock.method(globalThis, "fetch", async () => jsonRes({ ...PREVIEW_ENVELOPE, voided_receipt: "not an object" }));
  const garbage = await getBankReconciliation("jwt", "s2");
  assert.equal(garbage?.voided_receipt, null);
});

// --- [D4/A9 fix] getBankRule reads via list_bank_rules(p_client) ----------------

test("[D4 fix] getBankRule posts p_client to list_bank_rules (not the nonexistent get_bank_rule) and picks the row by id", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes([
      { rule_id: "r1", client_id: "c1", kind: "coding", status: "proposed", pattern: {}, proposal: { account_code: "620-000" }, sighting_count: 3 },
      { rule_id: "r2", client_id: "c1", kind: "match_settle", status: "signed", pattern: {}, proposal: {}, sighting_count: 5, retired_reason: null },
    ]);
  });
  setup();
  const rule = await getBankRule("jwt", "c1", "r2");
  assert.ok(seenUrl.includes("/rpc/list_bank_rules"));
  assert.equal(seenBody.p_client, "c1");
  assert.equal(rule?.status, "signed");
  assert.equal(rule?.kind, "match_settle");
});

test("[D4 fix] getBankRule returns null when the rule id is not in this client's register (never throws)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([{ rule_id: "r1" }]));
  setup();
  assert.equal(await getBankRule("jwt", "c1", "r-missing"), null);
});

// --- [D5/A12 fix] resolveBankLineException never sends p_booking_entries -------

test("[D5 fix] resolveBankLineException never sends p_booking_entries — the verb has no such parameter", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ exception_id: "e1", status: "resolved", disposition: "bank_corrective_line" });
  });
  setup();
  await resolveBankLineException("jwt", { clientId: "c1", exceptionId: "e1", disposition: "bank_corrective_line", note: "offsets line l2", counterpartLineId: "l2" });
  assert.ok(!("p_booking_entries" in seenBody), "no caller-supplied path exists for this parameter — the verb 404s on it");
  assert.equal(seenBody.p_counterpart_line, "l2");
  assert.equal(seenBody.p_exception, "e1");
});

test("[D5 fix] resolveBankLineException omits p_counterpart_line when none is supplied", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ exception_id: "e1", status: "resolved" });
  });
  setup();
  await resolveBankLineException("jwt", { clientId: "c1", exceptionId: "e1", disposition: "matched_booking", note: "booked" });
  assert.ok(!("p_counterpart_line" in seenBody));
  assert.ok(!("p_booking_entries" in seenBody));
});

// --- [round-7 F-F2] resolveAndBookBankLine carries p_advance_applications ------
//
// The finding: `advanceApplications` existed only in this wrapper's TYPE — no
// component ever SET it, so the AF-2 advance-repayment channel was surface-dead
// (measured: `apps/dashboard/app/bank/ExceptionBookingFields.tsx`'s hand-draft
// leg had no field for it at all). These cells pin the WIRE half of that fix —
// byte-exact forwarding into `p_advance_applications`, and that a DB refusal on
// this channel (CLR40 `advance_application_missing`) is never swallowed — the
// half this lane owns without touching the un-owned composer file itself.

const ADVANCE_PAYLOAD = {
  kind: "bank_return", reason: "the transfer is the returned advance",
  allocations: [{ line_no: 2, advance_id: "adv-1", amount_cents: 30000 }],
};
const ADV_DRAFT = {
  posting_date: "2026-05-15", memo: "advance returned",
  lines: [
    { account_code: "601-000", debit_cents: 30000, credit_cents: 0 },
    { account_code: "350-003", debit_cents: 0, credit_cents: 30000 },
  ],
};

test("[F-F2] resolveAndBookBankLine forwards p_advance_applications VERBATIM (ABI §A copies it byte-for-byte); absent stays null", async (t) => {
  let body: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    body = JSON.parse(String(init?.body));
    return jsonRes({ branch: "live", entry_id: "e1" });
  });
  setup();
  await resolveAndBookBankLine("jwt", {
    clientId: "c1", exceptionId: "exc1", disposition: "matched_booking",
    note: "the deposit is ACME's invoice 42", draft: ADV_DRAFT, advanceApplications: ADVANCE_PAYLOAD,
  });
  assert.deepEqual(body.p_advance_applications, ADVANCE_PAYLOAD, "the payload rides through unchanged — the DB copies it verbatim into flags");

  await resolveAndBookBankLine("jwt", {
    clientId: "c1", exceptionId: "exc1", disposition: "matched_booking", note: "n", draft: ADV_DRAFT,
  });
  assert.equal(body.p_advance_applications, null, "an unset advance payload sends SQL null, never undefined (PostgREST drops the key otherwise)");
});

test("[F-F2] a CLR40 advance_application_missing refusal from the DB is never swallowed — it reaches the caller with its reason and figures intact", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({
      message: "line 2 credits 30000 cents on staff-advance account 350-003 but the allocations account for 0 cents; state one allocation per advance so the two agree exactly",
      details: JSON.stringify({ reason: "advance_application_missing", axis: "under", line_no: 2, account_code: "350-003", credit_cents: 30000, allocated_cents: 0 }),
      code: "CLR40",
    }),
    { status: 400, headers: { "content-type": "application/json" } },
  ));
  setup();
  await assert.rejects(
    () => resolveAndBookBankLine("jwt", {
      clientId: "c1", exceptionId: "exc1", disposition: "matched_booking", note: "n", draft: ADV_DRAFT,
    }),
    (e: unknown) => {
      const pe = e as PgrestError;
      assert.equal(pe.clr, "CLR40");
      assert.equal(pe.reason, "advance_application_missing");
      assert.match(pe.message ?? "", /state one allocation per advance/i, "the DB's own remedy text must reach the caller verbatim");
      return true;
    },
  );
});

// --- [D-b2] acceptBankRuleSuggestion — the SECOND reconApi wrapper, deferred from D-b3 with
// the producer's clara_authenticated grant (CF-B3-1/CX1). The coding chip's upgraded action
// (StatementDetail.tsx's span->button change): direct-INSERTs a `bank_rule_suggested` draft
// from a live suggestion, in one call, no separate generic-draft composer.

test("acceptBankRuleSuggestion posts p_client/p_line/p_rule + a fresh p_op_key, and maps entry_id straight off the receipt", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ entry_id: "e42" });
  });
  setup();
  const out = await acceptBankRuleSuggestion("jwt", "c1", "line1", "rule1");
  assert.ok(seenUrl.includes("/rpc/accept_bank_rule_suggestion"));
  assert.equal(seenBody.p_client, "c1");
  assert.equal(seenBody.p_line, "line1");
  assert.equal(seenBody.p_rule, "rule1");
  assert.equal(typeof seenBody.p_op_key, "string", "every write carries a fresh op_key (firm,fn,op_key idempotency)");
  assert.ok((seenBody.p_op_key as string).length > 0);
  assert.deepEqual(out, { entry_id: "e42" });
});

test("acceptBankRuleSuggestion returns entry_id:null on a receipt shape that carries no string id (defensive, never throws on this)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({}));
  setup();
  assert.deepEqual(await acceptBankRuleSuggestion("jwt", "c1", "line1", "rule1"), { entry_id: null });
});

test("acceptBankRuleSuggestion: a role-level 42501 refusal (the producer's grant withheld, e.g. mid-rollout before 0045's S2.9-b3 lands) reaches the caller as a plain PgrestError — no CLR, no reason, honest pass-through", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(
    JSON.stringify({ message: "permission denied for function accept_bank_rule_suggestion", code: "42501" }),
    { status: 403, headers: { "content-type": "application/json" } },
  ));
  setup();
  await assert.rejects(
    () => acceptBankRuleSuggestion("jwt", "c1", "line1", "rule1"),
    (e: unknown) => {
      const pe = e as PgrestError;
      assert.equal(pe.pgCode, "42501");
      assert.equal(pe.status, 403);
      assert.equal(pe.clr, null, "42501 is a role-level denial, not a governed CLRxx business refusal — never coerced into looking like one");
      assert.equal(pe.reason, null, "no reason token: a bare role denial carries no DETAIL json for describeBankRefusal to map");
      assert.match(pe.message ?? "", /permission denied/i, "the DB's own message reaches the caller verbatim");
      return true;
    },
  );
});
