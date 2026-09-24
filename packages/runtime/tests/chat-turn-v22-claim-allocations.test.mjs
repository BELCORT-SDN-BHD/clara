// chatTurn_v22 — roster entry A5 (#931): one claim may come off several advances.
//
// THE REGISTER REFUSES A SILENT FIFO, and that is the whole shape of this entry. A claim that
// discharges two advances names WHICH advance and HOW MANY SEN come off each, in the order a
// person confirmed, and the tool refuses to send a split nobody has agreed to.
//
// WHAT THIS FILE PROVES:
//   1. The successor carrier is a NEW module: `lib/staff-expense-claim-basis.ts` is frozen and
//      stays byte-untouched; only the `advance_application` arm moves, and the other two arms,
//      `sharedShape`, the claimant and the item schema are carried BY REFERENCE.
//   2. `allocations_confirmed` is TOOL-LOCAL and never reaches the wire.
//   3. `claimFromInput`'s `advance_id` fallback is the FIRST allocation's, which is what makes a
//      single-line split identical to the `advance_id`-only claim 0221 already admits.
//   4. The three new local refusals mirror 0301's payload half, field path for field path.
//   5. `proposeAllocationsByDate` is oldest-first, ties by advance id, min(outstanding,remaining),
//      and it NEVER invents the difference when the advances cannot cover the claim.
//   6. The stanza carries #931's paragraph and the tool description says "never decide a split".
//
// NO DATABASE IS NEEDED HERE.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1 = await import("../lib/staff-expense-claim-basis.ts");
const v2 = await import("../lib/staff-expense-claim-basis.v2.ts");
const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};
const ADV_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ADV_B = "bbbbbbbb-0000-4000-8000-000000000002";

/** An advance-application claim totalling 12850 sen over two items. */
function claim(extra = {}) {
  return {
    settlement: "advance_application",
    claimant: { enrolment_id: "cccccccc-0000-4000-8000-000000000003" },
    source_kind: "instruction",
    instruction: "Settle Aisha's March trip against her advances",
    incurred_date: "2026-03-10",
    posting_date: "2026-03-31",
    items: [
      { description: "Flight", expense_account_code: "6200", amount_cents: 10000 },
      { description: "Taxi", expense_account_code: "6200", amount_cents: 2850 },
    ],
    advance_account_code: "1240",
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// 1 · the schema — one arm moves, the rest are carried
// ---------------------------------------------------------------------------

test("v22.claim: only the advance_application arm moves; the other two are the frozen ones", () => {
  // BY REFERENCE, not re-spelled: a second copy of a claimant schema is a second rule that can
  // drift from the door's.
  assert.equal(v2.reimbursementClaimInputSchema, v1.reimbursementClaimInputSchema);
  assert.equal(v2.alreadySettledClaimInputSchema, v1.alreadySettledClaimInputSchema);
  assert.equal(v2.claimantInputSchema, v1.claimantInputSchema);
  assert.equal(v2.claimItemInputSchema, v1.claimItemInputSchema);
  assert.notEqual(v2.advanceApplicationClaimInputSchemaV2, v1.advanceApplicationClaimInputSchema);
});

test("v22.claim: the arm gains three keys and advance_id becomes optional", () => {
  const before = Object.keys(v1.advanceApplicationClaimInputSchema.shape);
  const after = Object.keys(v2.advanceApplicationClaimInputSchemaV2.shape);
  assert.deepEqual(after.filter((k) => !before.includes(k)).sort(),
    ["advance_allocations", "allocations_confirmed"]);
  assert.deepEqual(before.filter((k) => !after.includes(k)), []);
  // ONE advance is still the same claim it always was — advance_id alone parses.
  assert.equal(v2.startStaffExpenseClaimWorkInputSchemaV2.safeParse(claim({ advance_id: ADV_A })).success, true);
  // and so is a confirmed split with no advance_id at all
  assert.equal(
    v2.startStaffExpenseClaimWorkInputSchemaV2.safeParse(claim({
      advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_B, amount_cents: 2850 }],
      allocations_confirmed: true,
    })).success,
    true,
  );
  // still `.strict()`: an invented key is refused rather than dropped on the way to a durable record
  assert.equal(
    v2.startStaffExpenseClaimWorkInputSchemaV2.safeParse(claim({ advance_id: ADV_A, fifo: true })).success,
    false,
  );
});

