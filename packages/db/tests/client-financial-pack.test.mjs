// #660 — the CLIENT FINANCIAL PACK battery for packages/db/migrations/0232_client_financial_pack.sql.
//
// FRONTIER-GATED on the `client_financial_pack$` stable stem (the `client-work-pack.test.mjs:40-77`
// shape, restated here for this migration's own stem so the slice-frontier legs SKIP cleanly rather
// than red on a database pinned before 0232 lands). A skip is not evidence; the green run that
// matters is the one on a chain that carries 0232.
//
// WHAT THIS FILE IS ABOUT. `clara.get_client_financial_pack` is the ONE client-scoped read behind
// the client home's money band — BOOK CASH over a governed, versioned cash account set, and PERIOD
// PROFIT over the approved ledger — each with a ten-field envelope, six points of history and its
// own comparison. Beside it, `clara.publish_client_cash_account_set` is the only way a cash set is
// authored and `clara.propose_client_cash_accounts` is the read that says which accounts COULD be
// cash. This file proves all three under real least-privileged Postgres roles.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. Nothing here says anything about the BROWSER: the tiles, the
// period selector, the chart and its table fallback, the 30 s re-read and the drilldown URLs are
// proven by the web unit cells (`apps/web/lib/dashboard/*.test.ts`,
// `apps/web/components/firm/client-home/client-financial-charts.test.tsx`) and by
// `apps/web/e2e/home-board-walk.spec.ts`.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { buildWorld, endPool, assertRaises, opk } from "./rig-fixtures.mjs";
import { markSkip, printSkipCount } from "./wave-a-helpers.mjs";
import {
  CHART, financialClient, deactivate, makeCarryDownOnly, postEntry, stampPreFixCloseReceipt, plantBankStatement,
  pack, propose, publish, members, reasonOf, trialBalanceCash,
  rootQuery, humanQuery,
} from "./client-financial-pack-fixtures.mjs";

const CLR04 = "CLR04";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const STEM = "client_financial_pack$";

/** The ten fields every figure group owes, and the closed status vocabulary. */
const ENVELOPE_KEYS = [
  "value_cents", "status", "unit", "currency", "period", "computed_at",
  "definition_version", "source_watermark", "coverage", "coverage_reason",
];
const STATUS_WORDS = ["ok", "partial", "unknown"];
/** 0057:390-396's own CHECK regex for a pg_snapshot in text form. */
const WATERMARK_RE = /^[0-9]+:[0-9]+:([0-9]+(,[0-9]+)*)?$/;
const DEFINITION_VERSION = "clara.client-financial-pack/v1";

let _ready = null;
async function packLaneReady() {
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

async function gate(t) {
  if (await packLaneReady()) return false;
  markSkip();
  t.skip(`#660 client-financial-pack lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
before(async () => {
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud. The package-wide sweep preloads
  // `client-financial-pack-preintegration-gate.mjs`, which sets the flag below to declare "a
  // database without this lane is an expected pre-integration state". A worker running this file
  // directly against a rig that is supposed to carry 0232 sets nothing, so an absent lane fails
  // here rather than reporting a green run over a file that quietly executed no assertion.
  if (!(await packLaneReady()) && process.env.CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK !== "1") {
    throw new Error(
      `#660: no migration matching /${STEM}/ is applied to this database, and `
      + "CLARA_ALLOW_MISSING_CLIENT_FINANCIAL_PACK is not set. Apply "
      + "0232_client_financial_pack.sql, or preload "
      + "tests/client-financial-pack-preintegration-gate.mjs if a lane-less database is expected here.",
    );
  }
  world = await buildWorld();
});
after(async () => {
  printSkipCount("client-financial-pack");
  await endPool();
});

const ALICE = () => world.users.alice; // owner, firm A — maker, and admin-floor publisher
const BOB = () => world.users.bob;     // bookkeeper, firm A — checker, and the publish-floor probe
const CAROL = () => world.users.carol; // viewer, firm A — the FLOOR both reads are written to
const DAVE = () => world.users.dave;   // owner, firm B — the no-oracle probe
const FIRM_A = () => world.firms.A;

/** Every envelope field, present, with the closed vocabulary and a real watermark. */
function assertEnvelope(group, label) {
  for (const k of ENVELOPE_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(group, k), `${label}: envelope is missing ${k}`);
  }
  assert.equal(group.unit, "minor_units", `${label}: unit`);
  assert.equal(group.currency, "MYR", `${label}: currency`);
  assert.equal(group.definition_version, DEFINITION_VERSION, `${label}: definition_version`);
  assert.ok(STATUS_WORDS.includes(group.status), `${label}: status "${group.status}" is outside ok|partial|unknown`);
  assert.ok(STATUS_WORDS.includes(group.coverage), `${label}: coverage "${group.coverage}" is outside ok|partial|unknown`);
  assert.notEqual(group.status, "unavailable", `${label}: the word "unavailable" does not exist in this vocabulary`);
  assert.notEqual(group.coverage, "denied", `${label}: this door never says denied about itself — it raises CLR04`);
  assert.match(group.source_watermark, WATERMARK_RE, `${label}: source_watermark is not a pg_snapshot`);
  for (const k of ["start", "end", "as_of", "timezone"]) {
    assert.ok(group.period[k] != null, `${label}: period.${k} is missing`);
  }
  assert.equal(group.period.timezone, "Asia/Kuala_Lumpur", `${label}: period.timezone`);
}

/** RM `n` in exact minor units — never a float anywhere in this file. */
const rm = (n) => n * 100;
/** Dr bank / Cr sales: money in. */
const sale = (amount) => [{ code: CHART.bank, debit: amount }, { code: CHART.sales, credit: amount }];
/** Dr rent / Cr bank: money out. */
const spend = (amount) => [{ code: CHART.rent, debit: amount }, { code: CHART.bank, credit: amount }];

