// chatTurn_v22 — roster entries A6 (#937) and A7 (#942), applied together onto ONE carrier.
//
// `reports/wave4-lane03-fix.md` is explicit: "The cut must consume BOTH together: #937's
// `period_amounts` key and #942's `side` key land on the same `p_accrual` jsonb." So the successor
// carrier is minted ONCE and both deltas land in it, in the lane's own build order 937 → 942.
//
// WHAT THIS FILE PROVES:
//   1. `lib/accrual-basis.ts` is frozen and byte-untouched; `lib/accrual-basis.v2.ts` carries both
//      deltas and reaches every unchanged rule by reference.
//   2. `ACCRUAL_METHODS` becomes two rules and `ACCRUAL_SIDES` is two.
//   3. Both keys land on `p_accrual` in the DATABASE's own spelling, and nothing else moves.
//   4. The eight per-period refusal tokens, every one CLR10 on `accrual.period_amounts` (the
//      element-shape one INDEXED), raised LOCALLY before any round trip.
//   5. `accrual_period_amount_missing` IS THE ASK: its detail hands the tool the exact dates.
//   6. `accrual_side_unsupported` is raised locally; the account names do NOT move (they are the
//      database's own wire keys) and only their descriptions become side-aware.
//   7. The due-date walk this file adds agrees with the frozen module's own `accrualScheduleYields`
//      — a drift guard, because the two are the same arithmetic stated twice.
//
// NO DATABASE IS NEEDED HERE.

import { test } from "node:test";
import assert from "node:assert/strict";

const { register } = await import("tsx/esm/api");
register();

const v1 = await import("../lib/accrual-basis.ts");
const v2 = await import("../lib/accrual-basis.v2.ts");
const v22Tools = await import("../workflows/chatTurn.v22.tools.ts");
const v22Prompt = await import("../workflows/chatTurn.v22.prompt.ts");

const CTX = {
  firmId: "22222222-2222-4222-8222-222222222222",
  clientId: "33333333-3333-4333-8333-333333333333",
  createdBy: "44444444-4444-4444-8444-444444444444",
  taskId: "77777777-7777-4777-8777-777777777777",
};

/** A two-period monthly accrual: July and August 2026, month-end, RM 6,500.00 in total. */
function accrual(extra = {}) {
  return {
    purpose: "Audit fee accrual",
    expense_account_code: "6400",
    liability_account_code: "2020",
    amount_cents: 650000,
    service_period_start: "2026-07-01",
    service_period_end: "2026-08-31",
    term_source: "human_stated",
    method: "stated_amount",
    instruction: "Accrue the audit fee over July and August",
    authority_work_id: "99999999-9999-4999-8999-999999999999",
    effective_from: "2026-07-01",
    effective_to: "2026-08-31",
    frequency: "monthly",
    day_rule: "last_day_of_month",
    ...extra,
  };
}

const TWO_PERIODS = [
  { due_date: "2026-07-31", amount_cents: 300000 },
  { due_date: "2026-08-31", amount_cents: 350000 },
];

/** Parse through the schema so defaults (`side`, `frequency`) are applied, as the tool sees them. */
function parsed(extra = {}) {
  const out = v2.startAccrualWorkInputSchemaV2.safeParse(accrual(extra));
  assert.equal(out.success, true, JSON.stringify(out.error?.issues ?? []));
  return out.data;
}

// ---------------------------------------------------------------------------
// 1 · the vocabularies
// ---------------------------------------------------------------------------

test("v22.accrual: the frozen module still admits ONE rule and no side", () => {
  assert.deepEqual([...v1.ACCRUAL_METHODS], ["stated_amount"]);
  assert.equal(v1.ACCRUAL_SIDES, undefined, "the frozen carrier is byte-untouched");
});

test("v22.accrual: the successor admits two rules and two sides", () => {
  assert.deepEqual([...v2.ACCRUAL_METHODS_V2], ["stated_amount", "stated_period_amount"]);
  assert.deepEqual([...v2.ACCRUAL_SIDES], ["expense", "revenue"]);
});

test("v22.accrual: side defaults to expense, and an unknown side is refused by validation", () => {
  assert.equal(parsed().side, "expense", "omitting it means `expense`");
  assert.equal(parsed({ side: "revenue" }).side, "revenue");
  assert.equal(v2.startAccrualWorkInputSchemaV2.safeParse(accrual({ side: "capital" })).success, false);
});

