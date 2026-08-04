// shared/advancesApi.ts tests — mocks globalThis.fetch (the assetsApi.test.ts /
// agingApi.test.ts idiom).
//
// THE FIXTURES ARE REAL, NOT SHAPED BY HAND. Every envelope below was CAPTURED
// off a rig database carrying migration 0042 by calling the RPC itself
// (`clara.staff_advance_summary/statement/tie` as a firm member) and pasting the
// jsonb back, ids and all — only the row COUNT is trimmed. That is the whole
// point of this file: the round-2 as-built finding was that all three reads were
// unwrapped with `Array.isArray(out) ? out : []`, which is ALWAYS false on the
// object envelope these functions really return, so /advances rendered
// permanently empty over a populated register and the tie strip read as
// "nothing to reconcile". A guessed fixture would have reproduced the guess.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  staffAdvanceSummary, staffAdvanceStatement, staffAdvanceTie, getStaffAdvance,
  enrolStaffAdvanceAccount, retireStaffAdvanceAccount, completeStaffAdvanceParticulars,
  bookStaffAdvanceApplication,
} from "./advancesApi";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

// --- captured 2026-08-03 off a 0042 rig (clara.staff_advance_summary) ---------
const SUMMARY_ENVELOPE = {
  as_of: "2026-08-03",
  client_id: "567aa2d4-776c-4e76-9c82-e019e632c2fd", // gitleaks:allow -- the sandbox client UUID captured with this envelope, a tenant identifier and not a credential
  outstanding_cents: 300000,
  incomplete_count: 4,
  advances: [{
    voided: false, purpose: null, reference: null,
    advance_id: "3a6d8f07-beb2-4d90-ba5c-21fb17f08297",
    issue_date: "2026-05-04", account_code: "350-V42", amount_cents: 1500000,
    enrolment_id: "300111aa-fb81-45dd-a5a7-a784d7fdf062", person_label: "Staff a1",
    days_outstanding: 91, enrolment_active: true, outstanding_cents: 300000,
    particulars_complete: false,
  }],
  policy_notes: [
    { fact: "s22_prior_month_wage_cap", note: "An advance of wages not yet earned may not exceed the wages earned in the immediately preceding month", source_note: "EA 1955 s.22 (primary text; research record 2026-08-01)" },
    { fact: "s27_no_interest", note: "Interest on advances is prohibited", source_note: "EA 1955 s.27" },
  ],
};

// --- captured 2026-08-03 (clara.staff_advance_statement) ----------------------
const STATEMENT_ENVELOPE = {
  to: "2026-08-03", from: null,
  client_id: "567aa2d4-776c-4e76-9c82-e019e632c2fd", // gitleaks:allow -- same captured tenant identifier, not a credential
  account_code: "350-V42", opening_cents: 0, closing_cents: 300000,
  rows: [
    { date: "2026-05-04", kind: "disbursement", reason: null, entry_id: "b2bdabb7-66d5-443f-8d98-f534e8a540ca", advance_id: "3a6d8f07-beb2-4d90-ba5c-21fb17f08297", amount_cents: 1500000, running_cents: 1500000, application_kind: null },
    { date: "2026-06-11", kind: "application", reason: "x42 a1 high stakes", entry_id: "bd307a47-1976-4bac-850f-ea0d5790db3f", advance_id: "3a6d8f07-beb2-4d90-ba5c-21fb17f08297", amount_cents: -1200000, running_cents: 300000, application_kind: "bank_return" },
  ],
  generations: [{
    active: true, retired_at: null,
    attestation: "x42 attestation: dedicated single-person advance account; not a related party.",
    enrolled_at: "2026-08-03T00:05:09.959493+08:00",
    enrolment_id: "300111aa-fb81-45dd-a5a7-a784d7fdf062", person_label: "Staff a1",
  }],
};

// --- captured 2026-08-03 (clara.staff_advance_tie) ---------------------------
const TIE_ENVELOPE = {
  tie: true, as_of: "2026-08-03", client_id: "567aa2d4-776c-4e76-9c82-e019e632c2fd", // gitleaks:allow -- same captured tenant identifier, not a credential
  accounts: [{
    gl_cents: 300000, explained: true, account_code: "350-V42", advance_count: 4,
    register_cents: 300000, difference_cents: 0, incomplete_count: 4,
    active_enrolment_id: "300111aa-fb81-45dd-a5a7-a784d7fdf062", out_of_window_cents: 0,
  }],
};