/** Publish the default one-member (bank) set covering the whole of the client's books. */
async function publishBank(client, accounts, extra = []) {
  return publish(ALICE(), client, members(accounts, [CHART.bank, "bank_registry"], ...extra));
}

// ===========================================================================================
// AC1 — THE ENVELOPE, AND THE SET.
// ===========================================================================================

test("p660.pack.envelope_complete — every figure group carries all ten envelope fields, a real snapshot watermark and the literal definition version", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "env");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(1000)) });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  for (const key of ["cash", "profit", "income", "expense"]) {
    assertEnvelope(p[key], key);
  }
  // ONE READ, ONE SNAPSHOT: four faces of one envelope must agree, which is the whole reason the
  // money band is ONE section rather than four sections each doing its own read.
  const marks = new Set([p.cash, p.profit, p.income, p.expense].map((g) => g.source_watermark));
  assert.equal(marks.size, 1, "the four groups do not share one source watermark");
  assert.equal(p.period.timezone, "Asia/Kuala_Lumpur");
  assert.equal(p.period.as_of, "2026-03-31");
  assert.equal(p.period.is_mtd, false);
});

test("p660.pack.cash_set_unpublished — no published set is unknown + NULL + cash_set_unpublished, never 0", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "unpub");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(500)) });

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.notEqual(p.cash.status, "ok", "an unpublished set is not an `ok` answer");
  assert.equal(p.cash.status, "unknown");
  assert.equal(p.cash.value_cents, null, "a value of 0 would read as `this client has no money`");
  assert.equal(p.cash.coverage_reason, "cash_set_unpublished");
  assert.equal(p.cash.set, null);
  // AND THE PROFIT HALF IS UNAFFECTED — a board that blanks on one failure reads as "nothing
  // outstanding", which is the most expensive way to be wrong here.
  assert.equal(p.profit.status, "ok");
});

test("p660.pack.cash_set_inactive_member — an INACTIVE bank account with a live balance is a member and its balance is in cash", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "inact");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-05", lines: sale(rm(700)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-06",
    lines: [{ code: CHART.bank2, debit: rm(300) }, { code: CHART.sales, credit: rm(300) }] });
  // The second bank account is RETIRED and still holds RM300.
  await deactivate(client, CHART.bank2);

  // THE ASSERTION clara.create_account_set_v1 PROVABLY CANNOT SATISFY: its resolver
  // (clara._metric_selector_account_ids, 0058:344-358) filters is_active twice and refuses an
  // explicitly named inactive account with CLR10 selector_element_unresolved.
  await publish(ALICE(), client,
    members(accounts, [CHART.bank, "bank_registry"], [CHART.bank2, "bank_registry"]));

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(p.cash.status, "ok");
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(1000)), "the retired account's RM300 is in book cash");
  assert.equal(p.cash.set.member_count, 2);
  assert.deepEqual(
    p.cash.composition.map((r) => r.account_code).sort(),
    [CHART.bank, CHART.bank2].sort());
});

test("p660.pack.propose_never_petty_cash — the proposal read includes INACTIVE bank accounts and proposes NO petty cash under any name", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "prop");
  await deactivate(client, CHART.bank2);

  const r = await propose(CAROL(), client);
  const codes = r.candidates.map((x) => x.account_code).sort();
  assert.deepEqual(codes, [CHART.bank, CHART.bank2].sort(), "an inactive bank account is still a candidate");
  assert.equal(r.candidates.find((x) => x.account_code === CHART.bank2).is_active, false);
  // The account is literally called "Petty Cash Tin" and its code is 1090. Neither fact reaches
  // this read: 0121:4749 — structure and declared facts only.
  assert.ok(!codes.includes(CHART.petty), "petty cash was proposed from its NAME or CODE");
  assert.ok(r.candidates.every((x) => x.member_reason === "bank_registry"));
  assert.deepEqual(r.never_proposed, ["declared_cash", "declared_petty_cash"]);
  assert.equal(r.published_version_id, null);
  assert.ok(r.candidates.every((x) => x.already_member === false));
});

// ===========================================================================================
// AC2 — BOOK CASH: ONE DEFINITION, CUMULATIVE, NO FY RESET, NO STATEMENT BALANCE.
// ===========================================================================================

test("p660.pack.matches_trial_balance — the pack's single-pass cash arm EQUALS the member sum of clara.trial_balance_as_of at the same as-of", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "tb");
  await postEntry(ALICE(), BOB(), { client, date: "2026-01-15", lines: sale(rm(2500)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-02-20", lines: spend(rm(400)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-11", lines: sale(rm(60)) });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  const oracle = await trialBalanceCash(CAROL(), client, "2026-03-31", [CHART.bank]);
  // THE CELL THAT MAKES "ONE DEFINITION" CHECKABLE RATHER THAN CLAIMED. 0232 computes cash in ONE
  // filtered pass (measured 8.87x cheaper than seven calls); this proves the second spelling means
  // exactly what the first one does.
  assert.equal(BigInt(p.cash.value_cents), oracle);
  // And at every one of the six points, not only the last.
  for (const point of p.cash.points) {
    if (!point.available) continue;
    const at = await trialBalanceCash(CAROL(), client, point.as_of, [CHART.bank]);
    assert.equal(BigInt(point.value_cents), at, `point ${point.as_of} diverges from trial_balance_as_of`);
  }
});