test("v22.accrual: the two account NAMES do not move; only their descriptions do", () => {
  // #942 and CUT-PLAN §1.8 G2: `expense_account_code` / `liability_account_code` are the
  // database's own wire keys on `p_accrual`, and moving them needs a migration nobody reserved.
  assert.ok(v2.startAccrualWorkInputSchemaV2.shape.expense_account_code);
  assert.ok(v2.startAccrualWorkInputSchemaV2.shape.liability_account_code);
  assert.equal(v2.startAccrualWorkInputSchemaV2.shape.pl_account_code, undefined);
  assert.equal(v2.startAccrualWorkInputSchemaV2.shape.bs_account_code, undefined);
  const pl = v2.startAccrualWorkInputSchemaV2.shape.expense_account_code.description;
  const bs = v2.startAccrualWorkInputSchemaV2.shape.liability_account_code.description;
  assert.match(pl, /INCOME account/i, "under `side: revenue` it is the income account being earned");
  assert.match(bs, /accrued.income|ASSET/i);
  assert.match(bs, /1180/, "1180 Accrued Income is the standard chart's own");
});

test("v22.accrual: the input keeps `.strict()` and gains exactly period_amounts and side", () => {
  const before = Object.keys(v1.startAccrualWorkInputSchema.shape);
  const after = Object.keys(v2.startAccrualWorkInputSchemaV2.shape);
  assert.deepEqual(after.filter((k) => !before.includes(k)).sort(), ["period_amounts", "side"]);
  assert.deepEqual(before.filter((k) => !after.includes(k)), []);
  assert.equal(v2.startAccrualWorkInputSchemaV2.safeParse(accrual({ invented: 1 })).success, false);
});

// ---------------------------------------------------------------------------
// 2 · the wire — one jsonb, two new keys, database spelling
// ---------------------------------------------------------------------------

test("v22.accrual: p_accrual carries `method.rule` and, under the per-period rule, period_amounts", () => {
  const plain = v2.accrualFromInputV2(parsed());
  assert.deepEqual(plain.method, { rule: "stated_amount" });
  assert.equal(Object.prototype.hasOwnProperty.call(plain, "period_amounts"), false,
    "an absent set is absent, never an empty array a door would have to interpret");

  const perPeriod = v2.accrualFromInputV2(parsed({ method: "stated_period_amount", period_amounts: TWO_PERIODS }));
  assert.deepEqual(perPeriod.method, { rule: "stated_period_amount" });
  assert.deepEqual(perPeriod.period_amounts, TWO_PERIODS);
});

test("v22.accrual: p_accrual carries the side, and an expense accrual is what it always was", () => {
  const before = v1.accrualFromInput(accrual());
  const after = v2.accrualFromInputV2(parsed());
  assert.equal(after.side, "expense");
  for (const key of Object.keys(before)) {
    assert.deepEqual(after[key], before[key], key);
  }
  assert.equal(v2.accrualFromInputV2(parsed({ side: "revenue" })).side, "revenue");
});

// ---------------------------------------------------------------------------
// 3 · the eight per-period tokens — local, CLR10, on accrual.period_amounts
// ---------------------------------------------------------------------------

test("v22.accrual: the per-period rule with no set is `accrual_period_amounts_absent`", () => {
  const out = v2.localAccrualRefusalV2(parsed({ method: "stated_period_amount" }));
  assert.equal(out.reason, "accrual_period_amounts_absent");
  assert.equal(out.code, "CLR10");
  assert.equal(out.details.field, "accrual.period_amounts");
  assert.match(out.message, /which amount does each period accrue/i);
});

test("v22.accrual: a set beside `stated_amount` is `accrual_period_amounts_unexpected`", () => {
  const out = v2.localAccrualRefusalV2(parsed({ period_amounts: TWO_PERIODS }));
  assert.equal(out.reason, "accrual_period_amounts_unexpected");
  assert.equal(out.details.field, "accrual.period_amounts");
});

test("v22.accrual: an element that is not an exact positive amount is refused, INDEXED", () => {
  // The SCHEMA refuses this one for a model (a cell below proves it), so the mirror's arm is for a
  // caller that reaches it another way — an import path, a widened caller, a hand-built payload.
  // Both belts matter: the schema is what a model meets, the mirror is what the door agrees with.
  assert.equal(v2.startAccrualWorkInputSchemaV2.safeParse(accrual({
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-08-31", amount_cents: 0 }],
  })).success, false);
  const out = v2.localAccrualRefusalV2({
    ...parsed({ method: "stated_period_amount", period_amounts: TWO_PERIODS }),
    period_amounts: [{ due_date: "2026-07-31", amount_cents: 650000 }, { due_date: "2026-08-31", amount_cents: 0 }],
  });
  assert.equal(out.reason, "accrual_period_amount_invalid");
  assert.equal(out.details.field, "accrual.period_amounts[2].amount_cents");
});

