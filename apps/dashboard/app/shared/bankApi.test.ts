// shared/bankApi.ts tests — mocks globalThis.fetch (the openingApi.test.ts /
// counterpartyApi.test.ts idiom). No live DB; every fn here calls an ASSUMED read
// RPC or an EXACT-signature write verb (see bankApi.ts's own header note) — these
// tests pin the WIRE SHAPE this lane sends, not DB behaviour.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  listBankAccounts, listBankAccountProposals, getBankStatement, getBanksInterviewAnswer,
  addBankAccount, enterBankStatement, deactivateBankAccount, remapBankAccountCoa,
  matchBankLine, unmatchBankMatch, settleFromBankLine, completePendingMatch, voidBankStatement,
} from "./bankApi";
import type { PgrestError } from "./wire";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
function setup() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
}

// --- reads: defensive mapping + URL shape ---------------------------------------

test("listBankAccounts posts list_bank_accounts with p_client and maps rows", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes([{ id: "acc1", bank_code: "MBB", bank_name_display: "Maybank current", account_number: "1-2-3", coa_account_code: "601-000" }]);
  });
  setup();
  const rows = await listBankAccounts("jwt", "client-1");
  assert.ok(seenUrl.includes("/rpc/list_bank_accounts"));
  assert.equal(seenBody.p_client, "client-1");
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.bank_name_display, "Maybank current");
});

test("listBankAccountProposals degrades a non-array reply to []", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ not: "an array" }));
  setup();
  assert.deepEqual(await listBankAccountProposals("jwt", "client-1"), []);
});

test("getBankStatement returns null when the RPC carries no statement (never throws)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({}));
  setup();
  assert.equal(await getBankStatement("jwt", "s1"), null);
});

test("getBankStatement maps header + lines together", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    jsonRes({ statement: { id: "s1", bank_account_id: "acc1", period_start: "2026-04-01", period_end: "2026-04-30", opening_cents: 0, closing_cents: -500 }, lines: [{ id: "l1", statement_id: "s1", line_no: 1, entry_date: "2026-04-05", amount_cents: -500, match_state: "live" }] }));
  setup();
  const detail = await getBankStatement("jwt", "s1");
  assert.equal(detail?.statement.id, "s1");
  assert.equal(detail?.lines.length, 1);
  assert.equal(detail?.lines[0]?.match_state, "live");
});

// --- getBanksInterviewAnswer: composed read, degrades to null -------------------

test("getBanksInterviewAnswer returns the 'banks' item's answer verbatim", async (t) => {
  let call = 0;
  t.mock.method(globalThis, "fetch", async () => {
    call += 1;
    if (call === 1) return jsonRes([{ id: "plan1", revision_token: "r1", state: "committed" }]); // getClientPlan
    return jsonRes([{ id: "it1", plan_id: "plan1", firm_id: "f1", item_kind: "capture", item_key: "banks", question: null, answer: "Maybank 1234-5678", state: "answered", required_for_commit: false, answered_by: null, answered_at: null, created_at: "", updated_at: "" }]); // listPlanItems
  });
  setup();
  assert.equal(await getBanksInterviewAnswer("jwt", "client-1"), "Maybank 1234-5678");
});

test("getBanksInterviewAnswer degrades to null when the client has no committed plan", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes([]));
  setup();
  assert.equal(await getBanksInterviewAnswer("jwt", "client-1"), null);
});

// --- writers: exact arg shape + fresh op_key ------------------------------------

test("addBankAccount omits p_proposal_id when absent, sends it when supplied", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ bank_account_id: "acc1" });
  });
  setup();
  await addBankAccount("jwt", { clientId: "c1", bankCode: "MBB", accountNumber: "1-2-3", bankNameDisplay: "Maybank current", coaAccountCode: "601-000" });
  assert.ok(!("p_proposal_id" in (bodies[0] ?? {})));
  await addBankAccount("jwt", { clientId: "c1", bankCode: "MBB", accountNumber: "1-2-3", bankNameDisplay: "Maybank current", coaAccountCode: "601-000", proposalId: "prop1" });
  assert.equal(bodies[1]?.p_proposal_id, "prop1");
  assert.notEqual(bodies[0]?.p_op_key, bodies[1]?.p_op_key, "a fresh op_key every call");
});

test("addBankAccount throws when the DB returns no id (never fabricates one)", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({}));
  setup();
  await assert.rejects(() => addBankAccount("jwt", { clientId: "c1", bankCode: "MBB", accountNumber: "1", bankNameDisplay: "x", coaAccountCode: "601-000" }));
});

test("deactivateBankAccount / remapBankAccountCoa post the named args verbatim", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  const urls: string[] = [];
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    urls.push(u);
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({});
  });
  setup();
  await deactivateBankAccount("jwt", "c1", "acc1", "closed by the bank");
  assert.ok(urls[0]?.includes("/rpc/deactivate_bank_account"));
  assert.equal(bodies[0]?.p_reason, "closed by the bank");
  await remapBankAccountCoa("jwt", "c1", "acc1", "602-000");
  assert.ok(urls[1]?.includes("/rpc/remap_bank_account_coa"));
  assert.equal(bodies[1]?.p_new_coa_account_code, "602-000"); // the verbs as-built arg name
});