// --- reads: the envelope really reaches the screen ---------------------------

test("staffAdvanceSummary posts p_client/p_as_of and unwraps the REAL object envelope — rows, the DB's open total, and the ENVELOPE-level EA 1955 notes", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(SUMMARY_ENVELOPE);
  });
  setup();
  const read = await staffAdvanceSummary("jwt", "567aa2d4-776c-4e76-9c82-e019e632c2fd", "2026-08-03");
  assert.ok(seenUrl.includes("/rpc/staff_advance_summary"));
  assert.equal(seenBody.p_as_of, "2026-08-03");
  assert.equal(read.available, true);
  assert.equal(read.advances.length, 1, "a POPULATED register must not render as empty (the round-2 defect)");
  assert.equal(read.advances[0]?.person_label, "Staff a1");
  assert.equal(read.advances[0]?.outstanding_cents, 300000);
  assert.equal(read.advances[0]?.particulars_complete, false);
  assert.equal(read.advances[0]?.enrolment_active, true);
  assert.equal(read.outstanding_cents, 300000, "the register's open total is the DB's, read off the envelope");
  assert.equal(read.incomplete_count, 4);
  assert.equal(read.policy_notes.length, 2, "policy_notes is an ENVELOPE key, not a per-row key");
  assert.equal(read.policy_notes[0]?.source_note, "EA 1955 s.22 (primary text; research record 2026-08-01)");
});

test("staffAdvanceStatement unwraps rows + the DB's opening/closing balances + every enrolment generation", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes(STATEMENT_ENVELOPE);
  });
  setup();
  const read = await staffAdvanceStatement("jwt", "c1", "350-V42", "2025-08-03", "2026-08-03");
  assert.equal(seenBody.p_account_code, "350-V42");
  assert.equal(read.available, true);
  assert.equal(read.rows.length, 2, "a populated statement must not render as empty");
  assert.equal(read.rows[1]?.running_cents, 300000, "the running balance is the DB's, rendered verbatim");
  assert.equal(read.rows[1]?.application_kind, "bank_return");
  assert.equal(read.opening_cents, 0);
  assert.equal(read.closing_cents, 300000);
  assert.equal(read.generations[0]?.person_label, "Staff a1", "the generations are named so a re-issued code cannot read as one person's history");
});

test("staffAdvanceTie unwraps the tie envelope AND reads `explained` as the BOOLEAN the DB returns", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(TIE_ENVELOPE));
  setup();
  const read = await staffAdvanceTie("jwt", "c1", "2026-08-03");
  assert.equal(read.available, true);
  assert.equal(read.tie, true);
  assert.equal(read.accounts.length, 1, "an empty tie strip over a populated register reads as 'nothing to reconcile'");
  assert.equal(read.accounts[0]?.register_cents, 300000);
  assert.equal(read.accounts[0]?.gl_cents, 300000);
  assert.equal(read.accounts[0]?.difference_cents, 0);
  assert.equal(read.accounts[0]?.explained, true, "staff_advance_tie returns `explained` as a boolean (register_cents = gl_cents)");
  assert.equal(read.accounts[0]?.advance_count, 4);
});

test("a WRONG shape (a bare array — what this file used to assume) reads as UNAVAILABLE, never as a confident empty", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  setup();
  assert.equal((await staffAdvanceSummary("jwt", "c1", "2026-08-03")).available, false);
  assert.equal((await staffAdvanceTie("jwt", "c1", "2026-08-03")).available, false);
  assert.equal((await staffAdvanceStatement("jwt", "c1", "350-V42", "2026-01-01", "2026-08-03")).available, false);
});