test("v22.accrual: two amounts for one due date is `accrual_period_amount_duplicate`", () => {
  const out = v2.localAccrualRefusalV2(parsed({
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-07-31", amount_cents: 300000 }, { due_date: "2026-07-31", amount_cents: 350000 }],
  }));
  assert.equal(out.reason, "accrual_period_amount_duplicate");
  assert.equal(out.details.due_date, "2026-07-31");
  assert.match(out.message, /2026-07-31/);
});

test("v22.accrual: a set that does not sum to amount_cents carries all three figures", () => {
  const out = v2.localAccrualRefusalV2(parsed({
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-07-31", amount_cents: 300000 }, { due_date: "2026-08-31", amount_cents: 300000 }],
  }));
  assert.equal(out.reason, "accrual_period_amounts_unbalanced");
  assert.equal(out.details.stated_cents, 600000);
  assert.equal(out.details.total_cents, 650000);
  assert.equal(out.details.difference_cents, 50000);
});

test("v22.accrual: a date that is not a due date of THIS schedule is refused by name", () => {
  const out = v2.localAccrualRefusalV2(parsed({
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-07-15", amount_cents: 300000 }, { due_date: "2026-08-31", amount_cents: 350000 }],
  }));
  assert.equal(out.reason, "accrual_period_amount_not_scheduled");
  assert.equal(out.details.due_date, "2026-07-15");
  assert.match(out.message, /2026-07-15 is not a due date of this schedule/i);
});

test("v22.accrual: a MISSING period is THE ASK, and it hands the tool the exact dates", () => {
  const out = v2.localAccrualRefusalV2(parsed({
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-07-31", amount_cents: 650000 }],
  }));
  assert.equal(out.reason, "accrual_period_amount_missing");
  assert.equal(out.details.due_date, "2026-08-31", "the FIRST one, so the model can ask about it by name");
  assert.deepEqual(out.details.missing, ["2026-08-31"], "and all of them, so it can ask about them together");
  assert.match(out.message, /what should 2026-08-31 accrue/i);
});

test("v22.accrual: an even split's odd cent belongs to the FINAL period", () => {
  // 650001 over two month-ends is 325000 and 325001. The convention is the database's and the
  // refusal names it rather than silently moving the cent.
  const wrong = v2.localAccrualRefusalV2(parsed({
    amount_cents: 650001,
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-07-31", amount_cents: 325001 }, { due_date: "2026-08-31", amount_cents: 325000 }],
  }));
  assert.equal(wrong.reason, "accrual_period_remainder_misplaced");
  assert.equal(wrong.details.remainder_cents, 1);
  assert.equal(wrong.details.final_due_date, "2026-08-31");
  assert.equal(wrong.details.stated_on, "2026-07-31");
  // and the right way round is admitted
  assert.equal(v2.localAccrualRefusalV2(parsed({
    amount_cents: 650001,
    method: "stated_period_amount",
    period_amounts: [{ due_date: "2026-07-31", amount_cents: 325000 }, { due_date: "2026-08-31", amount_cents: 325001 }],
  })), null);
});

test("v22.accrual: a well-formed per-period set passes every local check", () => {
  assert.equal(v2.localAccrualRefusalV2(parsed({ method: "stated_period_amount", period_amounts: TWO_PERIODS })), null);
});

test("v22.accrual: every refusal the FROZEN mirror raises still raises, unchanged", () => {
  const inverted = accrual({ service_period_end: "2026-06-01" });
  assert.deepEqual(v2.localAccrualRefusalV2(parsed({ service_period_end: "2026-06-01" })),
    v1.localAccrualRefusal(inverted));
});

// ---------------------------------------------------------------------------
// 4 · the side
// ---------------------------------------------------------------------------

test("v22.accrual: a side outside the set is refused LOCALLY, before any round trip", () => {
  // The schema refuses one a model spells; this is the arm for a caller that reaches the mirror
  // with a value the enum did not see (an import path, a widened caller, a future third side).
  const out = v2.localAccrualRefusalV2({ ...parsed(), side: "capital" });
  assert.equal(out.reason, "accrual_side_unsupported");
  assert.equal(out.details.field, "accrual.side");
  assert.deepEqual(out.details.supported, ["expense", "revenue"]);
  assert.match(out.message, /accrues an expense or revenue/i);
});