test("p660.pack.cash_cumulative_no_fy_reset + opening_counted_once — cash at a later point is cumulative from inception and an approved opening lands exactly once", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "fy");
  // An OPENING entry, then two fiscal years of trading around it.
  await postEntry(ALICE(), BOB(), { client, date: "2026-01-01", memo: "opening",
    lines: [{ code: CHART.bank, debit: rm(1000) }, { code: CHART.retained, credit: rm(1000) }],
    flags: { is_opening_balance: true } });
  await postEntry(ALICE(), BOB(), { client, date: "2026-02-10", lines: sale(rm(200)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(50)) });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  // 1000 opening + 200 + 50 — cumulative, NOT March-only movement, and the opening exactly once.
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(1250)));
  // A SECOND READ IN THE SAME STATE DOES NOT DOUBLE IT.
  const again = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(again.cash.value_cents, p.cash.value_cents, "two reads of one ledger disagree");
  // February's point already carries the opening: a fiscal-year reset would have zeroed it.
  const feb = p.cash.points.find((x) => x.as_of === "2026-02-28");
  assert.equal(BigInt(feb.value_cents), BigInt(rm(1200)));
});

test("p660.pack.statement_balance_never_cash — a bank_statements row with a different closing balance changes nothing", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "stmt");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-04", lines: sale(rm(800)) });
  await publishBank(client, accounts);

  const before_ = await pack(CAROL(), client, { month: "2026-03-01" });
  const planted = await plantBankStatement({ client, firm: FIRM_A(), closingCents: rm(999999) });
  const after_ = await pack(CAROL(), client, { month: "2026-03-01" });

  assert.equal(after_.cash.value_cents, before_.cash.value_cents,
    "a third party's claim about an account moved BOOK cash");
  assert.equal(BigInt(after_.cash.value_cents), BigInt(rm(800)));
  assert.ok(after_.excluded_by_design.includes("statement_balance"));
  // The structural half, independent of whether the fixture row could be planted on this chain.
  const src = await rootQuery(
    "select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' and p.proname = 'get_client_financial_pack'");
  assert.equal(src.rows[0].prosrc.includes("bank_statements"), false,
    "the pack's body mentions clara.bank_statements");
  if (!planted) t.diagnostic("bank_statements fixture row could not be planted on this chain; the prosrc half still holds");
});

test("p660.pack.pre_coverage_point + floor_fallback_no_seed — a point before the coverage floor is unavailable with reason pre_coverage, never 0", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "floor");
  // No finalized opening seed exists for this client, so the floor falls back to the earliest
  // approved posting_date — measured, not assumed.
  const seeds = await rootQuery(
    "select count(*)::int n from clara.opening_seed_registry where client_id = $1 and state = 'finalized'",
    [client]);
  assert.equal(seeds.rows[0].n, 0, "this fixture client was expected to carry no finalized seed");

  await postEntry(ALICE(), BOB(), { client, date: "2026-03-02", lines: sale(rm(400)) });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(p.coverage_floor, "2026-03-02", "the floor is the earliest approved posting_date");
  const early = p.cash.points.filter((x) => x.as_of < "2026-03-02");
  assert.ok(early.length >= 5, "the five preceding month-ends all precede the floor here");
  for (const point of early) {
    assert.equal(point.available, false, `${point.as_of} claims to be available before the floor`);
    assert.equal(point.value_cents, null, `${point.as_of} reports a number it cannot know`);
    assert.equal(point.reason, "pre_coverage");
  }
  assert.equal(p.cash.coverage, "partial");
  assert.equal(p.cash.coverage_reason, "pre_coverage");

  // THE CARRY-DOWN HALF. This fixture client's plan carries BOTH `first_year_zero_opening`
  // (answered) and `carry_down_deferred` (resolved) — the rig's own legacy-activation bridge
  // (`rig-fixtures.mjs:88-96`). The estate's precedence says the opening is KNOWN there
  // (`opening-position-gate.tsx:85, :95-97`), so the pack must NOT claim it is absent.
  assert.notEqual(p.cash.coverage_reason, "opening_carry_down_deferred",
    "a first-year-zero opening is a KNOWN opening — the deferred row beside it does not make it absent");

  // Withdraw the first-year-zero answer and the opening becomes genuinely absent. NOW it is said.
  await makeCarryDownOnly(client);
  const deferred = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(deferred.cash.coverage, "partial");
  // pre_coverage still ranks above it here (the five earlier points precede the floor), so the
  // carry-down is read off a client whose whole series is inside coverage instead.
  assert.ok(["pre_coverage", "opening_carry_down_deferred"].includes(deferred.cash.coverage_reason));
});

test("p660.pack.opening_carry_down_deferred — a client whose opening is genuinely uncaptured says so, even when every point is inside coverage", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "carry");
  // Books that begin BEFORE the oldest of the six points, so `pre_coverage` cannot fire and the
  // carry-down disclosure is the only thing left to say.
  await postEntry(ALICE(), BOB(), { client, date: "2025-09-01", lines: sale(rm(50)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-09", lines: sale(rm(150)) });
  await publishBank(client, accounts);

  const known = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(known.cash.coverage, "ok", "an opening that IS known must not be disclosed as absent");
  assert.equal(known.cash.coverage_reason, null);

  await makeCarryDownOnly(client);
  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(p.cash.coverage, "partial");
  assert.equal(p.cash.coverage_reason, "opening_carry_down_deferred");
  // AND THE NUMBER STAYS. The opening is knowingly absent, which is a statement ABOUT the number,
  // not a reason to withhold it.
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(200)));
  assert.equal(p.cash.status, "ok");
});