// ---------------------------------------------------------------------------
// 2 · the wire — the flag is the conversation's, never the record's
// ---------------------------------------------------------------------------

test("v22.claim: allocations_confirmed NEVER reaches the wire", () => {
  const wire = v2.claimFromInputV2(claim({
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_B, amount_cents: 2850 }],
    allocations_confirmed: true,
  }));
  assert.equal(Object.prototype.hasOwnProperty.call(wire, "allocations_confirmed"), false,
    "the door judges the list, not the conversation that produced it");
  assert.deepEqual(wire.advance_allocations, [
    { advance_id: ADV_A, amount_cents: 10000 },
    { advance_id: ADV_B, amount_cents: 2850 },
  ]);
});

test("v22.claim: advance_id falls back to the FIRST allocation's", () => {
  const wire = v2.claimFromInputV2(claim({
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_B, amount_cents: 2850 }],
    allocations_confirmed: true,
  }));
  assert.equal(wire.advance_id, ADV_A, "#931: out.advance_id = input.advance_id ?? allocations[0].advance_id");
  // and an explicit advance_id wins, because a caller that states one has stated the primary
  const stated = v2.claimFromInputV2(claim({
    advance_id: ADV_B,
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_B, amount_cents: 2850 }],
    allocations_confirmed: true,
  }));
  assert.equal(stated.advance_id, ADV_B);
});

test("v22.claim: a single-advance claim is byte-identical to what 0221 already admits", () => {
  const before = v1.claimFromInput(claim({ advance_id: ADV_A }));
  const after = v2.claimFromInputV2(claim({ advance_id: ADV_A }));
  assert.deepEqual(after, before, "a widened argument must not change the claim nobody widened");
});

test("v22.claim: an allocation's own account_code rides only when it is stated", () => {
  const wire = v2.claimFromInputV2(claim({
    advance_allocations: [
      { advance_id: ADV_A, amount_cents: 10000, account_code: " 1241 " },
      { advance_id: ADV_B, amount_cents: 2850 },
    ],
    allocations_confirmed: true,
  }));
  assert.deepEqual(wire.advance_allocations[0], { advance_id: ADV_A, amount_cents: 10000, account_code: "1241" });
  assert.deepEqual(Object.keys(wire.advance_allocations[1]), ["advance_id", "amount_cents"]);
});

// ---------------------------------------------------------------------------
// 3 · the three new local refusals, mirroring 0301's payload half
// ---------------------------------------------------------------------------

test("v22.claim: the lines must add up to the claim exactly", () => {
  const out = v2.localClaimRefusalV2(claim({
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_B, amount_cents: 2000 }],
    allocations_confirmed: true,
  }));
  assert.equal(out.reason, "advance_allocation_mismatch");
  assert.equal(out.code, "CLR10");
  assert.equal(out.details.field, "claim.advance_allocations");
  assert.equal(out.details.constraint, "exact_sum");
  assert.equal(out.details.total_cents, 12850);
  assert.equal(out.details.allocated_cents, 12000);
});

test("v22.claim: one line per advance — a name used twice is refused, INDEXED", () => {
  const out = v2.localClaimRefusalV2(claim({
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_A, amount_cents: 2850 }],
    allocations_confirmed: true,
  }));
  assert.equal(out.reason, "advance_allocation_mismatch");
  assert.equal(out.details.constraint, "distinct");
  // 1-BASED ON THE WIRE — #931 item 9: `claim.advance_allocations[N].advance_id`, and the web's
  // own field mapper is pinned on that spelling.
  assert.equal(out.details.field, "claim.advance_allocations[2].advance_id");
});

test("v22.claim: a split of two or more is refused until a PERSON has confirmed it", () => {
  const out = v2.localClaimRefusalV2(claim({
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 10000 }, { advance_id: ADV_B, amount_cents: 2850 }],
  }));
  assert.equal(out.reason, "advance_split_unconfirmed");
  assert.equal(out.details.constraint, "confirmation");
  assert.deepEqual(out.details.proposed_allocations, [
    { advance_id: ADV_A, amount_cents: 10000 },
    { advance_id: ADV_B, amount_cents: 2850 },
  ], "the model reads THIS back to the person; it is never a split the tool invented");
  assert.match(out.fix, /read the split back/i);
  // ONE advance needs no confirmation: there is nothing to split and nothing to get wrong.
  assert.equal(v2.localClaimRefusalV2(claim({
    advance_allocations: [{ advance_id: ADV_A, amount_cents: 12850 }],
  })), null);
});