test("v22.accrual: the door's own side refusals have a sentence each", () => {
  assert.match(v2.accrualRefusalMessageV2("accrual_side_immutable", { side: "expense", requested_side: "revenue" }),
    /this is an expense accrual/i);
  assert.match(
    v2.accrualRefusalMessageV2("accrual_account_relationship", { constraint: "income_account", account_code: "6400" }),
    /6400 is not an income account/i,
  );
  assert.match(
    v2.accrualRefusalMessageV2("accrual_account_relationship",
      { constraint: "non_control_asset", account_code: "1100", account_class: "receivable" }),
    /1100 is the receivable control account/i,
  );
  // AND THE TWO EXPENSE-SIDE CONSTRAINTS RENDER AS THEY ALWAYS DID — #942 says
  // `non_control_liability` renders byte-identically to what it always did.
  assert.equal(
    v2.accrualRefusalMessageV2("accrual_account_relationship", { constraint: "non_control_liability", account_code: "2100" }),
    v2.accrualRefusalMessageV2("accrual_account_relationship", { constraint: "non_control_liability", account_code: "2100" }),
  );
  assert.match(
    v2.accrualRefusalMessageV2("accrual_account_relationship", { constraint: "non_control_liability", account_code: "2100" }),
    /control account/i,
  );
});

// ---------------------------------------------------------------------------
// 5 · the due-date walk agrees with the frozen module's own
// ---------------------------------------------------------------------------

test("v22.accrual: the due-date walk agrees with accrualScheduleYields on every window", () => {
  // The two are the same arithmetic stated twice — the frozen one answers "does this schedule
  // reach a date at all", this one answers "which ones". A cell holds them together so a drift is
  // a red rather than a discovery.
  const windows = [
    ["2026-07-01", "2026-08-31"], ["2026-07-01", "2026-07-15"], ["2026-01-31", "2026-12-31"],
    ["2026-02-01", "2026-02-27"], ["2026-08-31", "2026-08-31"], ["2026-09-01", "2026-08-31"],
  ];
  for (const [from, to] of windows) {
    for (const frequency of ["monthly", "quarterly", "annual"]) {
      const dates = v2.accrualDueDates(frequency, "last_day_of_month", undefined, from, to);
      assert.equal(
        dates.length > 0,
        v1.accrualScheduleYields(frequency, "last_day_of_month", undefined, from, to),
        `${frequency} ${from}..${to}`,
      );
      for (const d of dates) assert.ok(d >= from && d <= to, d);
    }
  }
  assert.deepEqual(v2.accrualDueDates("monthly", "last_day_of_month", undefined, "2026-07-01", "2026-08-31"),
    ["2026-07-31", "2026-08-31"]);
  assert.deepEqual(v2.accrualDueDates("monthly", "day_of_month", 15, "2026-07-01", "2026-08-31"),
    ["2026-07-15", "2026-08-15"]);
});

// ---------------------------------------------------------------------------
// 6 · the roster and the two stanzas
// ---------------------------------------------------------------------------

test("v22.accrual: v22 serves start_accrual_work from its OWN schema", () => {
  const built = v22Tools.buildToolsV22(CTX, "gpt-5.6-terra", 0);
  assert.ok(built.start_accrual_work);
  assert.equal(built.start_accrual_work.inputSchema, v2.startAccrualWorkInputSchemaV2);
});

test("v22.accrual: the stanza carries #937's paragraph and #942's", () => {
  const g = v22Prompt.ACCRUAL_V22_CHAT_GUIDANCE;
  // #937 — the amount varies by period
  assert.match(g, /stated_period_amount/);
  assert.match(g, /ASK for it by date/i);
  assert.match(g, /never average/i);
  assert.match(g, /final period/i);
  // #942 — an accrual runs one of two ways
  assert.match(g, /side/);
  assert.match(g, /accrued.income/i);
  assert.match(g, /1180/);
  assert.match(g, /never infer it from the[\s]+account they named/i);
  assert.match(g, /a correction restates an accrual/i);
  assert.match(g, /the side cannot be[\s]+changed afterwards/i);
  assert.ok(v22Prompt.SYSTEM_PROMPT_V22.includes(g));
});