test("p660.pack.cash_set_version_pinned + cash_set_version_changed_in_series — ONE version serves all six points, and a point outside its window is disclosed", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "pin");
  await postEntry(ALICE(), BOB(), { client, date: "2026-01-05", lines: sale(rm(1000)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-02-05",
    lines: [{ code: CHART.bank2, debit: rm(500) }, { code: CHART.sales, credit: rm(500) }] });
  const v1 = await publishBank(client, accounts);
  assert.equal(v1.revision, 1);

  const before_ = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(before_.cash.set.revision, 1);
  assert.equal(before_.cash.set.applied_to_all_points, true);
  const janPoint = before_.cash.points.find((x) => x.as_of === "2026-01-31");
  assert.equal(BigInt(janPoint.value_cents), BigInt(rm(1000)));

  // A SECOND VERSION, effective mid-series, adds the second bank account.
  const v2 = await publish(ALICE(), client,
    members(accounts, [CHART.bank, "bank_registry"], [CHART.bank2, "bank_registry"]),
    { effectiveFrom: "2026-03-01" });
  assert.equal(v2.revision, 2);

  // The MARCH read resolves v2 and applies it to ALL SIX points; the earlier points fall outside
  // v2's window, which is DISCLOSED rather than silently recomputed under a third membership.
  const after_ = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(after_.cash.set.revision, 2);
  assert.equal(after_.cash.set.applied_to_all_points, true);
  assert.equal(after_.cash.coverage, "partial");
  assert.equal(after_.cash.coverage_reason, "cash_set_version_changed_in_series");

  // AND THE HISTORIC READ IS NOT RETRO-CHANGED: a February read still resolves v1.
  const feb = await pack(CAROL(), client, { month: "2026-02-01" });
  assert.equal(feb.cash.set.revision, 1);
  assert.equal(BigInt(feb.cash.value_cents), BigInt(rm(1000)), "v2's extra member leaked into a February read");
});

// ===========================================================================================
// AC3 — THE PERIOD, THE EXCLUSION, AND THE HISTORY IT CANNOT SEE.
// ===========================================================================================

test("p660.pack.future_as_of_refused / month_not_first_day_refused — both are CLR10 caller defects with nothing computed", async (t) => {
  if (await gate(t)) return;
  const { client } = await financialClient(ALICE(), "refuse");

  const e1 = await assertRaises(CLR10,
    () => pack(CAROL(), client, { asOf: "2099-01-01" }), "an as-of in the future");
  assert.equal(reasonOf(e1), "as_of_in_future", "a future as-of must be a REFUSAL, not a silent clamp");

  const e2 = await assertRaises(CLR10,
    () => pack(CAROL(), client, { month: "2026-03-15" }), "a month that is not a first day");
  assert.equal(reasonOf(e2), "month_not_first_day");

  const e3 = await assertRaises(CLR10,
    () => pack(CAROL(), client, { asOf: "2026-02-10", month: "2026-03-01" }), "an as-of outside the month");
  assert.equal(reasonOf(e3), "as_of_outside_month");

  const e4 = await assertRaises(CLR10, () => pack(CAROL(), null), "a null client");
  assert.equal(reasonOf(e4), "invalid_client");
});

test("p660.pack.closing_transfer_excluded + unmarked_history_no_false_positive — the close entry is out of profit, and a year-end CORRECTION is in", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "ct");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-03", lines: sale(rm(1000)) });
  // The closing transfer: income debited to retained earnings, marked as BOTH facts.
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-31", memo: "year-end close",
    lines: [{ code: CHART.sales, debit: rm(1000) }, { code: CHART.retained, credit: rm(1000) }],
    flags: { is_year_end: true, closing_transfer: true } });
  // A year-end revenue CORRECTION: is_year_end TRUE, closing_transfer FALSE. 0016:45-49 names this
  // exact row as the reason the predicate must be the PAIR.
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-31", memo: "year-end correction",
    lines: sale(rm(120)), flags: { is_year_end: true } });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  // 1000 + 120 of income; the close's RM1,000 debit to sales is EXCLUDED, so income is not 120.
  assert.equal(BigInt(p.income.value_cents), BigInt(rm(1120)), "the closing transfer deflated income");
  assert.equal(BigInt(p.profit.value_cents), BigInt(rm(1120)));
  // THE DETECTOR DID NOT FIRE. A plain is_year_end correction carries no close_receipt_id.
  assert.equal(p.unmarked_closing_entries, 0);
  assert.notEqual(p.profit.coverage_reason, "closing_transfer_unmarked_history");
  assert.equal(p.profit.coverage, "ok");
  // Cash is untouched by the exclusion — a balance-sheet balance counts every approved line.
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(1120)));
});

test("p660.pack.unmarked_history_partial — an approved entry carrying close_receipt_id but closing_transfer=false drives coverage=partial, and is NOT also excluded", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "unmarked");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-03", lines: sale(rm(900)) });
  // The PRE-0120 shape: a real close entry that stayed at closing_transfer = false "forever"
  // (0120:518-521). It is detectable ONLY through close_receipt_id (0056:3010-3024).
  const stale = await postEntry(ALICE(), BOB(), { client, date: "2026-03-30", memo: "pre-0120 close",
    lines: [{ code: CHART.sales, debit: rm(900) }, { code: CHART.retained, credit: rm(900) }],
    flags: { is_year_end: true } });
  await stampPreFixCloseReceipt(stale, { client, firm: FIRM_A(), actor: ALICE() });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(p.unmarked_closing_entries, 1);
  assert.equal(p.profit.coverage, "partial");
  assert.equal(p.profit.coverage_reason, "closing_transfer_unmarked_history");
  // THE NUMBER STAYS, AND IT IS THE ONE THE ESTATE'S ONE PREDICATE PRODUCES. The detected row is
  // NOT also excluded: a second, wider exclusion inside one read would make two reads of one
  // ledger disagree. 900 in, 900 debited back out by the unmarked close = 0.
  assert.equal(BigInt(p.income.value_cents), BigInt(0));
  assert.equal(p.profit.status, "ok", "the read still answers — it discloses rather than refuses");
  assert.notEqual(p.profit.value_cents, null);
});