test("getStaffAdvance reads THROUGH the summary envelope and picks the row by advance_id", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes(SUMMARY_ENVELOPE));
  setup();
  const hit = await getStaffAdvance("jwt", "c1", "3a6d8f07-beb2-4d90-ba5c-21fb17f08297");
  assert.equal(hit.advance?.amount_cents, 1500000);
  assert.equal(hit.available, true);
  assert.equal(hit.as_of, "2026-08-03", "the card renders the date the DB actually answered as of");
  const miss = await getStaffAdvance("jwt", "c1", "not-on-the-register");
  assert.equal(miss.advance, null, "an id not on the register is an honest null, never a throw");
  assert.equal(miss.available, true, "…and 'not on the register' is a KNOWN answer, not an unavailable one");
});

// === ROUND-3 CELLS — the browser-UTC as-of bug and the card's honest empties ===
// These ask the questions the old cell did not: WHICH DATE was sent, and can the
// caller tell "not found" apart from "could not ask"?

test("[round-3 red/green] getStaffAdvance sends p_as_of NULL — the DB owns the date, never the browser's UTC clock", async (t) => {
  let seenBody: Record<string, unknown> = {};
  let seenKeys: string[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    seenKeys = Object.keys(seenBody);
    return jsonRes(SUMMARY_ENVELOPE);
  });
  setup();
  await getStaffAdvance("jwt", "c1", "3a6d8f07-beb2-4d90-ba5c-21fb17f08297");
  // FAILS on the old build, which sent `new Date().toISOString().slice(0,10)`:
  // the browser's UTC date, which for the eight hours 00:00-08:00 MYT is
  // YESTERDAY in Asia/Kuala_Lumpur — and staff_advance_summary filters
  // `issue_date <= as_of`, so an advance issued today vanished from the card.
  assert.equal(seenBody.p_as_of, null,
    "p_as_of must be SQL null so clara._fa_today() (Asia/Kuala_Lumpur) decides the register date");
  // …and the named argument must still be SENT: PostgREST resolves an overload
  // by the exact set of named arguments, and this function declares no default.
  assert.ok(seenKeys.includes("p_as_of"), "p_as_of must be present-as-null, never omitted");
  assert.equal(seenBody.p_client, "c1");
});

test("[round-3] a WRONG-SHAPED register envelope reads as UNAVAILABLE, never as 'no such advance'", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  setup();
  const read = await getStaffAdvance("jwt", "c1", "3a6d8f07-beb2-4d90-ba5c-21fb17f08297");
  assert.equal(read.available, false, "the shape signal must survive all the way to the card");
  assert.equal(read.advance, null);
});

test("[round-3] a GOVERNED refusal still THROWS, so the card renders the DB's verbatim message", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ code: "CLR11", message: "client is not in your firm", details: '{"reason":"wrong_firm"}' }, 400));
  setup();
  await assert.rejects(
    () => getStaffAdvance("jwt", "c1", "adv-1"),
    /client is not in your firm/,
    "swallowing this would replace a governed refusal with a silent empty card",
  );
});

// --- actions: every write mints a FRESH op_key per call ----------------------

test("action verbs each POST a fresh p_op_key, never a shared/reused one", async (t) => {
  const seenKeys: string[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    if (typeof body.p_op_key === "string") seenKeys.push(body.p_op_key);
    return jsonRes({});
  });
  setup();
  await enrolStaffAdvanceAccount("jwt", { clientId: "c1", accountCode: "350-000", personLabel: "Aisyah", confirmDedicated: true, attestation: "not a related party" });
  await retireStaffAdvanceAccount("jwt", "c1", "enrol-1", "left the firm");
  await completeStaffAdvanceParticulars("jwt", "c1", "adv-1", "travel float", "REQ-9");
  await bookStaffAdvanceApplication("jwt", {
    clientId: "c1", postingDate: "2026-08-03", memo: "payroll recovery",
    lines: [{ account_code: "500-000", debit_cents: 0, credit_cents: 10000 }, { account_code: "350-000", debit_cents: 0, credit_cents: 0 }],
    allocations: [{ line_no: 1, advance_id: "adv-1", amount_cents: 10000 }],
    kind: "payroll_deduction", reason: "August payroll",
  });
  assert.equal(seenKeys.length, 4, "every action call must carry a p_op_key");
  assert.equal(new Set(seenKeys).size, seenKeys.length, "no two action calls may share an op_key");
});
