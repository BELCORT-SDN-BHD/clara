// #1075 (riders sweep wave, lane 01) — THE ACCRUAL REGISTER'S SIDE FILTER MOVES SERVER-SIDE.
//
// The claim this battery exists to prove, through the REAL door (WORK-ORDER rule 10):
//
//   1. `clara.list_accrual_adjustments` ACCEPTS AN OPTIONAL SIDE FILTER AND RETURNS ONLY MATCHING
//      ROWS WHEN GIVEN ONE (the ticket's own first acceptance criterion) — server-side, composed
//      with the door's existing date-window predicate by a plain AND, so a period outside the
//      window is excluded even when its side matches.
//   2. AN OMITTED p_side REPRODUCES THE THREE-ARGUMENT DOOR EXACTLY: every side, unchanged rows,
//      unchanged order — the migration's own "what does not change" claim, measured rather than
//      assumed.
//   3. AN UNSUPPORTED SIDE IS REFUSED BY NAME (CLR10 accrual_side_filter_unsupported), the SAME
//      closed-set judgement `clara._assert_accrual_particulars` already applies to a CONFIGURED
//      side (0304) — never a silently empty page a caller could mistake for "this client has
//      none of either".
//
// What this battery does NOT re-prove: the projection's other fields, the date-window predicate
// on its own, and the accrual side's OWN meaning (expense/revenue legs, posting behaviour) — all
// already covered by accrual-adjustments.test.mjs (#652) and accrual-revenue-side.test.mjs
// (#942). This file is scoped to the ONE thing 0334 adds: the fourth parameter.
//
// CONTRACT-BLIND-ADJACENT: built against #1075's own Agent Brief and 0334's migration text, never
// against an implementation file. FRONTIER-GATED on the `accrual_list_side_filter$` stem.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, opk, rootQuery,
  freshAccrualClient, accrual, createAccrualAdjustment, listAccrualAdjustments, instructionRef,
  CLR, assertPair, todayInPlanZone, shiftMonths,
} from "./accrual-adjustments-fixtures.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

const STEM = "accrual_list_side_filter$";

let _ready = null;
async function laneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

async function gate1075(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_LIST_SIDE_FILTER !== "1") {
    assert.fail(
      `#1075 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/accrual-list-side-filter-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#1075 accrual list side-filter lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("accrual-list-side-filter");
  printSkipCount("accrual-list-side-filter");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

// The revenue-side chart this battery needs, on top of `freshAccrualClient`'s expense-side one —
// the SAME two codes/classes #942's own battery uses (accrual-revenue-side.test.mjs's RCHART),
// re-minted locally rather than imported: that battery's constant is not exported, and a filter
// test has no reason to reach into a sibling ticket's own module for two account codes.
const RCHART = { income: "4000", asset: "1320" };

async function freshTwoSideClient(tag) {
  const client = await freshAccrualClient(ALICE(), tag);
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.income, name: "Sales / Fees Income", type: "income", accountClass: null,
    opKey: opk("p1075-coa"),
  });
  await upsertAccountClassed(ALICE(), {
    client, code: RCHART.asset, name: "Unbilled Receivables (Work-in-Progress)", type: "asset",
    accountClass: null, opKey: opk("p1075-coa"),
  });
  return client;
}

const monthStart = (day) => `${day.slice(0, 7)}-01`;
async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}
/** `monthsBack` months, ending at the month end `monthsBack - 1` months ago — the same window
 *  shape every accrual battery on this lane uses (accrual-adjustments.test.mjs's own `span`),
 *  re-derived here so every due date this file produces is in the past on any calendar day the
 *  battery runs. */
async function span(monthsBack) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

async function configureSide({ client, ref, side, window, tag }) {
  const particulars = side === "revenue"
    ? { ...accrual({
        expenseAccount: RCHART.income, liabilityAccount: RCHART.asset,
        servicePeriodStart: window.from, servicePeriodEnd: window.to,
        memo: `#1075 ${tag} revenue arm`,
      }), side: "revenue" }
    : accrual({
        servicePeriodStart: window.from, servicePeriodEnd: window.to,
        memo: `#1075 ${tag} expense arm`,
      });
  const answer = await createAccrualAdjustment(BOB(), {
    client, purpose: `#1075 ${tag} ${side}`, authorityRef: ref, accrual: particulars,
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: window.from, effectiveTo: window.to,
  });
  return answer.accrual_id;
}

// ===========================================================================================
// p1075.filter.side — THE OPTIONAL FILTER, AND WHAT AN OMITTED ONE REPRODUCES.
// ===========================================================================================