test("p660.pack.reversal_and_negative_not_clamped — a reversal and a negative correction each move profit by their SIGNED amount", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "signs");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-05", lines: sale(rm(1000)) });
  // A correction that REVERSES the sale's direction: Dr sales / Cr bank.
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-06", memo: "correction",
    lines: [{ code: CHART.sales, debit: rm(1300) }, { code: CHART.bank, credit: rm(1300) }] });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  // Income is NEGATIVE, and that is the honest answer. A greatest(x,0) clamp anywhere would print
  // RM 0.00 for a month the books say went backwards.
  assert.equal(BigInt(p.income.value_cents), BigInt(rm(-300)));
  assert.equal(BigInt(p.profit.value_cents), BigInt(rm(-300)));
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(-300)));
  const src = await rootQuery(
    "select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace "
    + "where n.nspname = 'clara' and p.proname = 'get_client_financial_pack'");
  assert.equal(src.rows[0].prosrc.includes("greatest("), false, "the pack's body carries a clamp");
});

// ===========================================================================================
// AC4 — THE COMPARISON, IN THE DOOR, ONCE.
// ===========================================================================================

test("p660.pack.mtd_comparison_capped — a 31-day month-to-date compares against the prior month CAPPED at its own last day", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "cap");
  await postEntry(ALICE(), BOB(), { client, date: "2026-02-27", lines: sale(rm(400)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-20", lines: sale(rm(700)) });
  await publishBank(client, accounts);

  // March has 31 days and February 2026 has 28. An as-of of 2026-03-31 compares against
  // 2026-02-01..2026-02-28, never a date that does not exist.
  const p = await pack(CAROL(), client, { asOf: "2026-03-31", month: "2026-03-01" });
  assert.equal(p.profit.comparison.period.start, "2026-02-01");
  assert.equal(p.profit.comparison.period.end, "2026-02-28");
  assert.equal(BigInt(p.profit.comparison.value_cents), BigInt(rm(400)));
  assert.equal(BigInt(p.profit.value_cents), BigInt(rm(700)));
  assert.equal(BigInt(p.profit.comparison.delta_cents), BigInt(rm(300)));
  assert.equal(Number(p.profit.comparison.delta_pct), 75);
  // Balances compare with the PRECEDING MONTH-END, not the prior period's whole interval.
  assert.equal(p.cash.comparison.period.end, "2026-02-28");
});

test("p660.pack.zero_denominator + sign_change — delta_pct is NULL on a zero comparison (the amount is still shown), and a profit/loss transition is named", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "delta");
  // February: a LOSS of RM1,000. March: a PROFIT of RM500.
  await postEntry(ALICE(), BOB(), { client, date: "2026-02-10", lines: spend(rm(1000)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(500)) });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(BigInt(p.profit.value_cents), BigInt(rm(500)));
  assert.equal(BigInt(p.profit.comparison.value_cents), BigInt(rm(-1000)));
  assert.equal(p.profit.comparison.sign_change, true, "a profit/loss transition was not named");
  assert.notEqual(p.profit.comparison.delta_cents, null, "both amounts are present on a sign change");

  // INCOME's own comparison has a ZERO denominator (February had no income at all).
  assert.equal(BigInt(p.income.comparison.value_cents), BigInt(0));
  assert.equal(p.income.comparison.delta_pct, null, "a percentage against zero is not a number");
  assert.equal(BigInt(p.income.comparison.delta_cents), BigInt(rm(500)), "the AMOUNT is still shown");
});

// ===========================================================================================
// AC5 / AC6 — THE SERIES AND THE COMPOSITION THE FACE DRAWS.
// ===========================================================================================

test("p660.pack.series_six_months — six calendar months ending in the selected month, the current one labelled partial with its exact as-of", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "series");
  await postEntry(ALICE(), BOB(), { client, date: "2026-01-10", lines: sale(rm(100)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-10", lines: sale(rm(300)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-25", lines: spend(rm(50)) });
  await publishBank(client, accounts);

  const whole = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(whole.series.length, 6);
  assert.deepEqual(whole.series.map((s) => s.month),
    ["2025-10-01", "2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01", "2026-03-01"]);
  const march = whole.series.at(-1);
  assert.equal(march.partial, false, "a whole past month is not partial");
  assert.equal(march.as_of, "2026-03-31");
  assert.equal(BigInt(march.income_cents), BigInt(rm(300)));
  assert.equal(BigInt(march.expense_cents), BigInt(rm(50)));
  assert.equal(BigInt(march.profit_cents), BigInt(rm(250)));

  // A PART-MONTH READ SAYS SO, and carries the exact date it stops at.
  const partial = await pack(CAROL(), client, { asOf: "2026-03-15", month: "2026-03-01" });
  const marchPartial = partial.series.at(-1);
  assert.equal(marchPartial.partial, true);
  assert.equal(marchPartial.as_of, "2026-03-15");
  assert.equal(BigInt(marchPartial.expense_cents), BigInt(0), "the 25th is after the as-of");
});