test("enterBankStatement posts p_header/p_lines verbatim under enter_bank_statement", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ statement_id: "s1" });
  });
  setup();
  const header = { period_start: "2026-04-01", period_end: "2026-04-30", statement_date: "2026-04-30", opening_cents: 0, closing_cents: -500, total_debit_cents: 500, total_credit_cents: 0, currency: null };
  const lines = [{ line_no: 1, entry_date: "2026-04-05", value_date: null, description: "fee", amount_cents: -500, running_balance_cents: -500 }];
  const out = await enterBankStatement("jwt", { clientId: "c1", bankAccountId: "acc1", documentId: "doc1", header, lines });
  assert.ok(seenUrl.includes("/rpc/enter_bank_statement"));
  assert.deepEqual(seenBody.p_header, header);
  assert.deepEqual(seenBody.p_lines, lines);
  assert.equal(out.statement_id, "s1");
});

test("voidBankStatement propagates a governed refusal as a typed PgrestError", async (t) => {
  t.mock.method(globalThis, "fetch", async () => jsonRes({ code: "CLR10", message: "refused", details: '{"reason":"live_bank_match_present"}' }, 400));
  setup();
  await assert.rejects(
    () => voidBankStatement("jwt", "c1", "s1", "duplicate upload"),
    (e: PgrestError) => {
      assert.equal(e.clr, "CLR10");
      assert.equal(e.reason, "live_bank_match_present");
      return true;
    },
  );
});

test("matchBankLine defaults p_adjustments to null and p_ack_period_exceptions to false", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ match_id: "m1" });
  });
  setup();
  await matchBankLine("jwt", { clientId: "c1", lineIds: ["l1", "l2"], entries: [{ entry_id: "e1", matched_cents: -1500 }] });
  assert.deepEqual(seenBody.p_lines, ["l1", "l2"]);
  assert.equal(seenBody.p_adjustments, null);
  assert.equal(seenBody.p_ack_period_exceptions, false);
});

test("matchBankLine passes adjustments + the ack flag through when supplied", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ match_id: "m1" });
  });
  setup();
  await matchBankLine("jwt", {
    clientId: "c1", lineIds: ["l1"], entries: [{ entry_id: "e1", matched_cents: -1000 }],
    adjustments: [{ account_code: "700-000", amount_cents: -50 }], ackPeriodExceptions: true,
  });
  assert.deepEqual(seenBody.p_adjustments, [{ account_code: "700-000", amount_cents: -50 }]);
  assert.equal(seenBody.p_ack_period_exceptions, true);
});

test("matchBankLine omits p_via_rule on a plain human match, sends it when confirmed from a suggestion (C-c splice #4)", async (t) => {
  const bodies: Record<string, unknown>[] = [];
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    return jsonRes({ match_id: "m1" });
  });
  setup();
  await matchBankLine("jwt", { clientId: "c1", lineIds: ["l1"], entries: [{ entry_id: "e1", matched_cents: -1000 }] });
  assert.ok(!("p_via_rule" in (bodies[0] ?? {})), "the 0038 arity is untouched when no rule was confirmed");
  await matchBankLine("jwt", {
    clientId: "c1", lineIds: ["l1"], entries: [{ entry_id: "e1", matched_cents: -1000 }], viaRuleId: "rule1",
  });
  assert.equal(bodies[1]?.p_via_rule, "rule1", "the 0040 overload resolves when a suggestion was confirmed");
});

test("unmatchBankMatch posts p_reason under unmatch_bank_match", async (t) => {
  let seenUrl = "";
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (u: string, init?: RequestInit) => {
    seenUrl = u;
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({});
  });
  setup();
  await unmatchBankMatch("jwt", "c1", "m1", "wrong line selected");
  assert.ok(seenUrl.includes("/rpc/unmatch_bank_match"));
  assert.equal(seenBody.p_reason, "wrong line selected");
});

test("settleFromBankLine sends the full pinned arg list with its stated defaults", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ entry_id: "e1", match_id: "m1", status: "approved" });
  });
  setup();
  const receipt = await settleFromBankLine("jwt", {
    clientId: "c1", lineId: "l1", counterpartyId: "cp1",
    allocations: [{ item_id: "i1", amount_cents: 10000 }], memo: "settle inv-1",
  });
  assert.equal(seenBody.p_posting_date, null, "defaults to null — the DB defaults to the line's entry_date");
  assert.equal(seenBody.p_charge_cents, 0);
  assert.equal(seenBody.p_charge_account, null);
  assert.equal(seenBody.p_adjustments, null);
  assert.equal(seenBody.p_attestation, null);
  assert.equal(seenBody.p_control_account, null);
  assert.equal(receipt.status, "approved");
  assert.ok(!("p_via_rule" in seenBody), "the 0038 arity is untouched when no rule was confirmed");
});

test("settleFromBankLine sends p_via_rule when confirmed from a suggestion (C-c splice #4)", async (t) => {
  let seenBody: Record<string, unknown> = {};
  t.mock.method(globalThis, "fetch", async (_u: string, init?: RequestInit) => {
    seenBody = JSON.parse(String(init?.body));
    return jsonRes({ entry_id: "e1", match_id: "m1", status: "approved" });
  });
  setup();
  await settleFromBankLine("jwt", {
    clientId: "c1", lineId: "l1", counterpartyId: "cp1",
    allocations: [{ item_id: "i1", amount_cents: 10000 }], memo: "settle inv-1", viaRuleId: "rule1",
  });
  assert.equal(seenBody.p_via_rule, "rule1");
});

test("completePendingMatch posts p_match under complete_pending_match", async (t) => {
  let seenUrl = "";
  t.mock.method(globalThis, "fetch", async (u: string) => {
    seenUrl = u;
    return jsonRes({ match_id: "m1", status: "live" });
  });
  setup();
  const receipt = await completePendingMatch("jwt", "c1", "m1");
  assert.ok(seenUrl.includes("/rpc/complete_pending_match"));
  assert.equal(receipt.status, "live");
});