test("p1075.filter.side — a side filter narrows the register to matching rows; an omitted one answers every side, unchanged", async (t) => {
  if (await gate1075(t)) return;

  const client = await freshTwoSideClient("side");
  const ref = await instructionRef({ client, author: BOB() });
  const window = await span(2);

  const expenseId = await configureSide({ client, ref, side: "expense", window, tag: "side" });
  const revenueId = await configureSide({ client, ref, side: "revenue", window, tag: "side" });

  // THE UNFILTERED READ — the door's existing behaviour, measured as the baseline every filtered
  // read below is compared against.
  const all = await listAccrualAdjustments(BOB(), { client });
  assert.equal(all.side, null, "an omitted p_side is echoed as null -- 'every side', not a stated one");
  const allIds = all.accruals.map((a) => a.accrual_id);
  assert.ok(allIds.includes(expenseId) && allIds.includes(revenueId),
    "the unfiltered register carries BOTH accruals -- the baseline the filtered reads narrow");

  // THE EXPENSE FILTER.
  const expenseOnly = await listAccrualAdjustments(BOB(), { client, side: "expense" });
  assert.equal(expenseOnly.side, "expense", "the envelope echoes the side that was asked for");
  assert.deepEqual(expenseOnly.accruals.map((a) => a.accrual_id), [expenseId],
    "side=expense answers EXACTLY the expense-side accrual, never the revenue one");
  assert.equal(expenseOnly.accruals[0].side, "expense", "and the row's own side agrees");

  // THE REVENUE FILTER — the mirror, proving this is a real predicate and not a coincidence of
  // insertion order.
  const revenueOnly = await listAccrualAdjustments(BOB(), { client, side: "revenue" });
  assert.equal(revenueOnly.side, "revenue");
  assert.deepEqual(revenueOnly.accruals.map((a) => a.accrual_id), [revenueId],
    "side=revenue answers EXACTLY the revenue-side accrual, never the expense one");
  assert.equal(revenueOnly.accruals[0].side, "revenue");

  // EVERY OTHER PROJECTED FIELD SURVIVES THE FILTER — this is a WHERE clause, not a re-derivation.
  assert.equal(expenseOnly.accruals[0].amount_cents, all.accruals.find((a) => a.accrual_id === expenseId).amount_cents,
    "a filtered row carries the SAME amount the unfiltered read already answered");
});

// ===========================================================================================
// p1075.filter.composes_with_window — SERVER-SIDE MEANS IT COMPOSES WITH THE EXISTING PREDICATE.
// ===========================================================================================

test("p1075.filter.composes_with_window — a side match outside the date window is still excluded, the ticket's own reason for asking", async (t) => {
  if (await gate1075(t)) return;

  const client = await freshTwoSideClient("window");
  const ref = await instructionRef({ client, author: BOB() });

  // AN OLDER EXPENSE ACCRUAL, five months back -- same side, DIFFERENT window.
  const olderWindow = await span(5);
  const olderId = await configureSide({ client, ref, side: "expense", window: olderWindow, tag: "older" });

  // A RECENT EXPENSE ACCRUAL, two months back -- the window this cell filters on.
  const recentWindow = await span(2);
  const recentId = await configureSide({ client, ref, side: "expense", window: recentWindow, tag: "recent" });

  // BOTH share a side; only ONE is inside [recentWindow.from, recentWindow.to]. A side filter
  // that ignored the window (or a window that ignored the side) would both answer two rows here
  // -- this is the composition AC1 asks for, not two independent claims.
  const filtered = await listAccrualAdjustments(BOB(), {
    client, side: "expense", from: recentWindow.from, to: recentWindow.to,
  });
  assert.deepEqual(filtered.accruals.map((a) => a.accrual_id), [recentId],
    "the older, out-of-window accrual is excluded even though its side matches");
  assert.notEqual(recentId, olderId, "the two accruals really are distinct rows");

  // AND THE SIDE FILTER ALONE (no window) STILL ANSWERS BOTH -- proving the exclusion above came
  // from the window, not from some other accident of the two calls.
  const sideOnly = await listAccrualAdjustments(BOB(), { client, side: "expense" });
  const sideOnlyIds = sideOnly.accruals.map((a) => a.accrual_id);
  assert.ok(sideOnlyIds.includes(olderId) && sideOnlyIds.includes(recentId),
    "without a window, both expense-side accruals are present");
});

// ===========================================================================================
// p1075.filter.unsupported — THE CLOSED SET, REFUSED BY NAME.
// ===========================================================================================

test("p1075.filter.unsupported — a side filter outside {expense, revenue} is refused CLR10 accrual_side_filter_unsupported, never a silent empty page", async (t) => {
  if (await gate1075(t)) return;

  const client = await freshAccrualClient(ALICE(), "unsupported");

  const { detail } = await assertPair(CLR.badRequest, "accrual_side_filter_unsupported",
    () => listAccrualAdjustments(BOB(), { client, side: "gain_or_loss" }),
    "a side filter outside the closed set");
  assert.equal(detail.field, "side", "the refusal names the control, not a generic 'invalid basis'");
  assert.equal(detail.side, "gain_or_loss", "…and echoes the value that was refused");
  assert.deepEqual([...detail.supported].sort(), ["expense", "revenue"],
    "…and offers the door's own closed set rather than leaving the caller to guess it");
});