test("p660.pack.composition_bounded — composition rows carry an entry id that addresses ?entry=, and the caps report themselves", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "comp");
  for (let i = 1; i <= 22; i++) {
    await postEntry(ALICE(), BOB(), { client, date: `2026-03-${String(i).padStart(2, "0")}`,
      memo: `sale ${i}`, lines: sale(rm(10 + i)) });
  }
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  const bank = p.cash.composition.find((x) => x.account_code === CHART.bank);
  assert.equal(bank.entries_total, 22);
  assert.equal(bank.entries_truncated, true, "22 entries exceed the 20-per-account cap");
  assert.equal(bank.entries.length, 20);
  for (const row of bank.entries) {
    assert.match(String(row.entry_id), /^[0-9a-f-]{36}$/, "an entry row carries no addressable id");
    assert.ok(row.posting_date && row.amount_cents !== undefined);
  }
  // Every id addresses a REAL entry of this client — the link /clients/<id>/journals?entry=<id>
  // resolves, so the drilldown is not a dead address.
  const ids = bank.entries.map((r) => r.entry_id);
  const live = await rootQuery(
    "select count(*)::int n from clara.journal_entries where client_id = $1 and id = any($2::uuid[])",
    [client, ids]);
  assert.equal(live.rows[0].n, ids.length);
  // Opening / movement / closing reconcile for the period.
  assert.equal(BigInt(bank.opening_cents) + BigInt(bank.movement_cents), BigInt(bank.closing_cents));
});

test("p660.pack.empty_population_not_zero — a complete read over an empty population is ok + 0 + no_posted_entries", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "empty");
  // A client with NO approved entry and NO finalized seed has no books start at all, so its first
  // version is stamped at today's MYT date -- which is exactly why this cell reads MONTH-TO-DATE.
  // A historic month would correctly answer cash_set_unpublished (the set did not cover it), and
  // that is a different sentence from the one this cell is about.
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client);
  assert.equal(p.profit.status, "ok", "an empty population is a COMPLETE read, not an unknown one");
  assert.equal(BigInt(p.profit.value_cents), BigInt(0));
  assert.equal(p.profit.coverage, "ok");
  // THE ONE CASE WHERE A REASON ACCOMPANIES `ok`: so the face can say "no posted entries yet"
  // rather than printing RM 0.00 as if it were a fact about the money.
  assert.equal(p.profit.coverage_reason, "no_posted_entries");
  assert.equal(p.cash.status, "ok");
  assert.equal(BigInt(p.cash.value_cents), BigInt(0));
  assert.equal(p.cash.coverage_reason, "no_posted_entries");
  assert.equal(p.coverage_floor, null, "no approved entry and no finalized seed means no floor at all");
});

// ===========================================================================================
// THE PUBLISH DOOR.
// ===========================================================================================

test("p660.pack.publish_floor_admin — a bookkeeper is refused CLR04 and the read is unaffected", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "floor2");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-08", lines: sale(rm(100)) });

  await assertRaises(CLR04,
    () => publish(BOB(), client, members(accounts, [CHART.bank, "bank_registry"])),
    "a bookkeeper publishes a cash account set");
  await assertRaises(CLR04,
    () => publish(CAROL(), client, members(accounts, [CHART.bank, "bank_registry"])),
    "a viewer publishes a cash account set");

  const rows = await rootQuery(
    "select count(*)::int n from clara.cash_account_set_versions where client_id = $1", [client]);
  assert.equal(rows.rows[0].n, 0, "a refused publish wrote a version anyway");
  // AND THE READ STILL ANSWERS for the same bookkeeper and the same viewer.
  assert.equal((await pack(BOB(), client)).cash.coverage_reason, "cash_set_unpublished");
  assert.equal((await pack(CAROL(), client)).cash.coverage_reason, "cash_set_unpublished");
});

test("p660.pack.publish_idempotent — a byte-identical replay returns the same version and mints no second revision; a different payload under one key is CLR10", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "idem");
  const key = opk("p660-idem");
  const one = ["bank_registry"];
  const first = await publish(ALICE(), client, members(accounts, [CHART.bank, ...one]), { opKey: key });
  const replay = await publish(ALICE(), client, members(accounts, [CHART.bank, ...one]), { opKey: key });
  assert.equal(replay.cash_account_set_version_id, first.cash_account_set_version_id);
  assert.equal(replay.revision, 1);

  const rows = await rootQuery(
    "select count(*)::int n from clara.cash_account_set_versions where client_id = $1", [client]);
  assert.equal(rows.rows[0].n, 1, "a replay minted a second revision");

  await assertRaises(CLR10, () => publish(ALICE(), client,
    members(accounts, [CHART.bank, "bank_registry"], [CHART.bank2, "bank_registry"]), { opKey: key }),
  "one op_key, two payloads");
});

test("p660.pack.publish_members_malformed — each named refusal fires with its own detail.reason and writes nothing", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "malformed");
  const cases = [
    ["members_malformed", "\"not-an-array\""],
    ["cash_set_empty", "[]"],
    ["members_malformed", JSON.stringify([{ member_reason: "bank_registry" }])],
    ["members_malformed", JSON.stringify([{ account_id: "nope", member_reason: "bank_registry" }])],
    ["member_reason_invalid", JSON.stringify([{ account_id: accounts[CHART.bank], member_reason: "looks_like_cash" }])],
    ["duplicate_account", JSON.stringify([
      { account_id: accounts[CHART.bank], member_reason: "bank_registry" },
      { account_id: accounts[CHART.bank], member_reason: "declared_cash" }])],
    ["account_not_of_client", JSON.stringify([
      { account_id: "00000000-0000-4000-8000-0000000000aa", member_reason: "declared_cash" }])],
  ];
  for (const [reason, payload] of cases) {
    const err = await assertRaises(CLR10, () => humanQuery(ALICE(),
      "select clara.publish_client_cash_account_set(p_client => $1::uuid, p_members => $2::jsonb, "
      + "p_effective_from => null::date, p_op_key => $3::text) as result",
      [client, payload, opk("p660-bad")]), `publish with ${reason}`);
    assert.equal(reasonOf(err), reason, `payload ${payload} named ${reasonOf(err)}`);
  }
  const rows = await rootQuery(
    "select count(*)::int n from clara.cash_account_set_versions where client_id = $1", [client]);
  assert.equal(rows.rows[0].n, 0, "a refused publish wrote a version anyway");

  await assertRaises(CLR11, () => publish(ALICE(), "00000000-0000-4000-8000-0000000000ab",
    [{ account_id: accounts[CHART.bank], member_reason: "bank_registry" }]),
  "publish against a client of another firm");
});