test("v22.claim: every refusal the FROZEN mirror raises still raises, unchanged", () => {
  // The widening must not weaken the eleven checks that were already there.
  const noClaimant = claim({ advance_id: ADV_A, claimant: {} });
  assert.deepEqual(v2.localClaimRefusalV2(noClaimant), v1.localClaimRefusal(noClaimant));
  const backdated = claim({ advance_id: ADV_A, posting_date: "2026-03-01", incurred_date: "2026-03-10" });
  assert.deepEqual(v2.localClaimRefusalV2(backdated), v1.localClaimRefusal(backdated));
});

// ---------------------------------------------------------------------------
// 4 · the proposal — oldest first, and never the difference
// ---------------------------------------------------------------------------

test("v22.claim: proposeAllocationsByDate takes the oldest advance first", () => {
  const out = v2.proposeAllocationsByDate([
    { advance_id: ADV_B, issue_date: "2026-05-01", outstanding_cents: 100000 },
    { advance_id: ADV_A, issue_date: "2026-03-01", outstanding_cents: 10000 },
  ], 12850);
  assert.deepEqual(out, [
    { advance_id: ADV_A, amount_cents: 10000 },
    { advance_id: ADV_B, amount_cents: 2850 },
  ]);
});

test("v22.claim: a tie on the issue date is broken by the advance id, so the answer is stable", () => {
  const out = v2.proposeAllocationsByDate([
    { advance_id: ADV_B, issue_date: "2026-03-01", outstanding_cents: 5000 },
    { advance_id: ADV_A, issue_date: "2026-03-01", outstanding_cents: 5000 },
  ], 8000);
  assert.deepEqual(out, [
    { advance_id: ADV_A, amount_cents: 5000 },
    { advance_id: ADV_B, amount_cents: 3000 },
  ]);
});

test("v22.claim: when the advances cannot cover it, it names everything outstanding and NO MORE", () => {
  const out = v2.proposeAllocationsByDate([
    { advance_id: ADV_A, issue_date: "2026-03-01", outstanding_cents: 4000 },
    { advance_id: ADV_B, issue_date: "2026-05-01", outstanding_cents: 3000 },
  ], 12850);
  assert.deepEqual(out, [
    { advance_id: ADV_A, amount_cents: 4000 },
    { advance_id: ADV_B, amount_cents: 3000 },
  ], "inventing the 5850 difference would be a figure no advance carries");
  assert.equal(out.reduce((n, a) => n + a.amount_cents, 0), 7000);
});

test("v22.claim: it stops when the claim is settled, and drops what it does not need", () => {
  const out = v2.proposeAllocationsByDate([
    { advance_id: ADV_A, issue_date: "2026-03-01", outstanding_cents: 50000 },
    { advance_id: ADV_B, issue_date: "2026-05-01", outstanding_cents: 50000 },
  ], 12850);
  assert.deepEqual(out, [{ advance_id: ADV_A, amount_cents: 12850 }]);
  assert.deepEqual(v2.proposeAllocationsByDate([], 12850), []);
});

// ---------------------------------------------------------------------------
// 5 · the roster and the stanza
// ---------------------------------------------------------------------------

test("v22.claim: v22 serves start_staff_expense_claim_work from its OWN schema", () => {
  const built = v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0);
  assert.ok(built.start_staff_expense_claim_work);
  assert.equal(built.start_staff_expense_claim_work.inputSchema, v2.startStaffExpenseClaimWorkInputSchemaV2);
});

test("v22.claim: the stanza carries #931's paragraph, oldest-first and never on your own", () => {
  const g = v22Prompt.CLAIM_ALLOCATIONS_V22_CHAT_GUIDANCE;
  assert.match(g, /ONE CLAIM MAY COME OFF SEVERAL ADVANCES/);
  assert.match(g, /OLDEST[\s]+ADVANCE FIRST/i);
  assert.match(g, /allocations_confirmed/);
  assert.match(g, /never decide a split on your own/i);
  assert.match(g, /first-in-first-out|first in, first out/i);
  assert.ok(v22Prompt.SYSTEM_PROMPT_V22.includes(g));
});