test("p660.pack.publish_first_version_covers_history — a null effective_from is stamped at the books' start, and a first version dated after it is refused", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "cover");
  await postEntry(ALICE(), BOB(), { client, date: "2026-01-07", lines: sale(rm(250)) });

  // THE TRAP: a first version starting in March would make January and February unreadable.
  const err = await assertRaises(CLR10, () => publish(ALICE(), client,
    members(accounts, [CHART.bank, "bank_registry"]), { effectiveFrom: "2026-03-01" }),
  "a first version dated after the books start");
  assert.equal(reasonOf(err), "first_version_after_books_start");

  const ok = await publishBank(client, accounts);
  assert.equal(ok.effective_from, "2026-01-07", "a null effective_from did not stamp the books' start");
  const p = await pack(CAROL(), client, { month: "2026-01-01" });
  assert.equal(p.cash.status, "ok");
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(250)));

  // A LATER version must state its date and must move forward.
  const e2 = await assertRaises(CLR10,
    () => publish(ALICE(), client, members(accounts, [CHART.bank, "bank_registry"], [CHART.bank2, "bank_registry"])),
    "a later version with no date");
  assert.equal(reasonOf(e2), "effective_from_required");
  const e3 = await assertRaises(CLR10, () => publish(ALICE(), client,
    members(accounts, [CHART.bank, "bank_registry"], [CHART.bank2, "bank_registry"]),
    { effectiveFrom: "2026-01-07" }), "a later version that does not move forward");
  assert.equal(reasonOf(e3), "effective_from_not_after_current");
});

test("p660.pack.publish_petty_cash_is_a_human_declaration — petty cash enters ONLY by a stated reason, and it reaches book cash", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "petty");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-04", lines: sale(rm(600)) });
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-05",
    lines: [{ code: CHART.petty, debit: rm(80) }, { code: CHART.bank, credit: rm(80) }] });

  // The proposal read offered it NOWHERE (that cell is above); a human declares it here.
  await publish(ALICE(), client,
    members(accounts, [CHART.bank, "bank_registry"], [CHART.petty, "declared_petty_cash"]));

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(600)), "600 in the bank, of which 80 is now in the tin");
  const tin = p.cash.composition.find((x) => x.account_code === CHART.petty);
  assert.equal(tin.member_reason, "declared_petty_cash", "the composition cannot say WHY this is cash");
  assert.equal(BigInt(tin.closing_cents), BigInt(rm(80)));
});

// ===========================================================================================
// AC8 — THE FLOOR, THE ORACLE AND THE REACH, under real least-privileged roles.
//
// This AC is DATABASE-ONLY: 0232 writes no runtime module and enqueues no Work, so the
// durable-execution half of "prove the declared outcome through the production-facing read"
// reduces to the transaction/access-boundary half, which is what these three cells are.
// ===========================================================================================

test("p660.pack.floor_viewer — a viewer reads the pack and reads NOTHING they could not already SELECT", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "viewer");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-12", lines: sale(rm(1500)) });
  await publishBank(client, accounts);

  const p = await pack(CAROL(), client, { month: "2026-03-01" });
  assert.equal(p.cash.status, "ok");
  assert.equal(BigInt(p.cash.value_cents), BigInt(rm(1500)));

  // NO AGGREGATION BYPASS. The same viewer, with a plain SELECT through the table grant
  // (0003:522-525) behind the firm-only RLS predicate (0003:514), reaches the identical number —
  // so the pack hands a viewer nothing new, which is the whole footing of its viewer floor.
  const direct = await humanQuery(CAROL(),
    `select coalesce(sum(jl.debit_cents - jl.credit_cents), 0)::bigint as v
       from clara.journal_lines jl
       join clara.journal_entries je on je.id = jl.entry_id
      where jl.client_id = $1 and jl.account_code = $2 and je.status = 'approved'`,
    [client, CHART.bank]);
  assert.equal(BigInt(direct.rows[0].v), BigInt(p.cash.value_cents));
  // And the proposal read floors at viewer too — the surface that says which accounts COULD be
  // cash is not an admin-only secret.
  assert.ok(Array.isArray((await propose(CAROL(), client)).candidates));
});

test("p660.pack.cross_firm — another firm's owner and an invented client id answer IDENTICALLY", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "cross");
  await postEntry(ALICE(), BOB(), { client, date: "2026-03-14", lines: sale(rm(4200)) });
  await publishBank(client, accounts);

  const theirs = await pack(DAVE(), client, { month: "2026-03-01" });
  const invented = await pack(DAVE(), "00000000-0000-4000-8000-0000000000aa", { month: "2026-03-01" });
  const shape = (p) => ({
    cs: p.cash.status, cr: p.cash.coverage_reason, cv: p.cash.value_cents, set: p.cash.set,
    ps: p.profit.status, pr: p.profit.coverage_reason, pv: p.profit.value_cents,
    floor: p.coverage_floor, series: p.series, comp: p.cash.composition,
  });
  // NO ORACLE IN EITHER DIRECTION: an id that names nothing and an id that names somebody else's
  // client must be indistinguishable, or the door tells firm B that firm A holds this client.
  assert.deepEqual(shape(theirs), shape(invented));
  assert.equal(theirs.cash.coverage_reason, "client_not_visible");
  assert.equal(theirs.cash.value_cents, null, "a cross-firm read reported a number");

  // The proposal read is no oracle either.
  const pTheirs = await propose(DAVE(), client);
  const pInvented = await propose(DAVE(), "00000000-0000-4000-8000-0000000000aa");
  assert.deepEqual(pTheirs.candidates, pInvented.candidates);
  assert.deepEqual(pTheirs.candidates, []);
});

test("p660.pack.no_agent_reach — clara_runtime, clara_agent_ro and every clara_wake_* role hold NO EXECUTE on ANY of the three doors, asserted one by one BY NAME", async (t) => {
  if (await gate(t)) return;
  const doors = [
    "clara.get_client_financial_pack(uuid,date,date)",
    "clara.propose_client_cash_accounts(uuid)",
    "clara.publish_client_cash_account_set(uuid,jsonb,date,text)",
  ];
  const roles = await rootQuery(
    "select rolname from pg_roles where rolname in ('clara_runtime','clara_agent_ro') "
    + "or rolname like 'clara\\_wake\\_%' order by 1");
  assert.ok(roles.rows.length >= 3, "the model-lane roles this cell is about are absent from the cluster");

  for (const door of doors) {
    // A TWO-DOOR ASSERTION WOULD PASS WHILE THE PROPOSAL READ STOOD OPEN, and the proposal read is
    // the surface that says which accounts could be cash. Each door is named on its own.
    for (const { rolname } of roles.rows) {
      const r = await rootQuery(
        "select has_function_privilege($1, $2::regprocedure, 'execute') as ok", [rolname, door]);
      assert.equal(r.rows[0].ok, false, `${rolname} holds EXECUTE on ${door}`);
    }
    const pub = await rootQuery(
      "select has_function_privilege('public', $1::regprocedure, 'execute') as ok", [door]);
    assert.equal(pub.rows[0].ok, false, `PUBLIC holds EXECUTE on ${door}`);
    const auth = await rootQuery(
      "select has_function_privilege('clara_authenticated', $1::regprocedure, 'execute') as ok", [door]);
    assert.equal(auth.rows[0].ok, true, `clara_authenticated cannot execute ${door}`);
  }

  // AND NO MODEL LANE REACHES THE TWO RELATIONS EITHER.
  const grants = await rootQuery(
    "select grantee, table_name, privilege_type from information_schema.role_table_grants "
    + "where table_schema = 'clara' and table_name in "
    + "('cash_account_set_versions','cash_account_set_members') and grantee <> 'clara_fn_owner' "
    + "order by 1,2,3");
  for (const g of grants.rows) {
    assert.equal(g.grantee, "clara_authenticated", `${g.grantee} reaches clara.${g.table_name}`);
    assert.equal(g.privilege_type, "SELECT", `clara_authenticated holds ${g.privilege_type} on clara.${g.table_name}`);
  }
});

test("p660.census.pins_unmoved — the five pinned dependency bodies are byte-identical after 0232", async (t) => {
  if (await gate(t)) return;
  const PINS = {
    "clara.trial_balance_as_of(uuid,date)":
      "51f18cba8b3d1fb4e225b83773803ea340b7b492a7647d50304589a86922c63c",
    "clara._metric_selector_account_ids(uuid,jsonb)":
      "c8f32cd986403f94c0943e147a1ffe207b7e770843b9b6fbb2b9765cec04b1e9",
    "clara.create_account_set_v1(uuid,text,text,jsonb,boolean,date,text)":
      "25f9274792b14c054f1633e4518f689084a8e6548d10e3079cec4e760fd28495",
    "clara.finalize_close(uuid,text,text)":
      "59ebaa4fe7ff49c90ff6f3d5c9a73d7c6b853b042368f0c20b8c2ce2c8173bf4",
    "clara.reopen_fiscal_year(uuid,text,jsonb,text,text)":
      "3c1c24ee1c69c84538fd8ce7254955ee01045a3027b4942c171090b7e4820fd5",
  };
  for (const [sig, expected] of Object.entries(PINS)) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') as sha from pg_proc "
      + "where oid = $1::regprocedure", [sig]);
    assert.equal(r.rows[0].sha, expected, `${sig} moved — 0232 claims to recut nothing`);
  }
  // 0232 installs exactly four functions and NO overload of any of them.
  const census = await rootQuery(
    "select p.proname, count(*)::int n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace "
    + "where ns.nspname = 'clara' and p.proname = any($1) group by 1 order by 1",
    [["get_client_financial_pack", "propose_client_cash_accounts",
      "publish_client_cash_account_set", "_tf_cash_account_set_integrity"]]);
  assert.equal(census.rows.length, 4);
  for (const row of census.rows) assert.equal(row.n, 1, `clara.${row.proname} is overloaded`);
});

test("p660.pack.cash_set_members_sealed — a member cannot be added to a version after its creating transaction", async (t) => {
  if (await gate(t)) return;
  const { client, accounts } = await financialClient(ALICE(), "sealed");
  const v = await publishBank(client, accounts);
  // The integrity trigger is the structural half of "the six points share ONE membership": a
  // version whose members can still change is not a version.
  await assertRaises("CLR08", () => rootQuery(
    "insert into clara.cash_account_set_members(cash_account_set_version_id, firm_id, client_id, "
    + "account_id, ordinal, member_reason) values ($1, $2, $3, $4, 9, 'declared_cash')",
    [v.cash_account_set_version_id, FIRM_A(), client, accounts[CHART.petty]]),
  "adding a member after the version's transaction");
});
